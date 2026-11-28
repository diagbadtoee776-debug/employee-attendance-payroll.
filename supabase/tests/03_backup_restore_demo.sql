-- =====================================================================
-- Backup and restore demo (logical backup inside the database).
-- Run each STEP separately: highlight it, click Run, take a screenshot.
-- It backs up the attendance table, "loses" it, restores it, and proves
-- the restored data is identical using a checksum.
-- =====================================================================

-- ---------- STEP 1: BACKUP ----------
create schema if not exists backup_demo;
drop table if exists backup_demo.attendance;
create table backup_demo.attendance as table public.attendance;

create table if not exists backup_demo.checks (
  label text primary key, row_count bigint, checksum text);

insert into backup_demo.checks
select 'before_backup', count(*), md5(string_agg(a::text, '|' order by a.id))
from public.attendance a
on conflict (label) do update
  set row_count = excluded.row_count, checksum = excluded.checksum;

select * from backup_demo.checks;
-- Expect: before_backup, 80 rows (or your current count), and a checksum.


-- ---------- STEP 2: DISASTER (simulated data loss) ----------
delete from public.attendance;
select count(*) as rows_after_disaster from public.attendance;
-- Expect: 0. Open the app dashboard: attendance records now show 0.


-- ---------- STEP 3: RESTORE and VERIFY ----------
insert into public.attendance overriding system value
select * from backup_demo.attendance;

insert into backup_demo.checks
select 'after_restore', count(*), md5(string_agg(a::text, '|' order by a.id))
from public.attendance a
on conflict (label) do update
  set row_count = excluded.row_count, checksum = excluded.checksum;

select c.label, c.row_count, c.checksum,
       c.checksum = (select checksum from backup_demo.checks where label = 'before_backup') as matches_backup
from backup_demo.checks c
order by c.label desc;
-- Expect: both rows show the same count and checksum, matches_backup = true.


-- ---------- STEP 4: CLEANUP (optional, after your screenshots) ----------
-- drop schema backup_demo cascade;