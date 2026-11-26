-- =====================================================================
-- Test setup: roles for test logins + helper functions (schema "tests")
-- BEFORE running: create these 4 users in Supabase
--   Authentication > Users > Add user > Create new user (tick Auto Confirm):
--     admin.test@example.com   hr.test@example.com
--     payroll.test@example.com employee.test@example.com
-- Use strong passwords. Never commit them.
-- The "tests" schema is not exposed by the Supabase API. It is test
-- scaffolding only; the last lines show how to remove it.
-- =====================================================================

-- 1. Assign roles to the test logins
insert into profiles (user_id, role)
select u.id, v.role
from auth.users u
join (values ('admin.test@example.com','admin'),
             ('hr.test@example.com','hr'),
             ('payroll.test@example.com','payroll'),
             ('employee.test@example.com','employee')) as v(email, role)
  on v.email = u.email
on conflict (user_id) do update set role = excluded.role;

-- 2. The test employee login is linked to EMP0002 (sees only own records)
update employees
set user_id = (select id from auth.users where email = 'employee.test@example.com')
where employee_no = 'EMP0002'
  and exists (select 1 from auth.users where email = 'employee.test@example.com');

-- 3. Helper schema, locked down
create schema if not exists tests;
revoke all on schema tests from public, anon, authenticated;

-- run_as: run one statement AS a given login, with Row Level Security active.
-- SELECT  -> reports how many rows that login can see.
-- DML     -> runs it, reports rows affected, then ALWAYS rolls it back.
-- Any error (RLS, constraint, trigger, function rule) is reported as REJECTED.
create or replace function tests.run_as(p_email text, p_sql text) returns text
language plpgsql as $$
declare
  v_uid uuid; v_n bigint; v_out text; v_is_select boolean;
begin
  select id into v_uid from auth.users where email = p_email;
  if v_uid is null then return 'NO SUCH TEST USER: ' || p_email; end if;

  v_is_select := lower(ltrim(p_sql)) ~ '^(select|with)\y';
  perform set_config('request.jwt.claims',
          json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    if v_is_select then
      execute 'select count(*) from (' || p_sql || ') t' into v_n;
      v_out := 'OK: ' || v_n || ' row(s) visible';
    else
      execute p_sql;
      get diagnostics v_n = row_count;
      raise exception 'ROLLBACK_TEST:%', v_n;
    end if;
  exception when others then
    if sqlerrm like 'ROLLBACK_TEST:%' then
      v_n := split_part(sqlerrm, ':', 2)::bigint;
      v_out := case when v_n > 0
                    then 'ALLOWED: ' || v_n || ' row(s) affected (rolled back)'
                    else 'DENIED: 0 rows affected' end;
    else
      v_out := 'REJECTED: ' || sqlerrm;
    end if;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', true);
  return v_out;
end $$;

-- rollback_demo: a payroll run that fails halfway must leave NOTHING behind
create or replace function tests.rollback_demo() returns text
language plpgsql as $$
declare
  v_pid bigint; v_msg text; v_rates int; v_slips int; v_status text;
  v_emp bigint;
begin
  select id into v_pid from pay_periods where label = 'Nov 2026 Cycle 2';
  select id into v_emp from employees where employee_no = 'EMP0008';
  begin
    delete from pay_rates where employee_id = v_emp;     -- sabotage one employee
    perform calculate_payroll(v_pid);                     -- must fail midway
    raise exception 'UNEXPECTED SUCCESS';                 -- never keep the sabotage
  exception when others then
    v_msg := sqlerrm;
  end;
  select count(*) into v_rates  from pay_rates where employee_id = v_emp;
  select count(*) into v_slips  from payslips  where period_id = v_pid;
  select status   into v_status from pay_periods where id = v_pid;
  return format('Error raised: %s | EMP0008 pay rates after rollback: %s | payslips created for Cycle 2: %s | Cycle 2 status: %s',
                v_msg, v_rates, v_slips, v_status);
end $$;

revoke all on function tests.run_as(text, text) from public, anon, authenticated;
revoke all on function tests.rollback_demo() from public, anon, authenticated;

-- 4. Check: should list 4 rows with the right roles (employee.test linked to EMP0002)
select u.email, p.role, e.employee_no
from auth.users u
join profiles p on p.user_id = u.id
left join employees e on e.user_id = u.id
order by p.role;

-- Cleanup when finished (optional):  drop schema tests cascade;