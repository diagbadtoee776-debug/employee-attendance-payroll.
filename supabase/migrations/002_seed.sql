-- =====================================================================
-- CSENG 407 | Project 08: Employee Attendance and Payroll Processing
-- Migration 002: SMALL synthetic seed (all names and values are invented)
-- Run AFTER 001_schema.sql. Safe to re-run: it clears the seed tables first.
-- (It does NOT touch Supabase logins or the profiles table.)
-- =====================================================================

-- 0. Reset seed tables ---------------------------------------------------
truncate table audit_log, payslip_lines, payslips, attendance,
               employee_allowances, pay_rates, employees, positions,
               shifts, departments, allowance_types, deduction_types, pay_periods
restart identity cascade;

-- 1. Departments (5) -----------------------------------------------------
insert into departments (name) values
  ('Administration'), ('Finance'), ('Operations'), ('IT'), ('Human Resources');

-- 2. Positions (10) ------------------------------------------------------
insert into positions (title, department_id)
select v.title, d.id
from (values
  ('Office Manager',           'Administration'),
  ('Administrative Assistant', 'Administration'),
  ('Accountant',               'Finance'),
  ('Payroll Officer',          'Finance'),
  ('Operations Supervisor',    'Operations'),
  ('Field Technician',         'Operations'),
  ('Driver',                   'Operations'),
  ('Systems Administrator',    'IT'),
  ('Software Developer',       'IT'),
  ('HR Officer',               'Human Resources')
) as v(title, dept)
join departments d on d.name = v.dept;

-- 3. Shifts (3) ----------------------------------------------------------
insert into shifts (name, start_time, end_time, grace_minutes) values
  ('Morning', '08:00', '16:00', 10),
  ('Day',     '09:00', '17:00', 10),
  ('Evening', '14:00', '22:00', 10);

-- 4. Employees (10: 8 active, 1 on leave, 1 terminated) --------------------
insert into employees (employee_no, first_name, last_name, email,
                       department_id, position_id, shift_id, hire_date, status)
select v.no, v.fn, v.ln, lower(v.fn || '.' || v.ln) || '@example.com',
       d.id, p.id, s.id, v.hired::date, v.status
from (values
  ('EMP0001','Joseph','Kollie',  'Administration','Office Manager',           'Day',     '2019-03-04','active'),
  ('EMP0002','Mary',  'Toe',     'Administration','Administrative Assistant', 'Day',     '2021-06-14','active'),
  ('EMP0003','Samuel','Weah',    'Finance',       'Accountant',               'Day',     '2020-01-20','active'),
  ('EMP0004','Grace', 'Johnson', 'Finance',       'Payroll Officer',          'Day',     '2020-09-01','active'),
  ('EMP0005','Comfort','Dolo',   'Operations',    'Operations Supervisor',    'Morning', '2018-11-12','active'),
  ('EMP0006','Prince','Gbeh',    'Operations',    'Field Technician',         'Morning', '2022-08-22','active'),
  ('EMP0007','Alice', 'Nyemah',  'Operations',    'Field Technician',         'Evening', '2023-01-16','active'),
  ('EMP0008','Janet', 'Flomo',   'IT',            'Systems Administrator',    'Day',     '2020-07-13','active'),
  ('EMP0009','Moses', 'Tarr',    'Operations',    'Driver',                   'Morning', '2021-04-05','on_leave'),
  ('EMP0010','Ruth',  'Gaye',    'Human Resources','HR Officer',              'Day',     '2022-03-21','terminated')
) as v(no, fn, ln, dept, pos, shift, hired, status)
join departments d on d.name = v.dept
join positions   p on p.title = v.pos and p.department_id = d.id
join shifts      s on s.name = v.shift;

