-- S51 STEP 3 — SCORING COLUMNS
--
-- Adds the columns the new scoring model needs to the existing
-- manager_scores and manager_totals tables. Purely additive; all S50
-- columns are retained so last season's data stays readable.
--
-- Run as one file. Tested against a schema replica.

begin;

-- Per-episode results -------------------------------------------------
alter table manager_scores
  add column if not exists card_total     int,      -- may be NEGATIVE
  add column if not exists penalty_total  int not null default 0,
  add column if not exists title_correct  boolean not null default false,
  add column if not exists chip           text,
  add column if not exists chip_slot      text,
  add column if not exists h2h_points     int,      -- 3 / 1 / 0, doubled by chip
  add column if not exists shadow_beat    int;      -- of the other 11

-- Season standings ----------------------------------------------------
alter table manager_totals
  add column if not exists h2h_points          int not null default 0,
  add column if not exists raw_card_points     int not null default 0,  -- tiebreak
  add column if not exists fantasy_rank        int,
  add column if not exists pool_rank           int,
  add column if not exists quinfecta_rank      int,
  add column if not exists champ_fantasy       numeric(5,2) not null default 0,
  add column if not exists champ_pool          numeric(5,2) not null default 0,
  add column if not exists champ_quinfecta     numeric(5,2) not null default 0,
  add column if not exists championship_points numeric(5,2) not null default 0;

commit;

-- RETIRED for S51 (kept for S50 history, simply not written):
--   manager_scores.base_team_points, captain_bonus, captain_lost,
--                  voted_out_bonus, net_correct, chip_played, chip_detail
--   manager_totals.net_total, sole_survivor_bonus, grand_total
--   tables: teams, draft_picks
--   weekly_picks: captain_id, swap_out_ids, swap_in_ids, player_add_id,
--                 chip_played, chip_target, net_pick_id
--     (net_pick_id is superseded by title_pick_id)

-- VERIFY: expect 7 then 10
select
 (select count(*) from information_schema.columns
   where table_name='manager_scores' and column_name in
   ('card_total','penalty_total','title_correct','chip','chip_slot',
    'h2h_points','shadow_beat')) as ms_new,
 (select count(*) from information_schema.columns
   where table_name='manager_totals' and column_name in
   ('h2h_points','raw_card_points','fantasy_rank','pool_rank','quinfecta_rank',
    'champ_fantasy','champ_pool','champ_quinfecta','championship_points',
    'fantasy_total')) as mt_new;
