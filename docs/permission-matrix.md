# Permission Matrix

Project 08: Employee Attendance and Payroll Processing System (CSENG 407)

Enforced by Row Level Security (RLS) policies in `supabase/migrations/001_schema.sql`.
**C** create, **R** read, **U** update, **D** delete, **R(own)** read only own rows, **-** no access.

## Table access

| Table | Admin | HR | Payroll | Employee |
|---|---|---|---|---|
| departments, positions, shifts | CRUD | CRUD | R | R |
| employees | CRUD | CRUD | R | R(own) |
| profiles | CRUD | R(own) | R(own) | R(own) |
| attendance | CRUD | CRUD | R | R(own) |
| pay_rates | CRUD | - | CRUD | - |
| allowance_types, employee_allowances | CRUD | - | CRUD | - |
| deduction_types | CRUD | - | CRUD | - |
| pay_periods | CRUD | R | CRUD | R |
| payslips | R | - | R | R(own) |
| payslip_lines | R | - | R | R(own) |
| audit_log | R | - | - | - |

Payslips and payslip lines are never written directly by any role. They are created only by the function `calculate_payroll`.
Anonymous (not logged in) users have no access to any table.

## Operations

| Operation | Admin | HR | Payroll | Employee |
|---|---|---|---|---|
| Run payroll (`calculate_payroll`) | Yes | No | Yes | No |
| Record or edit attendance | Yes | Yes | No | No |
| Manage employees | Yes | Yes | No | No |
| Change pay rates, allowances, deductions | Yes | No | Yes | No |
| View own payslips | Yes | No | Yes | Yes |
| Read the audit log | Yes | No | No | No |

## Evidence

Results of the allowed and denied tests are produced by `supabase/tests/01_security_tests.sql`
(21 tests) and `tests.rollback_demo()`. Screenshots are stored in `docs/screenshots/`.