-- S51 STEP 2 — ALTERS + SEED
--
-- Written against the live schema confirmed 2026-09-26.
-- Run STEP 1 (new tables) first.
--
-- Each section is its own transaction. Run them ONE AT A TIME, reading the
-- verify output between each. If a section errors, stop and report it — do
-- not continue to the next.
--
-- S51 season id is fixed at 550e8400-e29b-41d4-a716-446655440051 so every
-- later script can reference it directly. Put it in .env.local as
-- NEXT_PUBLIC_SEASON_ID as soon as section B commits.


-- ======================================================================
-- SECTION A — survivors: tribe constraint, fsg_id, new columns
-- ======================================================================
-- The existing CHECK allows only Vatu/Kalo/Cila and 24 S50 rows satisfy it.
-- Replacing it with S51-only values would fail validation against that data,
-- so the new constraint keeps the old values as well.

begin;

alter table survivors drop constraint if exists survivors_tribe_check;
alter table survivors add constraint survivors_tribe_check
  check (tribe in ('Vatu','Kalo','Cila','Savu','Toka','Merge','Host'));

-- Match FSG by numeric id, never by name. "Angelica \"Jelly\" Loblack" and
-- "An \"Thien An\" Nguyen" arrive HTML-encoded and will not name-match.
alter table survivors add column if not exists fsg_id integer;

-- Written once at seed, never updated. FSG reports tribe as "Out" after
-- elimination, so a naive upsert would destroy tribe history.
alter table survivors add column if not exists original_tribe text;

-- Jeff is selectable in the Title slot only.
alter table survivors add column if not exists is_playable boolean not null default true;

create unique index if not exists survivors_season_fsg
  on survivors (season_id, fsg_id) where fsg_id is not null;

commit;

-- VERIFY A: expect fsg_id, original_tribe, is_playable present
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='survivors'
  and column_name in ('fsg_id','original_tribe','is_playable');


-- ======================================================================
-- SECTION B — the S51 season row
-- ======================================================================

begin;

insert into seasons (id, number, name, status, current_episode, total_episodes,
                     pick_deadline_day, pick_deadline_time)
values ('550e8400-e29b-41d4-a716-446655440051', 51, 'Survivor 51', 'active', 1, 13,
        'wednesday', '19:00')
on conflict (id) do nothing;

commit;

-- VERIFY B: expect S50 completed, S51 active. COPY THE S51 ID TO .env.local.
select id, number, name, status, current_episode, total_episodes
from seasons order by number;


-- ======================================================================
-- SECTION C — weekly_picks: the five slots
-- ======================================================================
-- Old columns (captain_id, swap_out_ids, swap_in_ids, player_add_id,
-- chip_played, chip_target) are RETAINED so S50 history stays readable.
-- The S51 code simply stops writing them.

begin;

alter table weekly_picks
  add column if not exists reward_pick_id     uuid references survivors(id),
  add column if not exists immunity_pick_id   uuid references survivors(id),
  add column if not exists going_home_pick_id uuid references survivors(id),
  add column if not exists mop_pick_id        uuid references survivors(id),
  add column if not exists title_pick_id      uuid references survivors(id),
  add column if not exists chip               text,
  add column if not exists chip_slot          text,
  add column if not exists hedge_alt_id       uuid references survivors(id);

alter table weekly_picks drop constraint if exists weekly_picks_chip_check;
alter table weekly_picks add constraint weekly_picks_chip_check
  check (chip is null or chip in
    ('triple_down','double_fixture','point_shield','hedge'));

alter table weekly_picks drop constraint if exists weekly_picks_chip_slot_check;
alter table weekly_picks add constraint weekly_picks_chip_slot_check
  check (chip_slot is null or chip_slot in
    ('reward','immunity','going_home','mop'));

-- One chip per manager per season, enforced in the database.
create unique index if not exists weekly_picks_one_chip_per_season
  on weekly_picks (season_id, manager_id, chip) where chip is not null;

commit;

-- NOTE: slot uniqueness (the four roster picks being pairwise distinct) is
-- enforced in application code, not here — the SQL is unreadable and the
-- error message needs to be human.

