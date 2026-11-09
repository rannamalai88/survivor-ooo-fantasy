-- S51 STEP 10 — TOVUTO TRIBE (E7 merge)
--
-- E7 merged the cast into one tribe, Tovuto. survivors.tribe is limited by
-- survivors_tribe_check, so FSG's "Tovuto" was rejected on the pull.
-- Keep ALLOWED_TRIBES in src/app/api/scoring/scrape-fsg/route.ts in step.
-- Run in the Supabase SQL editor, one statement at a time.

-- VERIFY BEFORE: expect the list without 'Tovuto'
select pg_get_constraintdef(oid) like '%''Tovuto''%' as has_tovuto, pg_get_constraintdef(oid) as full_definition
from pg_constraint where conname = 'survivors_tribe_check';

begin;
alter table survivors drop constraint survivors_tribe_check;
alter table survivors add constraint survivors_tribe_check
  check (tribe in ('Vatu','Kalo','Cila','Savu','Toka','Dina','Tovuto','Merge','Host'));
commit;

-- VERIFY AFTER: expect has_tovuto = true
select pg_get_constraintdef(oid) like '%''Tovuto''%' as has_tovuto, pg_get_constraintdef(oid) as full_definition
from pg_constraint where conname = 'survivors_tribe_check';
