-- =====================================================================
-- Migration 003: remove a 3NF violation in employees
-- employees.department_id was redundant: employee -> position -> department.
-- The department is now derived through positions.department_id.
-- Run AFTER 001 and 002.
-- =====================================================================

-- The summary view used employees.department_id, so drop it first
drop view if exists v_payroll_summary;

-- Dropping the column also drops idx_employees_dept
alter table employees drop column department_id;

-- Index for the position foreign key (used by joins to positions/departments)
create index if not exists idx_employees_position on employees (position_id);

-- Recreate the payroll summary, deriving department through the position
create or replace view v_payroll_summary
with (security_invoker = true) as
select pp.label as period, d.name as department,
       count(*) as employees_paid,
       sum(ps.gross_pay) as total_gross,
       sum(ps.total_deductions) as total_deductions,
       sum(ps.net_pay) as total_net
from payslips ps
join pay_periods pp on pp.id = ps.period_id
join employees e on e.id = ps.employee_id
join positions p on p.id = e.position_id
join departments d on d.id = p.department_id
group by pp.label, d.name;

-- Convenience view: full employee details with derived department
create or replace view v_employee_details
with (security_invoker = true) as
select e.id, e.employee_no, e.first_name, e.last_name, e.email, e.status, e.hire_date,
       d.name as department, p.title as position, s.name as shift
from employees e
join positions p on p.id = e.position_id
join departments d on d.id = p.department_id
join shifts s on s.id = e.shift_id;