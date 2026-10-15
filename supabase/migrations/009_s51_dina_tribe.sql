-- S51 STEP 9 — DINA TRIBE (E4 three-tribe swap)
--
-- E4's tribe swap split the cast into Savu / Toka / Dina. survivors.tribe is
-- limited by survivors_tribe_check, so FSG's "Dina" was rejected on the pull.
-- Keep ALLOWED_TRIBES in src/app/api/scoring/scrape-fsg/route.ts in step.
-- Run 2026-10-15 in the Supabase SQL editor.

-- VERIFY BEFORE: expect the list without 'Dina'
select conname, pg_get_constraintdef(oid)
from pg_constraint where conname = 'survivors_tribe_check';

begin;
alter table survivors drop constraint survivors_tribe_check;
alter table survivors add constraint survivors_tribe_check
  check (tribe in ('Vatu','Kalo','Cila','Savu','Toka','Dina','Merge','Host'));
commit;

-- VERIFY AFTER: expect 'Dina' in the list
select conname, pg_get_constraintdef(oid)
from pg_constraint where conname = 'survivors_tribe_check';
