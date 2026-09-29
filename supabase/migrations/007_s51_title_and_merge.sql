-- S51 STEP 4 — EPISODE TITLES + MERGE FLAG
--
-- Supports two changes:
--   1. Auto-pulled episode titles (The Futon Critic), shown on the pick card
--   2. Pre-merge / post-merge penalty rulesets
--
-- Purely additive. Run as one file.

begin;

alter table episodes
  -- Scraped from thefutoncritic.com, ~6 days ahead of air.
  add column if not exists title            text,
  add column if not exists title_source     text,
  add column if not exists title_fetched_at timestamptz,

  -- Which penalty ruleset applies to THIS episode.
  -- false = pre-merge:  only the Immunity slot is penalised
  -- true  = post-merge: Immunity and Going Home are both penalised
  -- Set true from the episode AFTER the merge airs, never during it —
  -- picks lock before the episode, so nobody is scored under a rule
  -- they could not see when they submitted.
  add column if not exists is_post_merge    boolean not null default false,

  -- Set on the episode where FSG logs the "Merge" action.
  add column if not exists merge_aired      boolean not null default false;

commit;

-- VERIFY: expect 4 rows
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'episodes'
  and column_name in ('title','title_source','title_fetched_at','is_post_merge','merge_aired')
order by column_name;

-- Seed the two titles already published
update episodes e set title = v.t, title_source = 'thefutoncritic', title_fetched_at = now()
from (values (1,'Permanent Uncertainty'), (2,'Weaponized Honesty')) as v(n,t)
where e.number = v.n
  and e.season_id = '550e8400-e29b-41d4-a716-446655440051';

-- VERIFY: expect E1 and E2 titled, E3+ null
select number, air_date, title, is_post_merge
from episodes
where season_id = '550e8400-e29b-41d4-a716-446655440051'
order by number;