-- VERIFY C: expect 8 new columns
select column_name from information_schema.columns
where table_schema='public' and table_name='weekly_picks'
  and column_name in ('reward_pick_id','immunity_pick_id','going_home_pick_id',
                      'mop_pick_id','title_pick_id','chip','chip_slot','hedge_alt_id')
order by column_name;


-- ======================================================================
-- SECTION D — quinfecta: places 1-5
-- ======================================================================
-- FSG numbers the winner 1st and the first boot 21st (Aaliyah is logged as
-- 21st place). Altering quinfecta_predictions, which CLAUDE.md says the code
-- uses. quinfecta_submissions is left untouched.

begin;

alter table quinfecta_predictions
  add column if not exists place_1_id uuid references survivors(id),
  add column if not exists place_2_id uuid references survivors(id),
  add column if not exists place_3_id uuid references survivors(id),
  add column if not exists place_4_id uuid references survivors(id),
  add column if not exists place_5_id uuid references survivors(id);

commit;

-- VERIFY D
select column_name from information_schema.columns
where table_schema='public' and table_name='quinfecta_predictions'
  and column_name like 'place_%' order by column_name;


-- ======================================================================
-- SECTION E — managers, couples, pool_status for S51
-- ======================================================================
-- Managers are season-scoped, so S51 needs its own 12 rows.
-- Names and emails are copied from S50 so the fixtures seed can join on name.
-- partner_id is NOT copied: in S50 it held the R5 draft partner, and there is
-- no draft in S51. Couples live in the couples table.

begin;

insert into managers (season_id, name, email, is_commissioner, draft_position)
select '550e8400-e29b-41d4-a716-446655440051', m.name, m.email,
       m.is_commissioner, m.draft_position
from managers m join seasons s on s.id = m.season_id
where s.number = 50
on conflict do nothing;

-- Couples as confirmed by the commissioner for S51.
insert into couples (season_id, manager1_id, manager2_id, label)
select '550e8400-e29b-41d4-a716-446655440051', a.id, b.id, v.label
from (values
  ('Alli','Alec','Alli & Alec'),
  ('Amy','Hari','Amy & Hari'),
  ('Cassie','Michael','Cassie & Michael'),
  ('Gisele','Samin','Gisele & Samin'),
  ('Stephanie','Alan','Stephanie & Alan'),
  ('Veena','Ramu','Veena & Ramu')
) as v(a,b,label)
join managers a on a.name=v.a and a.season_id='550e8400-e29b-41d4-a716-446655440051'
join managers b on b.name=v.b and b.season_id='550e8400-e29b-41d4-a716-446655440051';

-- Pool: everyone active. Alli holds the Dynasty Idol as S50 champion.
insert into pool_status (season_id, manager_id, status, has_immunity_idol,
                         idol_used, weeks_survived)
select '550e8400-e29b-41d4-a716-446655440051', m.id, 'active',
       (m.name = 'Alli'), false, 0
from managers m
where m.season_id = '550e8400-e29b-41d4-a716-446655440051';

commit;

-- VERIFY E: expect 12 managers, 6 couples, 12 pool rows, 1 idol (Alli)
select (select count(*) from managers where season_id='550e8400-e29b-41d4-a716-446655440051') managers,
       (select count(*) from couples  where season_id='550e8400-e29b-41d4-a716-446655440051') couples,
       (select count(*) from pool_status where season_id='550e8400-e29b-41d4-a716-446655440051') pool,
       (select count(*) from pool_status where season_id='550e8400-e29b-41d4-a716-446655440051'
          and has_immunity_idol) idols;

-- expect ZERO rows — every manager in exactly one couple
select m.name from managers m
where m.season_id='550e8400-e29b-41d4-a716-446655440051'
  and not exists (select 1 from couples c
    where c.season_id=m.season_id and m.id in (c.manager1_id,c.manager2_id));


