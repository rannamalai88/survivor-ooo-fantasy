-- ============================================================
-- Survivor OOO Fantasy — Database Schema Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. SEASONS
-- ============================================================
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'drafting', 'active', 'completed')),
  current_episode INTEGER DEFAULT 1,
  total_episodes INTEGER DEFAULT 13,
  pick_deadline_day TEXT DEFAULT 'wednesday',
  pick_deadline_time TEXT DEFAULT '19:00',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. SURVIVORS (24 cast members per season)
-- ============================================================
CREATE TABLE survivors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  cast_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  tribe TEXT NOT NULL CHECK (tribe IN ('Vatu', 'Kalo', 'Cila')),
  photo_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  eliminated_episode INTEGER,
  elimination_order INTEGER,
  has_idol BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_survivors_season ON survivors(season_id);

-- ============================================================
-- 3. MANAGERS (12 league members per season)
-- ============================================================
CREATE TABLE managers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  is_commissioner BOOLEAN DEFAULT FALSE,
  draft_position INTEGER NOT NULL,
  partner_id UUID REFERENCES managers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_managers_season ON managers(season_id);

-- ============================================================
-- 4. COUPLES (6 pairings per season)
-- ============================================================
CREATE TABLE couples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  manager1_id UUID NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  manager2_id UUID NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  label TEXT NOT NULL
);

CREATE INDEX idx_couples_season ON couples(season_id);

-- ============================================================
-- 5. DRAFT PICKS (60 total = 12 managers × 5 rounds)
-- ============================================================
CREATE TABLE draft_picks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  survivor_id UUID NOT NULL REFERENCES survivors(id) ON DELETE CASCADE,
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 5),
  pick_number INTEGER NOT NULL,
  picked_by_id UUID REFERENCES managers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_draft_picks_season ON draft_picks(season_id);
CREATE INDEX idx_draft_picks_manager ON draft_picks(manager_id);

-- ============================================================
-- 6. TEAMS (denormalized roster view)
-- ============================================================
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  survivor_id UUID NOT NULL REFERENCES survivors(id) ON DELETE CASCADE,
  acquired_via TEXT NOT NULL DEFAULT 'draft' CHECK (acquired_via IN ('draft', 'swap_out', 'player_add')),
  acquired_round INTEGER,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_teams_season ON teams(season_id);
CREATE INDEX idx_teams_manager ON teams(manager_id);

-- ============================================================
-- 7. WEEKLY PICKS (captain, pool, NET, chip, backdoor)
-- ============================================================
CREATE TABLE weekly_picks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  episode INTEGER NOT NULL,
  captain_id UUID REFERENCES survivors(id),
  pool_pick_id UUID REFERENCES survivors(id),
  pool_backdoor_id UUID REFERENCES survivors(id),
  net_pick_id UUID REFERENCES survivors(id),
  chip_played INTEGER,
  chip_target TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  is_locked BOOLEAN DEFAULT FALSE,
  UNIQUE(season_id, manager_id, episode)
);

CREATE INDEX idx_weekly_picks_season_ep ON weekly_picks(season_id, episode);

-- ============================================================
-- 8. SURVIVOR SCORES (raw per-survivor, per-episode from FSG)
-- ============================================================
CREATE TABLE survivor_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  survivor_id UUID NOT NULL REFERENCES survivors(id) ON DELETE CASCADE,
  episode INTEGER NOT NULL,
  fsg_points INTEGER DEFAULT 0,
  manual_adjustment INTEGER DEFAULT 0,
  final_points INTEGER DEFAULT 0,
  scored_actions JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, survivor_id, episode)
);

CREATE INDEX idx_survivor_scores_season_ep ON survivor_scores(season_id, episode);

-- ============================================================
-- 9. MANAGER SCORES (calculated per-manager, per-episode)
-- ============================================================
CREATE TABLE manager_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  episode INTEGER NOT NULL,
  fantasy_points INTEGER DEFAULT 0,
  voted_out_bonus INTEGER DEFAULT 0,
  pool_weeks_survived INTEGER DEFAULT 0,
  net_correct BOOLEAN DEFAULT FALSE,
  chip_effect_detail TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, manager_id, episode)
);

CREATE INDEX idx_manager_scores_season_ep ON manager_scores(season_id, episode);

