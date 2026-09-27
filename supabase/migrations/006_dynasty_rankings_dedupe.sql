-- 006 — dynasty_rankings: one row per manager per season
--
-- Problem: the view joins dynasty.manager_name to managers.name. Managers are
-- season-scoped, so once the S51 managers rows were added every name matched
-- two rows (S50 + S51) and the view returned each season twice (24 rows for
-- S50 instead of 12). The app de-duplicates, but the view should be right.
--
-- Fix: keep one managers row per name — the one from the most recent season —
-- so manager_id is always the current season's id.
--
-- Run each step on its own in the Supabase SQL editor and read the output
-- before moving on.


-- STEP 1 — look before changing anything -----------------------------------
-- 1a. The current definition. If it references columns other than
--     dynasty.manager_name / season_number / final_rank, STOP and send it over.
select pg_get_viewdef('dynasty_rankings', true);

-- 1b. Rows per season right now (expect S50 = 24: the duplication)
select season_label, count(*) as rows
from dynasty_rankings group by season_label order by season_label;


-- STEP 2 — replace the view -------------------------------------------------
-- CREATE OR REPLACE keeps the same three columns (manager_id, season_label,
-- rank) in the same order, so nothing that reads the view breaks.
create or replace view dynasty_rankings as
select distinct on (d.manager_name, d.season_number)
  m.id                        as manager_id,
  'S' || d.season_number      as season_label,
  d.final_rank                as rank
from dynasty d
join managers m on m.name = d.manager_name
join seasons  s on s.id   = m.season_id
order by d.manager_name, d.season_number, s.number desc;


-- STEP 3 — confirm ------------------------------------------------------------
-- 3a. Rows per season (expect the S50 row count to drop to 12; the others
--     should match what the dynasty table holds for that season)
select season_label, count(*) as rows
from dynasty_rankings group by season_label order by season_label;

-- 3b. Must return ZERO rows (no manager appears twice in a season)
select manager_id, season_label, count(*)
from dynasty_rankings group by manager_id, season_label having count(*) > 1;

-- 3c. Every manager_id should now belong to the current (S51) managers rows
select count(*) filter (where m.season_id = '550e8400-e29b-41d4-a716-446655440051') as s51_ids,
       count(*) as total
from dynasty_rankings dr join managers m on m.id = dr.manager_id;