-- S51 STEP 2 — SECTION F (v3)
--
-- v1 failed: "full" is a reserved word in Postgres.
-- v2 failed: 13 target columns, 12 expressions — is_playable was dropped
--            during the alias rename.
-- v3: column/expression alignment verified programmatically (13 = 13).
--
-- Sections A-E have already committed. Run this on its own.
--
-- elimination_order keeps the S50 convention: 1 = first out, 21 = winner.
-- FSG's "Place" is the INVERSE (21 = first out): elimination_order = 22 - place


-- VERIFY BEFORE: expect 0
select count(*) as existing_s51_survivors
from survivors where season_id = '550e8400-e29b-41d4-a716-446655440051';


begin;

insert into survivors (season_id, fsg_id, cast_id, name, full_name, tribe,
                       original_tribe, photo_url, is_active, is_playable,
                       eliminated_episode, elimination_order, has_idol)
select '550e8400-e29b-41d4-a716-446655440051',
       v.fsg, v.fsg - 535, v.nm, v.fullnm, v.tribe, v.tribe,
       'https://www.fantasysurvivorgame.com/images/51/thumbs/'
         || v.photokey || 'SOLE.jpg',
       v.is_act, true, v.elim_ep, v.elim_ord, false
from (values
  (536,'Aaliyah','Aaliyah Puglia','Toka','aaliyah',           false,   1,    1),
  (537,'Alexis','Alexis Levine','Savu','alexis',               true, null, null),
  (538,'Thien An','An "Thien An" Nguyen','Toka','thien%20an',  true, null, null),
  (539,'Ana','Ana Sani','Savu','ana',                          true, null, null),
  (540,'Jelly','Angelica "Jelly" Loblack','Toka','jelly',      true, null, null),
  (541,'Brady','Brady Booker','Toka','brady',                  true, null, null),
  (542,'Carter','Carter Krull','Savu','carter',                true, null, null),
  (543,'Cristian','Cristian Chavez','Savu','cristian',         true, null, null),
  (544,'Kilby','Danny Kilby','Toka','kilby',                   true, null, null),
  (545,'Devin','Devin Way','Toka','devin',                     true, null, null),
  (546,'Eric','Eric Macksoud','Savu','eric',                   true, null, null),
  (547,'Jenna','Jenna Doore','Toka','jenna',                   true, null, null),
  (548,'Kristin','Kristin Flickinger','Savu','kristin',        true, null, null),
  (549,'Lewis','Lewis Kelly','Toka','lewis',                   true, null, null),
  (550,'Linnea','Linnea Capobianco','Savu','linnea',           true, null, null),
  (551,'Maggie','Maggie Nestor','Toka','maggie',               true, null, null),
  (552,'Mike','Mike Pinsky','Toka','mike',                     true, null, null),
  (553,'Ori','Ori Jean-Charles','Savu','ori',                  true, null, null),
  (554,'Patt','Patt Cannaday','Toka','patt',                   true, null, null),
  (555,'Rob','Rob Antonson','Savu','rob',                      true, null, null),
  (556,'Sharonda','Sharonda Cox','Savu','sharonda',            true, null, null)
) as v(fsg, nm, fullnm, tribe, photokey, is_act, elim_ep, elim_ord);

-- Jeff: Title slot only, never playable, never scored. (11 cols, 11 values)
insert into survivors (season_id, fsg_id, cast_id, name, full_name, tribe,
                       original_tribe, photo_url, is_active, is_playable,
                       has_idol)
values ('550e8400-e29b-41d4-a716-446655440051', null, 99, 'Jeff', 'Jeff Probst',
        'Host', 'Host', null, true, false, false);

commit;


-- VERIFY AFTER: expect 22 / 21 / 10 / 11 / 1 / 1
select count(*) total,
       count(*) filter (where is_playable)     playable,
       count(*) filter (where tribe = 'Savu')  savu,
       count(*) filter (where tribe = 'Toka')  toka,
       count(*) filter (where tribe = 'Host')  host,
       count(*) filter (where not is_active)   eliminated
from survivors where season_id = '550e8400-e29b-41d4-a716-446655440051';

-- eyeball the roster
select fsg_id, cast_id, name, full_name, tribe, is_active, elimination_order
from survivors
where season_id = '550e8400-e29b-41d4-a716-446655440051'
order by cast_id;