-- ============================================================
-- 10. MANAGER TOTALS (running leaderboard totals)
-- ============================================================
CREATE TABLE manager_totals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  fantasy_total INTEGER DEFAULT 0,
  pool_score NUMERIC DEFAULT 0,
  quinfecta_score INTEGER DEFAULT 0,
  net_total INTEGER DEFAULT 0,
  grand_total NUMERIC DEFAULT 0,
  rank INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, manager_id)
);

-- ============================================================
-- 11. POOL STATUS (per-manager pool game tracking)
-- ============================================================
CREATE TABLE pool_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'drowned', 'burnt', 'finished')),
  drowned_episode INTEGER,
  has_immunity_idol BOOLEAN DEFAULT FALSE,
  idol_used BOOLEAN DEFAULT FALSE,
  weeks_survived INTEGER DEFAULT 0,
  UNIQUE(season_id, manager_id)
);

-- ============================================================
-- 12. NET ANSWERS (correct answer per episode)
-- ============================================================
CREATE TABLE net_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  episode INTEGER NOT NULL,
  correct_survivor_id UUID REFERENCES survivors(id),
  episode_title TEXT,
  UNIQUE(season_id, episode)
);

-- ============================================================
-- 13. QUINFECTA SUBMISSIONS (finale predictions)
-- ============================================================
CREATE TABLE quinfecta_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  place_20th UUID REFERENCES survivors(id),
  place_21st UUID REFERENCES survivors(id),
  place_22nd UUID REFERENCES survivors(id),
  place_23rd UUID REFERENCES survivors(id),
  place_24th UUID REFERENCES survivors(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, manager_id)
);

-- ============================================================
-- 14. DYNASTY (historical rankings)
-- ============================================================
CREATE TABLE dynasty (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_name TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  final_rank INTEGER,
  UNIQUE(manager_name, season_number)
);

-- ============================================================
-- 15. CHIPS USED (tracking chip usage)
-- ============================================================
CREATE TABLE chips_used (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  manager_id UUID NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  chip_id INTEGER NOT NULL CHECK (chip_id BETWEEN 1 AND 5),
  episode INTEGER NOT NULL,
  target TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chips_used_season ON chips_used(season_id);

-- ============================================================
-- 16. ACTIVITY LOG (dashboard feed + audit trail)
-- ============================================================
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('score', 'pool', 'chip', 'draft', 'admin', 'trade')),
  message TEXT NOT NULL,
  manager_id UUID REFERENCES managers(id),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_log_season ON activity_log(season_id);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

-- ============================================================
-- ENABLE REALTIME on key tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE draft_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE weekly_picks;
ALTER PUBLICATION supabase_realtime ADD TABLE survivor_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE manager_totals;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE seasons;

-- ============================================================
-- ROW LEVEL SECURITY (permissive for now — Phase 2 will lock down)
-- ============================================================
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE survivors ENABLE ROW LEVEL SECURITY;
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE couples ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE survivor_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE manager_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE net_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE quinfecta_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dynasty ENABLE ROW LEVEL SECURITY;
ALTER TABLE chips_used ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Allow all reads for now (anon key can read everything)
CREATE POLICY "Allow public read" ON seasons FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON survivors FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON managers FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON couples FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON draft_picks FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON teams FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON weekly_picks FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON survivor_scores FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON manager_scores FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON manager_totals FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON pool_status FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON net_answers FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON quinfecta_submissions FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON dynasty FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON chips_used FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON activity_log FOR SELECT USING (true);

-- Allow all writes for now (will restrict to authenticated users in Phase 2)
CREATE POLICY "Allow public insert" ON seasons FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON survivors FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON managers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON couples FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON draft_picks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON weekly_picks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON survivor_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON manager_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON manager_totals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON pool_status FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON net_answers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON quinfecta_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON dynasty FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON chips_used FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert" ON activity_log FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update" ON seasons FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON survivors FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON managers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON couples FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON draft_picks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON teams FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON weekly_picks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON survivor_scores FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON manager_scores FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON manager_totals FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON pool_status FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON net_answers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON quinfecta_submissions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON dynasty FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON chips_used FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update" ON activity_log FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow public delete" ON seasons FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON survivors FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON managers FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON couples FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON draft_picks FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON teams FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON weekly_picks FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON survivor_scores FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON manager_scores FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON manager_totals FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON pool_status FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON net_answers FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON quinfecta_submissions FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON dynasty FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON chips_used FOR DELETE USING (true);
CREATE POLICY "Allow public delete" ON activity_log FOR DELETE USING (true);
