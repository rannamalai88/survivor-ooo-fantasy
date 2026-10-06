-- S51 STEP 8 — PER-EPISODE RULES VERSION
--
-- Lets scoring rules change mid-season without rewriting history.
-- The scoring route is idempotent and re-running an episode is the normal
-- fix, so a global logic change would silently rescore past episodes.
-- Instead, each episode records which ruleset it was played under.
--
--   rules_version 1  (E1-E2)  Going Home miss scores the survivor's base points
--   rules_version 2  (E3+)    Going Home is all-or-nothing:
--                               right = (points x 2) + 5
--                               wrong = 0
--                               nobody leaves = 0 for everyone
--
-- Default is 2 so any episode row added later (e.g. a Thanksgiving
-- reschedule) gets the current rules.

begin;

alter table episodes
  add column if not exists rules_version int not null default 2;

alter table episodes drop constraint if exists episodes_rules_version_check;
alter table episodes add constraint episodes_rules_version_check
  check (rules_version >= 1);

update episodes
set rules_version = 1
where season_id = '550e8400-e29b-41d4-a716-446655440051'
  and number <= 2;

commit;

-- VERIFY: expect E1-E2 = 1, E3-E13 = 2
select number, air_date, title, rules_version, is_post_merge
from episodes
where season_id = '550e8400-e29b-41d4-a716-446655440051'
order by number;
