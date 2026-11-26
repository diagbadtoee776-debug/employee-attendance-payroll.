# Functional Dependencies and Normalization

Project 08: Employee Attendance and Payroll Processing System (CSENG 407)

## 1. Functional dependencies

Notation: `A → B` means A determines B. `id` is the surrogate primary key of each table.

| # | Table | Functional dependency | Explanation |
|---|---|---|---|
| FD1 | employees | `employee_no → first_name, last_name, email, position_id, shift_id, hire_date, status` | The staff number identifies one employee |
| FD2 | employees | `email → employee_no` | Email is unique, so it is a candidate key |
| FD3 | positions | `title → department_id` | A job title belongs to exactly one department |
| FD4 | shifts | `name → start_time, end_time, grace_minutes` | A shift name fixes its hours |
| FD5 | attendance | `(employee_id, work_date) → clock_in, clock_out, status` | One record per employee per day |
| FD6 | pay_rates | `(employee_id, effective_from) → hourly_rate, overtime_multiplier, effective_to` | A rate starts on one date for one employee |
| FD7 | employee_allowances | `(employee_id, allowance_type_id) → amount` | One amount per employee per allowance |
| FD8 | pay_periods | `label → start_date, end_date, status` | A period label identifies its dates |
| FD9 | payslips | `(employee_id, period_id) → regular_hours, overtime_hours, gross_pay, total_allowances, total_deductions, net_pay` | One payslip per employee per period |
| FD10 | payslip_lines | `id → payslip_id, line_type, description, amount` | A line item is identified by its id |
| FD11 | payslips | `(gross_pay, total_allowances, total_deductions) → net_pay` | Net pay is calculated (see section 5) |

## 2. Normalization walkthrough

We start from a spreadsheet-style sheet that HR might keep by hand.

### Unnormalized form (UNF)

| employee_no | name | department | position | shift | shift_start | allowances | attendance |
|---|---|---|---|---|---|---|---|
| EMP0001 | Joseph Kollie | Administration | Office Manager | Day | 09:00 | Transport 50; Housing 120 | 2026-11-09 present; 2026-11-10 late |

Problem: the `allowances` and `attendance` cells hold several values each (repeating groups).

### First Normal Form (1NF): atomic values, no repeating groups

Each cell holds one value, so there is one row per employee, allowance and date. Candidate key: `(employee_no, allowance_type, work_date)`.

| employee_no | name | department | position | shift | shift_start | allowance_type | allowance_amount | work_date | status |
|---|---|---|---|---|---|---|---|---|---|
| EMP0001 | Joseph Kollie | Administration | Office Manager | Day | 09:00 | Transport | 50 | 2026-11-09 | present |
| EMP0001 | Joseph Kollie | Administration | Office Manager | Day | 09:00 | Transport | 50 | 2026-11-10 | late |
| EMP0001 | Joseph Kollie | Administration | Office Manager | Day | 09:00 | Housing | 120 | 2026-11-09 | present |
| EMP0001 | Joseph Kollie | Administration | Office Manager | Day | 09:00 | Housing | 120 | 2026-11-10 | late |

Problem: heavy redundancy. Joseph's name and the Transport amount repeat in many rows, which causes update anomalies.

### Second Normal Form (2NF): no partial dependencies

Partial dependencies on part of the key `(employee_no, allowance_type, work_date)`:

- `employee_no → name, department, position, shift, shift_start`
- `(employee_no, allowance_type) → allowance_amount`
- `(employee_no, work_date) → status`

Decomposition:

- EMPLOYEE(employee_no, name, department, position, shift, shift_start)
- EMPLOYEE_ALLOWANCE(employee_no, allowance_type, amount)
- ATTENDANCE(employee_no, work_date, status)

### Third Normal Form (3NF): no transitive dependencies

Inside EMPLOYEE there are two transitive dependencies:

- `employee_no → position → department`
- `employee_no → shift → shift_start`

Decomposition (this is the structure used in the database):

- DEPARTMENTS(id, name)
- POSITIONS(id, title, department_id)
- SHIFTS(id, name, start_time, end_time, grace_minutes)
- EMPLOYEES(id, employee_no, first_name, last_name, email, position_id, shift_id, hire_date, status)
- EMPLOYEE_ALLOWANCES(employee_id, allowance_type_id, amount) with ALLOWANCE_TYPES(id, name)
- ATTENDANCE(id, employee_id, work_date, clock_in, clock_out, status)

Result: a department rename or a shift-time change is made in exactly one row.

## 3. BCNF assessment

A table is in BCNF when every determinant is a candidate key.

| Table | Candidate keys | BCNF? |
|---|---|---|
| departments | id, name | Yes |
| positions | id, title | Yes |
| shifts | id, name | Yes |
| employees | id, employee_no, email | Yes |
| attendance | id, (employee_id, work_date) | Yes |
| pay_rates | id, (employee_id, effective_from) | Yes |
| employee_allowances | (employee_id, allowance_type_id) | Yes |
| pay_periods | id, label | Yes |
| payslips | id, (employee_id, period_id) | Yes, except the derived `net_pay` (section 5) |
| payslip_lines | id | Yes |

The "no overlapping periods or rates" rules are not functional dependencies. They are enforced with exclusion constraints, so they do not affect normal forms.

## 4. A 3NF problem found and fixed

The first version of `employees` stored both `department_id` and `position_id`. Because `position_id → department_id` (FD3), the department was determined through the position, which is a transitive dependency (employee → position → department). It also allowed an inconsistent row, such as an Accountant listed under Operations.

Fix: migration `003_remove_redundant_department.sql` drops `employees.department_id`. The department is now derived through `positions.department_id`, and the view `v_employee_details` presents it. After the fix, `employees` is in 3NF and BCNF.

## 5. Controlled redundancy in payslips

`payslips` stores `gross_pay`, `total_allowances`, `total_deductions` and `net_pay`, where `net_pay = gross_pay + total_allowances - total_deductions`. Strictly, `net_pay` is derivable, so this is a deliberate departure from 3NF. Reasons to keep it:

- A payslip is a historical snapshot. Pay rates, allowances and deduction rates change later, but a past payslip must not change.
- Reports read stored totals without recalculating from line items.
- The `CHECK (net_pay >= 0)` constraint and the payroll function keep the stored values consistent, and `payslip_lines` holds the itemized evidence.

## 6. Fourth Normal Form (4NF)

4NF removes multivalued dependencies (MVDs) where two independent multivalued facts sit in one table. An employee can have many allowances and many attendance records, which are independent facts. If they were stored together in one table (employee, allowance, work_date), every allowance would repeat for every date. They are in separate tables (`employee_allowances`, `attendance`), so no table has two independent MVDs. The schema satisfies 4NF.

## 7. Fifth Normal Form (5NF)

5NF removes join dependencies that cannot be implied by candidate keys. Each association table here is binary: `employee_allowances` links two entities, and its `amount` depends on the whole pair, so it cannot be split into smaller tables without losing information. No three-way relationship can be rebuilt by joining three smaller tables. Payslip details are held by `payslip_lines` keyed by payslip, not as a hidden ternary relation. A further decomposition would add complexity with no benefit, so 5NF is satisfied and no higher decomposition is needed.