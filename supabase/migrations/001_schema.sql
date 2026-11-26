-- =====================================================================
-- CSENG 407 | Project 08: Employee Attendance and Payroll Processing
-- Migration 001: schema, constraints, triggers, functions, views, RLS
-- Target: Supabase PostgreSQL. All data is synthetic.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- 1. REFERENCE TABLES
-- ---------------------------------------------------------------------
create table departments (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table positions (
  id             bigint generated always as identity primary key,
  title          text not null unique,
  department_id  bigint not null references departments(id) on delete restrict,
  created_at     timestamptz not null default now()
);

create table shifts (
  id             bigint generated always as identity primary key,
  name           text not null unique,
  start_time     time not null,
  end_time       time not null,
  grace_minutes  int  not null default 10 check (grace_minutes between 0 and 60),
  check (start_time <> end_time)
);

-- ---------------------------------------------------------------------
-- 2. EMPLOYEES
-- ---------------------------------------------------------------------
create table employees (
  id            bigint generated always as identity primary key,
  employee_no   text not null unique check (employee_no ~ '^EMP[0-9]{4}$'),
  first_name    text not null,
  last_name     text not null,
  email         text not null unique check (email like '%_@_%._%'),
  department_id bigint not null references departments(id),
  position_id   bigint not null references positions(id),
  shift_id      bigint not null references shifts(id),
  hire_date     date not null check (hire_date <= current_date),
  status        text not null default 'active'
                check (status in ('active','on_leave','terminated')),
  user_id       uuid unique references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- App roles: one row per Supabase auth user
create table profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'employee'
              check (role in ('admin','hr','payroll','employee')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. PAY CONFIGURATION
-- ---------------------------------------------------------------------
create table pay_rates (
  id                   bigint generated always as identity primary key,
  employee_id          bigint not null references employees(id) on delete cascade,
  hourly_rate          numeric(10,2) not null check (hourly_rate > 0),
  overtime_multiplier  numeric(3,2)  not null default 1.50 check (overtime_multiplier >= 1),
  effective_from       date not null,
  effective_to         date,
  check (effective_to is null or effective_to >= effective_from),
  -- no two rates for the same employee may overlap in time
  exclude using gist (
    employee_id with =,
    (daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]')) with &&
  )
);

create table allowance_types (
  id    bigint generated always as identity primary key,
  name  text not null unique,
  taxable boolean not null default true
);

-- M:N associative relation: employees <-> allowance_types
create table employee_allowances (
  employee_id        bigint not null references employees(id) on delete cascade,
  allowance_type_id  bigint not null references allowance_types(id),
  amount             numeric(10,2) not null check (amount >= 0),
  primary key (employee_id, allowance_type_id)
);

create table deduction_types (
  id       bigint generated always as identity primary key,
  name     text not null unique,
  method   text not null check (method in ('percent','fixed')),
  value    numeric(10,2) not null check (value >= 0),
  active   boolean not null default true,
  check (method <> 'percent' or value <= 100)
);

-- ---------------------------------------------------------------------
-- 4. ATTENDANCE AND PAYROLL
-- ---------------------------------------------------------------------
create table attendance (
  id           bigint generated always as identity primary key,
  employee_id  bigint not null references employees(id) on delete cascade,
  work_date    date not null,
  clock_in     timestamptz,
  clock_out    timestamptz,
  status       text not null default 'present'
               check (status in ('present','late','absent','leave')),
  note         text,
  unique (employee_id, work_date),                       -- one record per day
  check (clock_out is null or clock_in is not null),
  check (clock_out is null or clock_out > clock_in),
  check (status in ('absent','leave') or clock_in is not null)
);

create table pay_periods (
  id          bigint generated always as identity primary key,
  label       text not null unique,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'open' check (status in ('open','processed','closed')),
  check (end_date >= start_date),
  exclude using gist ((daterange(start_date, end_date, '[]')) with &&)
);

create table payslips (
  id               bigint generated always as identity primary key,
  employee_id      bigint not null references employees(id),
  period_id        bigint not null references pay_periods(id),
  regular_hours    numeric(8,2) not null default 0 check (regular_hours >= 0),
  overtime_hours   numeric(8,2) not null default 0 check (overtime_hours >= 0),
  gross_pay        numeric(12,2) not null check (gross_pay >= 0),
  total_allowances numeric(12,2) not null default 0 check (total_allowances >= 0),
  total_deductions numeric(12,2) not null default 0 check (total_deductions >= 0),
  net_pay          numeric(12,2) not null check (net_pay >= 0),
  generated_at     timestamptz not null default now(),
  unique (employee_id, period_id)                        -- no duplicate payslip
);

create table payslip_lines (
  id          bigint generated always as identity primary key,
  payslip_id  bigint not null references payslips(id) on delete cascade,
  line_type   text not null check (line_type in ('earning','allowance','deduction')),
  description text not null,
  amount      numeric(12,2) not null check (amount >= 0)
);

create table audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid default auth.uid(),
  changed_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. INDEXES (justified)
-- ---------------------------------------------------------------------
-- Payroll and reports filter attendance by date range then group by employee
create index idx_attendance_date_emp on attendance (work_date, employee_id);
-- Payslip lookups by period (reports) and FK joins
create index idx_payslips_period on payslips (period_id);
-- Employee list filtered by department; also supports FK joins
create index idx_employees_dept on employees (department_id);
-- Audit review by table and time
create index idx_audit_table_time on audit_log (table_name, changed_at desc);

-- ---------------------------------------------------------------------
-- 6. HELPER FUNCTIONS FOR ROLES
-- ---------------------------------------------------------------------
create or replace function app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid()
$$;

create or replace function my_employee_id() returns bigint
language sql stable security definer set search_path = public as $$
  select id from employees where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 7. TRIGGERS
-- ---------------------------------------------------------------------
-- 7a. Business rule: validate attendance
create or replace function trg_validate_attendance() returns trigger
language plpgsql as $$
declare v_status text;
begin
  select status into v_status from employees where id = new.employee_id;
  if v_status = 'terminated' then
    raise exception 'Cannot record attendance for a terminated employee';
  end if;
  if new.work_date > current_date then
    raise exception 'Attendance cannot be recorded for a future date (%)', new.work_date;
  end if;
  if new.clock_in is not null and new.clock_in::date <> new.work_date then
    raise exception 'clock_in date must match work_date';
  end if;
  return new;
end $$;

create trigger validate_attendance
  before insert or update on attendance
  for each row execute function trg_validate_attendance();

-- 7b. Audit log for sensitive tables
create or replace function trg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb;
begin
  v_row := to_jsonb(coalesce(new, old));
  insert into audit_log(table_name, record_id, action, old_data, new_data)
  values (tg_table_name, v_row->>'id', tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_pay_rates after insert or update or delete on pay_rates
  for each row execute function trg_audit();
create trigger audit_payslips after insert or update or delete on payslips
  for each row execute function trg_audit();
create trigger audit_employees after insert or update or delete on employees
  for each row execute function trg_audit();

-- ---------------------------------------------------------------------
-- 8. VIEWS
-- ---------------------------------------------------------------------
-- Daily hours split into regular (first 8h) and overtime
create or replace view v_attendance_hours
with (security_invoker = true) as
select a.id, a.employee_id, a.work_date, a.status,
       round((extract(epoch from (a.clock_out - a.clock_in)) / 3600)::numeric, 2) as hours_worked,
       least(round((extract(epoch from (a.clock_out - a.clock_in)) / 3600)::numeric, 2), 8) as regular_hours,
       greatest(round((extract(epoch from (a.clock_out - a.clock_in)) / 3600)::numeric, 2) - 8, 0) as overtime_hours
from attendance a
where a.clock_out is not null;

-- Payroll summary per period and department
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
join departments d on d.id = e.department_id
group by pp.label, d.name;

-- Absence report per employee per period
create or replace view v_absence_report
with (security_invoker = true) as
select pp.label as period, e.employee_no,
       e.first_name || ' ' || e.last_name as employee,
       count(*) filter (where a.status = 'absent') as days_absent,
       count(*) filter (where a.status = 'late')   as days_late
from pay_periods pp
join attendance a on a.work_date between pp.start_date and pp.end_date
join employees e on e.id = a.employee_id
group by pp.label, e.employee_no, e.first_name, e.last_name;

-- ---------------------------------------------------------------------
-- 9. STORED FUNCTION: atomic payroll run
--    Any error (e.g. missing pay rate) rolls back the whole run.
-- ---------------------------------------------------------------------
create or replace function calculate_payroll(p_period_id bigint) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_period  pay_periods%rowtype;
  v_emp     record;
  v_rate    pay_rates%rowtype;
  v_reg     numeric; v_ot numeric;
  v_gross   numeric; v_allow numeric; v_ded numeric;
  v_ps      bigint;
  v_d       record;
  v_amt     numeric;
  v_count   int := 0;
begin
  if auth.uid() is not null and app_role() not in ('admin','payroll') then
    raise exception 'Permission denied: only admin or payroll may run payroll';
  end if;

  select * into v_period from pay_periods where id = p_period_id for update; -- lock row
  if not found then raise exception 'Pay period % not found', p_period_id; end if;
  if v_period.status <> 'open' then
    raise exception 'Pay period "%" is already %', v_period.label, v_period.status;
  end if;

  for v_emp in select id, employee_no from employees where status = 'active' loop
    select * into v_rate from pay_rates
     where employee_id = v_emp.id
       and effective_from <= v_period.end_date
       and (effective_to is null or effective_to >= v_period.end_date)
     order by effective_from desc limit 1;
    if not found then
      raise exception 'No pay rate for employee % in period %', v_emp.employee_no, v_period.label;
    end if;

    select coalesce(sum(regular_hours),0), coalesce(sum(overtime_hours),0)
      into v_reg, v_ot
      from v_attendance_hours
     where employee_id = v_emp.id
       and work_date between v_period.start_date and v_period.end_date
       and status in ('present','late');

    v_gross := round(v_reg * v_rate.hourly_rate
                   + v_ot * v_rate.hourly_rate * v_rate.overtime_multiplier, 2);
    select coalesce(sum(amount),0) into v_allow from employee_allowances where employee_id = v_emp.id;

    insert into payslips(employee_id, period_id, regular_hours, overtime_hours,
                         gross_pay, total_allowances, total_deductions, net_pay)
    values (v_emp.id, p_period_id, v_reg, v_ot, v_gross, v_allow, 0, v_gross + v_allow)
    returning id into v_ps;

    insert into payslip_lines(payslip_id, line_type, description, amount)
    values (v_ps, 'earning', 'Regular pay', round(v_reg * v_rate.hourly_rate, 2)),
           (v_ps, 'earning', 'Overtime pay', round(v_ot * v_rate.hourly_rate * v_rate.overtime_multiplier, 2));

    insert into payslip_lines(payslip_id, line_type, description, amount)
    select v_ps, 'allowance', t.name, ea.amount
      from employee_allowances ea join allowance_types t on t.id = ea.allowance_type_id
     where ea.employee_id = v_emp.id;

    v_ded := 0;
    for v_d in select * from deduction_types where active loop
      v_amt := case v_d.method when 'percent' then round(v_gross * v_d.value / 100, 2) else v_d.value end;
      insert into payslip_lines(payslip_id, line_type, description, amount)
      values (v_ps, 'deduction', v_d.name, v_amt);
      v_ded := v_ded + v_amt;
    end loop;

    -- CHECK (net_pay >= 0) fails and rolls back everything if deductions exceed pay
    update payslips set total_deductions = v_ded, net_pay = v_gross + v_allow - v_ded where id = v_ps;
    v_count := v_count + 1;
  end loop;

  update pay_periods set status = 'processed' where id = p_period_id;
  return v_count;
end $$;

revoke all on function calculate_payroll(bigint) from public, anon;
grant execute on function calculate_payroll(bigint) to authenticated;

-- ---------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table departments         enable row level security;
alter table positions           enable row level security;
alter table shifts              enable row level security;
alter table employees           enable row level security;
alter table profiles            enable row level security;
alter table pay_rates           enable row level security;
alter table allowance_types     enable row level security;
alter table employee_allowances enable row level security;
alter table deduction_types     enable row level security;
alter table attendance          enable row level security;
alter table pay_periods         enable row level security;
alter table payslips            enable row level security;
alter table payslip_lines       enable row level security;
alter table audit_log           enable row level security;

-- Reference data: any signed-in user reads; admin/hr write
do $$
declare t text;
begin
  foreach t in array array['departments','positions','shifts'] loop
    execute format('create policy %I_read on %I for select to authenticated using (true)', t, t);
    execute format('create policy %I_write on %I for all to authenticated
                    using (app_role() in (''admin'',''hr'')) with check (app_role() in (''admin'',''hr''))', t, t);
  end loop;
end $$;

-- Employees: staff roles see all; employees see only themselves
create policy employees_read on employees for select to authenticated
  using (app_role() in ('admin','hr','payroll') or user_id = auth.uid());
create policy employees_write on employees for all to authenticated
  using (app_role() in ('admin','hr')) with check (app_role() in ('admin','hr'));

-- Profiles: read your own; admin manages all
create policy profiles_self on profiles for select to authenticated
  using (user_id = auth.uid() or app_role() = 'admin');
create policy profiles_admin on profiles for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');

-- Attendance: hr/admin full; payroll read; employee reads own
create policy attendance_read on attendance for select to authenticated
  using (app_role() in ('admin','hr','payroll') or employee_id = my_employee_id());
create policy attendance_write on attendance for all to authenticated
  using (app_role() in ('admin','hr')) with check (app_role() in ('admin','hr'));

-- Pay data: HIDDEN from hr and employees (except own payslips)
create policy pay_rates_all on pay_rates for all to authenticated
  using (app_role() in ('admin','payroll')) with check (app_role() in ('admin','payroll'));
create policy allowance_types_all on allowance_types for all to authenticated
  using (app_role() in ('admin','payroll')) with check (app_role() in ('admin','payroll'));
create policy emp_allowances_all on employee_allowances for all to authenticated
  using (app_role() in ('admin','payroll')) with check (app_role() in ('admin','payroll'));
create policy deduction_types_all on deduction_types for all to authenticated
  using (app_role() in ('admin','payroll')) with check (app_role() in ('admin','payroll'));

create policy periods_read on pay_periods for select to authenticated using (true);
create policy periods_write on pay_periods for all to authenticated
  using (app_role() in ('admin','payroll')) with check (app_role() in ('admin','payroll'));

create policy payslips_read on payslips for select to authenticated
  using (app_role() in ('admin','payroll') or employee_id = my_employee_id());
create policy payslip_lines_read on payslip_lines for select to authenticated
  using (app_role() in ('admin','payroll')
         or exists (select 1 from payslips p
                    where p.id = payslip_id and p.employee_id = my_employee_id()));

-- Audit log: admin read only (written by trigger)
create policy audit_admin_read on audit_log for select to authenticated
  using (app_role() = 'admin');

-- Block anonymous access completely
revoke all on all tables in schema public from anon;