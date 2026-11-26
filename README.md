# Employee Attendance and Payroll Processing System

CSENG 407 (Relational Database Management System), Project 08
William V. S. Tubman University, Dept. of Computer Science and Engineering

**Student:** [Your Name] | **ID:** [Student ID]
**Lecturer:** Dr. Chris Gilbert

A database-driven system that records and validates daily employee attendance and uses it to calculate simulated payroll. Business rules are enforced inside PostgreSQL through constraints, triggers, an atomic payroll function and Row Level Security.

> All data in this project is synthetic. No real personal or payroll information is used.

## Status

| Phase | Status |
|---|---|
| Database schema, seed data, admin login | Done |
| Payroll function tested | Done |
| ERD, normalization, data dictionary | In progress |
| Web application (login, CRUD, dashboard) | Planned |
| Tests, backup/restore, report, slides | Planned |

## Tech stack

- **Database:** Supabase PostgreSQL
- **Authentication:** Supabase Auth
- **Security:** Row Level Security and role-based policies
- **Frontend (planned):** Next.js, TypeScript, Tailwind CSS
- **Version control:** GitHub

## Repository structure

```
supabase/migrations/   SQL schema and seed files, run in order
docs/                  ERD, project definition, screenshots
app/                   Web application (coming soon)
.env.example           Placeholder environment variables
```

## Database overview

14 tables: `departments`, `positions`, `shifts`, `employees`, `profiles`, `pay_rates`, `allowance_types`, `employee_allowances` (M:N link), `deduction_types`, `attendance`, `pay_periods`, `payslips`, `payslip_lines`, `audit_log`.

**Key rules enforced by the database**
- One attendance record per employee per day
- No attendance for future dates or terminated employees
- Pay periods cannot overlap; pay rates for one employee cannot overlap
- Payroll runs once per period and is all-or-nothing (rolls back if any employee has no pay rate)
- Net pay can never be negative
- Changes to employees, pay rates and payslips are written to an audit log

**Roles**

| Role | Access |
|---|---|
| admin | Everything, including the audit log |
| hr | Employees, departments, positions, shifts, attendance. Cannot see pay data |
| payroll | Pay rates, allowances, deductions, periods, payslips. Runs payroll |
| employee | Own profile, attendance and payslips only |

## Setup

1. Create a Supabase project.
2. Open **SQL Editor** and run the files in `supabase/migrations/` in order:
   1. `001_schema.sql`
   2. `002_seed.sql`
3. In **Authentication → Users**, create a login for yourself.
4. Make that login an admin (replace the email):
   ```sql
   insert into profiles (user_id, role)
   select id, 'admin' from auth.users where email = 'your-email@example.com'
   on conflict (user_id) do update set role = 'admin';
   ```
5. Copy `.env.example` to `.env.local` and fill in your project URL and anon key (when the app is added).

## Try the payroll function

```sql
select calculate_payroll(id) from pay_periods where label = 'Nov 2026 Cycle 1';
select * from payslips;
```

Running it a second time for the same period is rejected.

## Security notes

- Never commit `.env.local`, passwords or the Supabase service-role key.
- The browser app uses only the public anon key. Row Level Security protects the data.