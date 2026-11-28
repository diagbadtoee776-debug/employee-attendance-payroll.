-- =====================================================================
-- Concurrency demo: the LOST UPDATE anomaly and how to prevent it.
-- Uses a demo table only (tests.budget), never your real data.
-- You need TWO Supabase SQL Editor tabs open side by side (Tab 1, Tab 2).
-- Story: a department has a payroll budget of 100. Two people spend from it
-- at the same time: one spends 30, the other spends 20. Correct result: 50.
-- =====================================================================

-- ---------- SETUP (run once, in any tab) ----------
create schema if not exists tests;
drop table if exists tests.budget;
create table tests.budget (id int primary key, remaining numeric not null);
insert into tests.budget values (1, 100);
select * from tests.budget;      -- expect: remaining = 100


-- ===================== PART A: THE ANOMALY (no locking) =====================

-- TAB 1: run this FIRST. It reads 100, waits 12 seconds, then writes 100 - 30.
do $$
declare v numeric;
begin
  select remaining into v from tests.budget where id = 1;   -- reads 100
  perform pg_sleep(12);                                     -- Tab 2 acts during this wait
  update tests.budget set remaining = v - 30 where id = 1;  -- writes 70 (stale value)
end $$;

-- TAB 2: within 12 seconds of starting Tab 1, run this:
update tests.budget set remaining = remaining - 20 where id = 1;

-- AFTER BOTH FINISH, in any tab:
select * from tests.budget;
-- Result: 70. Correct answer is 50. Tab 2's spending of 20 was silently LOST.
-- (Take a screenshot of this result.)

-- Reset for Part B
update tests.budget set remaining = 100 where id = 1;


-- ===================== PART B: THE FIX (row lock) =====================

-- TAB 1: run this FIRST. FOR UPDATE locks the row until the transaction ends.
do $$
declare v numeric;
begin
  select remaining into v from tests.budget where id = 1 for update;  -- locks the row
  perform pg_sleep(12);
  update tests.budget set remaining = v - 30 where id = 1;
end $$;

-- TAB 2: within 12 seconds, run the SAME statement as before:
update tests.budget set remaining = remaining - 20 where id = 1;
-- Tab 2 now WAITS (the Run button keeps spinning) until Tab 1 finishes,
-- then applies its change to the new value (70 - 20).

-- AFTER BOTH FINISH:
select * from tests.budget;
-- Result: 50. Correct. No update was lost. (Take a screenshot.)


-- ===================== PART C: THE SIMPLEST FIX =====================
-- Do the arithmetic inside ONE statement instead of read, then write:
update tests.budget set remaining = remaining - 30 where id = 1;
-- The database applies it atomically, so two of these can never overwrite each other.

-- Cleanup (optional):  drop table tests.budget;