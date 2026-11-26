# Data Dictionary

Project 08: Employee Attendance and Payroll Processing System (CSENG 407)

Database: Supabase PostgreSQL. Reflects migrations 001, 002 and 003.
Key: **PK** primary key, **FK** foreign key, **UK** unique, **NN** not null.

## 1. departments

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Department identifier |
| name | text | NN, UK | Department name |
| created_at | timestamptz | NN, default now() | Creation time |

## 2. positions

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Position identifier |
| title | text | NN, UK | Job title |
| department_id | bigint | NN, FK → departments(id), ON DELETE RESTRICT | Department the position belongs to |
| created_at | timestamptz | NN, default now() | Creation time |

## 3. shifts

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Shift identifier |
| name | text | NN, UK | Shift name (Morning, Day, Evening) |
| start_time | time | NN | Shift start |
| end_time | time | NN, CHECK start_time <> end_time | Shift end |
| grace_minutes | int | NN, default 10, CHECK 0 to 60 | Minutes allowed after start before counted late |

## 4. employees

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Employee identifier |
| employee_no | text | NN, UK, CHECK format `EMP` + 4 digits | Staff number |
| first_name | text | NN | First name |
| last_name | text | NN | Last name |
| email | text | NN, UK, CHECK valid email pattern | Work email |
| position_id | bigint | NN, FK → positions(id) | Job position (department derived from it) |
| shift_id | bigint | NN, FK → shifts(id) | Assigned shift |
| hire_date | date | NN, CHECK ≤ current date | Date hired |
| status | text | NN, default 'active', CHECK in (active, on_leave, terminated) | Employment status |
| user_id | uuid | UK, FK → auth.users(id), ON DELETE SET NULL | Linked Supabase login (optional) |
| created_at | timestamptz | NN, default now() | Creation time |

## 5. profiles

| Column | Type | Constraints | Description |
|---|---|---|---|
| user_id | uuid | PK, FK → auth.users(id), ON DELETE CASCADE | Supabase login |
| role | text | NN, default 'employee', CHECK in (admin, hr, payroll, employee) | Application role |
| created_at | timestamptz | NN, default now() | Creation time |

## 6. pay_rates

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Rate identifier |
| employee_id | bigint | NN, FK → employees(id), ON DELETE CASCADE | Employee |
| hourly_rate | numeric(10,2) | NN, CHECK > 0 | Pay per hour |
| overtime_multiplier | numeric(3,2) | NN, default 1.50, CHECK ≥ 1 | Overtime factor |
| effective_from | date | NN | First day the rate applies |
| effective_to | date | CHECK null or ≥ effective_from | Last day (null = open ended) |

Extra constraint: exclusion constraint prevents overlapping date ranges for the same employee.

## 7. allowance_types

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Allowance type identifier |
| name | text | NN, UK | Allowance name (Transport, Housing) |
| taxable | boolean | NN, default true | Whether the allowance is taxable |

## 8. employee_allowances (associative table, M:N)

| Column | Type | Constraints | Description |
|---|---|---|---|
| employee_id | bigint | PK part, FK → employees(id), ON DELETE CASCADE | Employee |
| allowance_type_id | bigint | PK part, FK → allowance_types(id) | Allowance type |
| amount | numeric(10,2) | NN, CHECK ≥ 0 | Amount per pay period |

Composite primary key: (employee_id, allowance_type_id).

## 9. deduction_types

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Deduction identifier |
| name | text | NN, UK | Deduction name |
| method | text | NN, CHECK in (percent, fixed) | How the value is applied |
| value | numeric(10,2) | NN, CHECK ≥ 0 | Percent of gross or fixed amount |
| active | boolean | NN, default true | Whether payroll applies it |

Table check: if method is percent, value must be ≤ 100.

## 10. attendance

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Attendance identifier |
| employee_id | bigint | NN, FK → employees(id), ON DELETE CASCADE | Employee |
| work_date | date | NN | Day worked |
| clock_in | timestamptz | | Time in |
| clock_out | timestamptz | CHECK null or > clock_in | Time out |
| status | text | NN, default 'present', CHECK in (present, late, absent, leave) | Day status |
| note | text | | Optional remark |

