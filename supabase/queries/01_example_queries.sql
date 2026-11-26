-- =====================================================================
-- CSENG 407 | Project 08: example queries (16) + EXPLAIN demonstration
-- Run AFTER migrations 001, 002, 003 AND after running payroll for
-- 'Nov 2026 Cycle 1' (queries 8 to 15 need payslips).
-- In the Supabase SQL Editor: highlight ONE query, then click Run.
-- =====================================================================

-- Q1. JOIN (4 tables) + ORDER BY: employee directory
select e.employee_no, e.first_name || ' ' || e.last_name as employee,
       d.name as department, p.title as position, s.name as shift, e.status
from employees e
join positions   p on p.id = e.position_id
join departments d on d.id = p.department_id
join shifts      s on s.id = e.shift_id
order by d.name, e.last_name;

-- Q2. FILTERING (WHERE) + ORDER BY: active staff hired before 2021
select employee_no, first_name, last_name, hire_date
from employees
where status = 'active' and hire_date < '2021-01-01'
order by hire_date;

-- Q3. LEFT JOIN + AGGREGATE + GROUP BY: headcount per department
select d.name as department,
       count(e.id) as total_employees,
       count(e.id) filter (where e.status = 'active') as active_employees
from departments d
left join positions p on p.department_id = d.id
left join employees e on e.position_id = p.id
group by d.name
order by total_employees desc, d.name;

-- Q4. GROUP BY + HAVING: employees late 2 or more times in Cycle 1
select e.employee_no, e.first_name || ' ' || e.last_name as employee,
       count(*) as late_days
from attendance a
join employees e on e.id = a.employee_id
where a.status = 'late' and a.work_date between '2026-11-09' and '2026-11-20'
group by e.employee_no, e.first_name, e.last_name
having count(*) >= 2
order by late_days desc, e.employee_no;

-- Q5. JOIN with a VIEW + SUM: hours worked per employee in Cycle 1
select e.employee_no, e.first_name || ' ' || e.last_name as employee,
       sum(h.hours_worked) as total_hours,
       sum(h.overtime_hours) as overtime_hours
from employees e
join v_attendance_hours h on h.employee_id = e.id
where h.work_date between '2026-11-09' and '2026-11-20'
group by e.employee_no, e.first_name, e.last_name
order by total_hours desc;

-- Q6. AGGREGATE + window function: attendance status distribution
select status, count(*) as records,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as percent
from attendance
group by status
order by records desc;

-- Q7. NESTED (scalar) SUBQUERY: employees paid above the average hourly rate
select e.employee_no, e.first_name || ' ' || e.last_name as employee, pr.hourly_rate
from pay_rates pr
join employees e on e.id = pr.employee_id
where pr.hourly_rate > (select avg(hourly_rate) from pay_rates)
order by pr.hourly_rate desc;

-- Q8. CORRELATED SUBQUERY: net pay above the average of the employee's own department
select e.employee_no, e.first_name || ' ' || e.last_name as employee,
       d.name as department, ps.net_pay
from payslips ps
join employees e on e.id = ps.employee_id
join positions p on p.id = e.position_id
join departments d on d.id = p.department_id
where ps.net_pay > (
    select avg(ps2.net_pay)
    from payslips ps2
    join employees e2 on e2.id = ps2.employee_id
    join positions p2 on p2.id = e2.position_id
    where p2.department_id = p.department_id
      and ps2.period_id = ps.period_id)
order by d.name, ps.net_pay desc;

-- Q9. NOT EXISTS (correlated): active employees with no absences in Cycle 1
select e.employee_no, e.first_name || ' ' || e.last_name as employee
from employees e
where e.status = 'active'
  and not exists (
      select 1 from attendance a
      where a.employee_id = e.id
        and a.status = 'absent'
        and a.work_date between '2026-11-09' and '2026-11-20')
order by e.employee_no;

-- Q10. JOIN + SUM + GROUP BY + HAVING: payroll totals per department
select d.name as department, count(*) as employees_paid,
       sum(ps.gross_pay) as total_gross, sum(ps.net_pay) as total_net
from payslips ps
join pay_periods pp on pp.id = ps.period_id
join employees e on e.id = ps.employee_id
join positions p on p.id = e.position_id
join departments d on d.id = p.department_id
where pp.label = 'Nov 2026 Cycle 1'
group by d.name
having sum(ps.net_pay) > 0
order by total_net desc;

-- Q11. LEFT JOIN with IS NULL: employees without a payslip (on leave / terminated)
select e.employee_no, e.first_name || ' ' || e.last_name as employee, e.status
from employees e
left join payslips ps on ps.employee_id = e.id
where ps.id is null
order by e.employee_no;

-- Q12. JOIN (3 tables) + ORDER BY: itemised payslip for EMP0003
select pl.line_type, pl.description, pl.amount
from payslip_lines pl
join payslips ps on ps.id = pl.payslip_id
join employees e on e.id = ps.employee_id
where e.employee_no = 'EMP0003'
order by pl.line_type, pl.id;

-- Q13. ORDER BY + LIMIT: top 3 employees by overtime hours
select e.employee_no, e.first_name || ' ' || e.last_name as employee,
       ps.overtime_hours, ps.gross_pay
from payslips ps
join employees e on e.id = ps.employee_id
order by ps.overtime_hours desc, ps.gross_pay desc
limit 3;

-- Q14. M:N JOIN + string_agg + SUM: allowances per employee
select e.employee_no, e.first_name || ' ' || e.last_name as employee,
       string_agg(t.name || ' ' || ea.amount, ', ' order by t.name) as allowances,
       sum(ea.amount) as total_allowance
from employees e
join employee_allowances ea on ea.employee_id = e.id
join allowance_types t on t.id = ea.allowance_type_id
group by e.employee_no, e.first_name, e.last_name
order by total_allowance desc, e.employee_no;

-- Q15. CTE + NESTED SUBQUERY: department with the highest total net pay
with dept_totals as (
    select d.name as department, sum(ps.net_pay) as total_net
    from payslips ps
    join employees e on e.id = ps.employee_id
    join positions p on p.id = e.position_id
    join departments d on d.id = p.department_id
    group by d.name)
select department, total_net
from dept_totals
where total_net = (select max(total_net) from dept_totals);

-- Q16. AGGREGATE on the audit log: changes recorded by the audit triggers
select table_name, action, count(*) as changes
from audit_log
group by table_name, action
order by table_name, action;

-- =====================================================================
-- EXPLAIN demonstration (query performance and index rationale)
-- Index: idx_attendance_date_emp on attendance (work_date, employee_id)
-- =====================================================================

-- E1. Normal plan. With only 80 rows PostgreSQL usually chooses a Seq Scan,
--     because reading one small page is cheaper than using an index.
explain (analyze, buffers)
select a.employee_id, count(*)
from attendance a
where a.work_date between '2026-11-09' and '2026-11-20'
group by a.employee_id;

-- E2. Force the planner to consider the index, to show it can be used.
--     (Run the three lines together, then compare the plan with E1.)
set enable_seqscan = off;
explain (analyze, buffers)
select a.employee_id, count(*)
from attendance a
where a.work_date between '2026-11-09' and '2026-11-20'
group by a.employee_id;
reset enable_seqscan;

-- Explanation for the report: the index on (work_date, employee_id) lets the
-- database jump to the requested date range and read employee_id from the same
-- index. On a table with thousands of attendance rows (a real company), this
-- avoids scanning every row, so payroll and reports stay fast as data grows.