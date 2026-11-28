# Concurrency, Recovery, Object-Relational Design and XML

Project 08: Employee Attendance and Payroll Processing System (CSENG 407)

## 1. Concurrency: the lost update anomaly

### The problem
When two users change the same row at the same time, one change can silently overwrite the other. PostgreSQL's default isolation level is READ COMMITTED, which does not prevent this when an application reads a value, calculates in code, and writes the result back.

Demonstration (`supabase/tests/02_concurrency_demo.sql`, two SQL Editor tabs). A department payroll budget starts at 100. Two users spend 30 and 20.

| Time | Tab 1 | Tab 2 | Budget in database |
|---|---|---|---|
| t1 | reads 100 | | 100 |
| t2 | waits | updates to 100 - 20 and commits | 80 |
| t3 | writes 100 - 30 (stale read) | | **70** |

The correct result is 50. Tab 2's spending of 20 was lost.

### Mitigations
1. **Row lock (`SELECT ... FOR UPDATE`).** Tab 1 locks the row when it reads it. Tab 2's update waits until Tab 1 commits, then applies to the new value (70 - 20 = 50). The demo's Part B shows the correct result.
2. **Atomic update.** `UPDATE budget SET remaining = remaining - 30` does the arithmetic inside one statement, so there is no read-then-write gap.
3. **Optimistic locking.** Add a version column and update `WHERE id = ? AND version = ?`. If zero rows change, someone else updated first and the application retries.
4. **SERIALIZABLE isolation** with a retry on serialization failure, when stronger guarantees are needed.

### How the project applies this
- `calculate_payroll` locks the pay period row with `SELECT ... FOR UPDATE` and then checks its status. If two payroll runs start at the same moment for the same period, the second waits, sees the status `processed`, and is rejected.
- A `UNIQUE (employee_id, period_id)` constraint on `payslips` is a second line of defence against duplicate payslips.
- Exclusion constraints on `pay_periods` and `pay_rates` make overlapping date ranges impossible even under concurrent inserts, because the database checks them atomically.

## 2. Backup and recovery

### Levels of protection

| Level | What it is | Used here |
|---|---|---|
| Platform backups | Supabase takes automatic daily backups (point-in-time recovery is an optional add-on) | Visible in the dashboard under Database, Backups |
| Logical backup | A copy of table data made with `pg_dump` or SQL | Demonstrated below |
| Full rebuild | Recreate everything from versioned migrations and seeds in Git | Documented below |

### Demonstration: backup, disaster, restore (`supabase/tests/03_backup_restore_demo.sql`)
1. **Backup.** The attendance table is copied to a backup schema, and its row count and an MD5 checksum are recorded.
2. **Disaster.** All attendance rows are deleted. The app dashboard shows 0 attendance records.
3. **Restore.** The rows are inserted back from the backup copy.
4. **Verify.** The row count and checksum after the restore equal the values recorded before, which proves the data is identical.

### Full rebuild from versioned files
Because every change is a numbered migration in Git, the whole database can be rebuilt on an empty Supabase project or any PostgreSQL server:
1. Run `001_schema.sql`.
2. Run `002_seed.sql`.
3. Run `003_remove_redundant_department.sql`.
4. Create the logins in Authentication, then run `supabase/tests/00_test_setup.sql` to assign roles.
5. Put the project URL and publishable key in `.env.local`.

### Limitations
- Seed data is synthetic, so a rebuild restores the structure and sample data, not data entered later. For that, platform backups or `pg_dump` are needed.
- Logins live in Supabase Auth and are not part of the seed files, so they must be recreated.
- Secrets are never stored in the repository and must be re-entered on a new project.

## 3. Relational versus object-relational design

| Aspect | Relational (what this project uses) | Object-relational |
|---|---|---|
| Data model | Tables of rows with atomic columns | Tables plus user-defined types, nested structures, arrays and inheritance |
| Relationships | Foreign keys and joins | Foreign keys, plus references and nested collections inside a row |
| Normalization | Strongly encouraged (1NF to BCNF) | Allows non-atomic values (for example an array of lines in one column) |
| Querying | Standard SQL joins | SQL extended with type-specific operators and methods |
| Integrity | Constraints enforce the rules | Same, plus rules on custom types |
| Mismatch with application objects | Mapping between objects and tables is needed | Smaller mismatch, but less portable and harder to analyze |
| Best fit | Transactional systems such as payroll | Complex or nested data such as CAD, media or documents |

PostgreSQL is an object-relational database. This project already uses some of its object-relational features while keeping a relational design:
- `daterange` values inside exclusion constraints to prevent overlapping periods and rates
- `jsonb` columns in `audit_log` to store the old and new version of any row
- The native `xml` type (section 4)
- Custom check constraints and generated identity columns

An object-relational design could store a payslip's lines as an array of a composite type inside the `payslips` row. This was rejected because payroll needs reporting across lines, such as totals by deduction type. A separate `payslip_lines` table keeps those queries simple, keeps the data in 3NF, and lets constraints validate each line. Payroll is a transactional, integrity-critical domain, so the relational model is the better fit, with object-relational features used only where they add value.

## 4. XML and XPath

PostgreSQL supports XML natively (`xml` type, `xmlelement`, `xmlagg`, `xpath`, `xmlexists`), so a real demonstration was possible instead of a conceptual one. The script `supabase/queries/02_xml_demo.sql` builds one XML document per payslip and queries it.

### Sample document (illustrative values)

```xml
<payslip id="1">
  <employee no="EMP0003">Samuel Weah</employee>
  <period>Nov 2026 Cycle 1</period>
  <hours><regular>80.00</regular><overtime>4.00</overtime></hours>
  <gross>1400.00</gross>
  <allowances>50.00</allowances>
  <deductions>206.00</deductions>
  <net>1244.00</net>
  <line type="earning"><description>Regular pay</description><amount>1280.00</amount></line>
  <line type="deduction"><description>Income Tax</description><amount>140.00</amount></line>
</payslip>
```

### XPath examples

| Goal | XPath |
|---|---|
| Net pay of every payslip | `/payslip/net/text()` |
| Select by attribute | `/payslip/employee/@no` |
| Only deduction lines | `/payslip/line[@type="deduction"]/description/text()` |
| Payslips above a threshold | `/payslip[net > 1000]` |

### Why XML is not used for the core design
XML is useful for exchanging payslips with other systems and for document-style storage. For daily operations the relational tables give stronger integrity (types, keys, constraints), indexing and joins. XML is therefore treated as an export and exchange format in this project, generated from the relational data.