Constraints: UNIQUE (employee_id, work_date); clock_out requires clock_in; present or late requires clock_in.

## 11. pay_periods

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Period identifier |
| label | text | NN, UK | Period name |
| start_date | date | NN | First day |
| end_date | date | NN, CHECK ≥ start_date | Last day |
| status | text | NN, default 'open', CHECK in (open, processed, closed) | Processing status |

Extra constraint: exclusion constraint prevents overlapping periods.

## 12. payslips

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Payslip identifier |
| employee_id | bigint | NN, FK → employees(id) | Employee |
| period_id | bigint | NN, FK → pay_periods(id) | Pay period |
| regular_hours | numeric(8,2) | NN, default 0, CHECK ≥ 0 | Regular hours |
| overtime_hours | numeric(8,2) | NN, default 0, CHECK ≥ 0 | Overtime hours |
| gross_pay | numeric(12,2) | NN, CHECK ≥ 0 | Pay before allowances and deductions |
| total_allowances | numeric(12,2) | NN, default 0, CHECK ≥ 0 | Allowances total |
| total_deductions | numeric(12,2) | NN, default 0, CHECK ≥ 0 | Deductions total |
| net_pay | numeric(12,2) | NN, CHECK ≥ 0 | Gross + allowances − deductions |
| generated_at | timestamptz | NN, default now() | Creation time |

Constraint: UNIQUE (employee_id, period_id).

## 13. payslip_lines

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Line identifier |
| payslip_id | bigint | NN, FK → payslips(id), ON DELETE CASCADE | Parent payslip |
| line_type | text | NN, CHECK in (earning, allowance, deduction) | Kind of line |
| description | text | NN | Line label |
| amount | numeric(12,2) | NN, CHECK ≥ 0 | Line amount |

## 14. audit_log

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint (identity) | PK | Log identifier |
| table_name | text | NN | Table changed |
| record_id | text | | Id of the changed row |
| action | text | NN | INSERT, UPDATE or DELETE |
| old_data | jsonb | | Row before the change |
| new_data | jsonb | | Row after the change |
| changed_by | uuid | default auth.uid() | User who made the change |
| changed_at | timestamptz | NN, default now() | Time of change |

## 15. Relationships

| Parent | Child | Cardinality |
|---|---|---|
| departments | positions | 1:N |
| positions | employees | 1:N |
| shifts | employees | 1:N |
| employees | attendance | 1:N |
| employees | pay_rates | 1:N |
| employees | payslips | 1:N |
| pay_periods | payslips | 1:N |
| payslips | payslip_lines | 1:N |
| employees and allowance_types | employee_allowances | M:N |
| auth.users | employees, profiles | 1:1 |

## 16. Indexes

| Index | Table (columns) | Reason |
|---|---|---|
| idx_attendance_date_emp | attendance (work_date, employee_id) | Payroll and reports filter by date range, then group by employee |
| idx_payslips_period | payslips (period_id) | Reports and joins by pay period |
| idx_employees_position | employees (position_id) | Foreign key joins to positions and departments |
| idx_audit_table_time | audit_log (table_name, changed_at desc) | Audit review by table and recent time |

## 17. Views, function and triggers

| Object | Type | Purpose |
|---|---|---|
| v_attendance_hours | view | Hours worked, regular (first 8h) and overtime per day |
| v_payroll_summary | view | Totals by pay period and department |
| v_absence_report | view | Days absent and late per employee and period |
| v_employee_details | view | Employee with derived department, position and shift |
| calculate_payroll(period_id) | function | Atomic payroll run, rolls back on any failure |
| app_role(), my_employee_id() | functions | Used by Row Level Security policies |
| validate_attendance | trigger (before insert/update on attendance) | Rejects future dates, terminated employees, mismatched dates |
| audit_employees, audit_pay_rates, audit_payslips | triggers | Write changes to audit_log |