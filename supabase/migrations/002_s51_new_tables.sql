-- S51 STEP 1 — NEW TABLES (purely additive, safe to run now)
--
-- Nothing here touches an existing table, so it cannot break the live app.
-- The ALTER statements (weekly_picks columns, survivors.tribe constraint,
-- quinfecta place columns) come in step 2, AFTER introspection confirms
-- what's actually in the live database.
--
-- Safe to re-run: every statement is IF NOT EXISTS.

begin;

-- 1. episodes -----------------------------------------------------------
-- Air dates must be data, not premiere + 7*n. CBS hasn't confirmed 13
-- episodes and Nov 25 (Thanksgiving eve) may be preempted.
create table if not exists episodes (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references seasons(id) on delete cascade,
  number          int  not null,
  air_date        date not null,
  lock_at         timestamptz not null,
  is_finale       boolean not null default false,
  h2h_round       int check (h2h_round between 1 and 11),
  is_couples_week boolean not null default false,
  is_rivalry_week boolean not null default false,
  status          text not null default 'scheduled'
                  check (status in ('scheduled','aired','scored')),
  created_at      timestamptz not null default now(),
  unique (season_id, number),
  unique (season_id, h2h_round)
);

-- 2. fixtures -----------------------------------------------------------
-- Keyed on ROUND, not episode. Moving Couples Week is then a one-row
-- update on episodes.h2h_round and never a fixture rewrite.
create table if not exists fixtures (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id) on delete cascade,
  round      int  not null check (round between 1 and 11),
  manager_a  uuid not null references managers(id),
  manager_b  uuid not null references managers(id),
  created_at timestamptz not null default now(),
  check (manager_a <> manager_b),
  unique (season_id, round, manager_a),
  unique (season_id, round, manager_b)
);

-- 3. episode_events -----------------------------------------------------
-- One row per survivor per FSG action. The audit trail behind every score.
create table if not exists episode_events (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons(id) on delete cascade,
  episode     int  not null,
  survivor_id uuid not null references survivors(id),
  action      text not null,          -- verbatim FSG string
  points      int  not null,          -- verbatim value from the page
  category    text not null
              check (category in ('reward','immunity','other','departure')),
  created_at  timestamptz not null default now(),
  unique (season_id, episode, survivor_id, action)
);
create index if not exists episode_events_lookup
  on episode_events (season_id, episode);

-- 4. episode_outcomes ---------------------------------------------------
-- Derived from episode_events. Arrays because ties and multi-boots are normal.
create table if not exists episode_outcomes (
  season_id         uuid not null references seasons(id) on delete cascade,
  episode           int  not null,
  reward_happened   boolean not null default false,
  immunity_happened boolean not null default false,
  reward_winners    uuid[] not null default '{}',
  immunity_winners  uuid[] not null default '{}',
  departures        uuid[] not null default '{}',
  mop_winners       uuid[] not null default '{}',
  computed_at       timestamptz not null default now(),
  primary key (season_id, episode)
);

-- 5. score_lines --------------------------------------------------------
-- The transparency table. Every point a manager earns is one row with a
-- plain-English reason rendered verbatim in the breakdown view.
create table if not exists score_lines (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons(id) on delete cascade,
  episode     int  not null,
  manager_id  uuid not null references managers(id),
  slot        text not null check (slot in
              ('reward','immunity','going_home','mop','title','adjustment')),
  survivor_id uuid references survivors(id),
  base_points int  not null default 0,
  multiplier  numeric(3,1) not null default 1.0,
  bonus       int  not null default 0,   -- +5 going home, +1 title
  penalty     int  not null default 0,   -- negative
  total       int  not null,             -- may be negative
  reason      text not null,
  created_at  timestamptz not null default now()
);
create index if not exists score_lines_lookup
  on score_lines (season_id, episode, manager_id);

-- 6. h2h_results --------------------------------------------------------
create table if not exists h2h_results (
  season_id    uuid not null references seasons(id) on delete cascade,
  episode      int  not null,
  fixture_id   uuid not null references fixtures(id),
  score_a      int  not null,
  score_b      int  not null,
  points_a     int  not null,
  points_b     int  not null,
  chip_a       text,
  chip_b       text,
  shadow_a     int  not null default 0,  -- of the other 11, how many outscored
  shadow_b     int  not null default 0,
  computed_at  timestamptz not null default now(),
  primary key (season_id, episode, fixture_id)
);

commit;

-- VERIFY ----------------------------------------------------------------
-- expect all six listed as 'yes'
select t.name,
       case when c.table_name is null then 'MISSING' else 'yes' end as created
from (values ('episodes'),('fixtures'),('episode_events'),
             ('episode_outcomes'),('score_lines'),('h2h_results')) as t(name)
left join information_schema.tables c
  on c.table_name = t.name and c.table_schema = 'public';