-- 5. Pay rates (10: one per employee) ----------------------------------------
insert into pay_rates (employee_id, hourly_rate, effective_from)
select e.id, v.rate, '2026-01-01'::date
from (values
  ('EMP0001', 18.00), ('EMP0002',  8.50), ('EMP0003', 16.00), ('EMP0004', 15.00),
  ('EMP0005', 17.50), ('EMP0006', 10.00), ('EMP0007', 10.00), ('EMP0008', 19.00),
  ('EMP0009',  8.00), ('EMP0010', 12.00)
) as v(no, rate)
join employees e on e.employee_no = v.no;

-- 6. Allowance types (2) and employee_allowances (12, the M:N link) ----------
insert into allowance_types (name, taxable) values ('Transport', true), ('Housing', true);

insert into employee_allowances (employee_id, allowance_type_id, amount)
select e.id, t.id, 50.00
from employees e, allowance_types t
where t.name = 'Transport';                       -- all 10 employees

insert into employee_allowances (employee_id, allowance_type_id, amount)
select e.id, t.id, 120.00
from employees e
join positions p on p.id = e.position_id
join allowance_types t on t.name = 'Housing'
where p.title in ('Office Manager', 'Operations Supervisor');   -- 2 managers

-- 7. Deduction types (3) -------------------------------------------------
insert into deduction_types (name, method, value) values
  ('Income Tax',      'percent', 10.00),
  ('Social Security', 'percent',  4.00),
  ('Union Dues',      'fixed',    2.00);

-- 8. Pay periods (2, both open) ----------------------------------------------
insert into pay_periods (label, start_date, end_date) values
  ('Nov 2026 Cycle 1', '2026-11-09', '2026-11-20'),   -- has attendance
  ('Nov 2026 Cycle 2', '2026-11-23', '2026-12-04');   -- future, no attendance yet

-- 9. Attendance: Mon 9 Nov to Fri 20 Nov 2026, 8 active employees = 80 rows ---
--    Deterministic pattern: ~8% absent, ~2% leave, ~15% late, rest present.
with base as (
  select e.id as emp_id, d::date as wd, s.start_time, s.grace_minutes,
         abs(hashtext(e.employee_no || d::date::text)) % 100 as h
  from employees e
  join shifts s on s.id = e.shift_id
  cross join generate_series('2026-11-09'::date, '2026-11-20'::date, interval '1 day') d
  where e.status = 'active'
    and extract(isodow from d) < 6
), calc as (
  select emp_id, wd, h, grace_minutes,
         case when h < 8  then 'absent'
              when h < 10 then 'leave'
              when h < 25 then 'late'
              else 'present' end as status,
         ((wd + start_time) at time zone 'UTC') as sched_start
  from base
)
insert into attendance (employee_id, work_date, clock_in, clock_out, status, note)
select emp_id, wd,
       case when status in ('absent','leave') then null
            when status = 'late' then sched_start + make_interval(mins => grace_minutes + 5 + h % 20)
            else sched_start - make_interval(mins => h % 6) end,
       case when status in ('absent','leave') then null
            else sched_start + interval '8 hours'
                 + case when h % 7 = 0 then interval '2 hours'
                        when h % 5 = 0 then interval '1 hour'
                        else make_interval(mins => (h % 3) * 10) end end,
       status,
       case status when 'absent' then 'No show (synthetic)'
                   when 'leave'  then 'Approved leave (synthetic)' end
from calc;

-- 10. Count check. Expected: 5, 10, 3, 10, 10, 2, 12, 3, 2, 80 -----------------
select 'departments' as tbl, count(*) from departments union all
select 'positions',           count(*) from positions   union all
select 'shifts',              count(*) from shifts      union all
select 'employees',           count(*) from employees   union all
select 'pay_rates',           count(*) from pay_rates   union all
select 'allowance_types',     count(*) from allowance_types union all
select 'employee_allowances', count(*) from employee_allowances union all
select 'deduction_types',     count(*) from deduction_types union all
select 'pay_periods',         count(*) from pay_periods union all
select 'attendance',          count(*) from attendance;