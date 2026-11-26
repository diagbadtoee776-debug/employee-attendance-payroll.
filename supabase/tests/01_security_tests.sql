-- =====================================================================
-- 21 security / constraint / permission tests, run as the test logins.
-- Needs 00_test_setup.sql first, and Cycle 1 payroll already processed.
-- Run the whole statement: one result table, ideal for a screenshot.
-- Types: P = positive, N = negative, C = constraint/trigger, S = security
-- =====================================================================
select t.n, t.type, t.role, t.test, t.expected,
       tests.run_as(t.email, t.sql) as actual
from (values
 (1,  'P','admin',   'Admin reads all pay rates',                    'admin.test@example.com',
      $q$select * from pay_rates$q$, 'OK: 10 rows'),
 (2,  'P','payroll', 'Payroll reads all payslips',                   'payroll.test@example.com',
      $q$select * from payslips$q$, 'OK: 8 rows'),
 (3,  'S','hr',      'HR tries to read pay rates',                   'hr.test@example.com',
      $q$select * from pay_rates$q$, 'OK: 0 rows (hidden by RLS)'),
 (4,  'S','hr',      'HR tries to read payslips',                    'hr.test@example.com',
      $q$select * from payslips$q$, 'OK: 0 rows (hidden by RLS)'),
 (5,  'S','employee','Employee reads payslips (own only)',           'employee.test@example.com',
      $q$select * from payslips$q$, 'OK: 1 row (own payslip)'),
 (6,  'S','employee','Employee reads employee table (own row only)', 'employee.test@example.com',
      $q$select * from employees$q$, 'OK: 1 row'),
 (7,  'P','hr',      'HR reads all employees',                       'hr.test@example.com',
      $q$select * from employees$q$, 'OK: 10 rows'),
 (8,  'P','hr',      'HR records attendance for a valid day',        'hr.test@example.com',
      $q$insert into attendance (employee_id, work_date, clock_in, clock_out, status)
         values ((select id from employees where employee_no='EMP0003'), '2026-11-24',
                 '2026-11-24 09:00:00+00', '2026-11-24 17:00:00+00', 'present')$q$,
      'ALLOWED: 1 row (rolled back)'),
 (9,  'N','employee','Employee tries to insert attendance',          'employee.test@example.com',
      $q$insert into attendance (employee_id, work_date, clock_in, clock_out, status)
         values ((select id from employees where employee_no='EMP0002'), '2026-11-24',
                 '2026-11-24 09:00:00+00', '2026-11-24 17:00:00+00', 'present')$q$,
      'REJECTED: row-level security policy'),
 (10, 'N','employee','Employee tries to change another employee',    'employee.test@example.com',
      $q$update employees set status = 'terminated' where employee_no = 'EMP0001'$q$,
      'DENIED: 0 rows affected'),
 (11, 'N','hr',      'HR tries to change a pay rate',                'hr.test@example.com',
      $q$update pay_rates set hourly_rate = 999$q$, 'DENIED: 0 rows affected'),
 (12, 'N','payroll', 'Payroll re-runs an already processed period',  'payroll.test@example.com',
      $q$select calculate_payroll((select id from pay_periods where label='Nov 2026 Cycle 1'))$q$,
      'REJECTED: period already processed'),
 (13, 'S','hr',      'HR tries to run payroll',                      'hr.test@example.com',
      $q$select calculate_payroll((select id from pay_periods where label='Nov 2026 Cycle 2'))$q$,
      'REJECTED: Permission denied'),
 (14, 'S','employee','Employee tries to read the audit log',         'employee.test@example.com',
      $q$select * from audit_log$q$, 'OK: 0 rows (hidden by RLS)'),
 (15, 'P','admin',   'Admin reads the audit log',                    'admin.test@example.com',
      $q$select * from audit_log$q$, 'OK: more than 0 rows'),
 (16, 'C','hr',      'Duplicate attendance for the same day',        'hr.test@example.com',
      $q$insert into attendance (employee_id, work_date, clock_in, clock_out, status)
         values ((select id from employees where employee_no='EMP0003'), '2026-11-10',
                 '2026-11-10 09:00:00+00', '2026-11-10 17:00:00+00', 'present')$q$,
      'REJECTED: duplicate key (unique)'),
 (17, 'C','hr',      'Attendance on a future date (trigger)',        'hr.test@example.com',
      $q$insert into attendance (employee_id, work_date, clock_in, clock_out, status)
         values ((select id from employees where employee_no='EMP0003'), '2026-12-01',
                 '2026-12-01 09:00:00+00', '2026-12-01 17:00:00+00', 'present')$q$,
      'REJECTED: future date'),
 (18, 'C','hr',      'Attendance for a terminated employee (trigger)','hr.test@example.com',
      $q$insert into attendance (employee_id, work_date, clock_in, clock_out, status)
         values ((select id from employees where employee_no='EMP0010'), '2026-11-24',
                 '2026-11-24 09:00:00+00', '2026-11-24 17:00:00+00', 'present')$q$,
      'REJECTED: terminated employee'),
 (19, 'C','payroll', 'Overlapping pay period (exclusion constraint)', 'payroll.test@example.com',
      $q$insert into pay_periods (label, start_date, end_date)
         values ('Overlap test', '2026-11-15', '2026-11-25')$q$,
      'REJECTED: exclusion constraint'),
 (20, 'C','payroll', 'Negative hourly rate (CHECK constraint)',      'payroll.test@example.com',
      $q$insert into pay_rates (employee_id, hourly_rate, effective_from)
         values ((select id from employees where employee_no='EMP0001'), -5, '2027-01-01')$q$,
      'REJECTED: check constraint'),
 (21, 'C','payroll', 'Overlapping pay rate (exclusion constraint)',  'payroll.test@example.com',
      $q$insert into pay_rates (employee_id, hourly_rate, effective_from)
         values ((select id from employees where employee_no='EMP0001'), 20, '2026-12-01')$q$,
      'REJECTED: exclusion constraint')
) as t(n, type, role, test, email, sql, expected)
order by t.n;

-- Transaction failure and rollback (run separately, screenshot the result):
-- select tests.rollback_demo();
-- Expected: error "No pay rate for employee EMP0008 ...", EMP0008 pay rates = 1,
--           payslips for Cycle 2 = 0, Cycle 2 status = open