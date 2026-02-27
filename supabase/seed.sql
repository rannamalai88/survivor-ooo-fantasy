-- ============================================================
-- Survivor OOO Fantasy — Seed Data
-- Run this AFTER the migration (001_initial_schema.sql)
-- Run in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. CREATE SEASON 50
-- ============================================================
INSERT INTO seasons (id, number, name, status, current_episode, total_episodes)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  50,
  'Survivor 50',
  'setup',
  1,
  13
);

-- ============================================================
-- 2. S50 CAST (24 survivors)
-- ============================================================
INSERT INTO survivors (id, season_id, cast_id, name, full_name, tribe, photo_url) VALUES
  ('00000000-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 1, 'Angelina', 'Angelina Keeley', 'Vatu', 'https://www.fantasysurvivorgame.com/images/50/draftpics/angelinaDFT.jpg'),
  ('00000000-0000-0000-0000-000000000002', '550e8400-e29b-41d4-a716-446655440000', 2, 'Aubry', 'Aubry Bracco', 'Vatu', 'https://www.fantasysurvivorgame.com/images/50/draftpics/aubryDFT.jpg'),
  ('00000000-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440000', 3, 'Coach', 'Benjamin "Coach" Wade', 'Kalo', 'https://www.fantasysurvivorgame.com/images/50/draftpics/coachDFT.jpg'),
  ('00000000-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 4, 'Charlie', 'Charlie Davis', 'Kalo', 'https://www.fantasysurvivorgame.com/images/50/draftpics/charlieDFT.jpg'),
  ('00000000-0000-0000-0000-000000000005', '550e8400-e29b-41d4-a716-446655440000', 5, 'Chrissy', 'Chrissy Hofbeck', 'Kalo', 'https://www.fantasysurvivorgame.com/images/50/draftpics/chrissyDFT.jpg'),
  ('00000000-0000-0000-0000-000000000006', '550e8400-e29b-41d4-a716-446655440000', 6, 'Christian', 'Christian Hubicki', 'Cila', 'https://www.fantasysurvivorgame.com/images/50/draftpics/christianDFT.jpg'),
  ('00000000-0000-0000-0000-000000000007', '550e8400-e29b-41d4-a716-446655440000', 7, 'Cirie', 'Cirie Fields', 'Cila', 'https://www.fantasysurvivorgame.com/images/50/draftpics/cirieDFT.jpg'),
  ('00000000-0000-0000-0000-000000000008', '550e8400-e29b-41d4-a716-446655440000', 8, 'Colby', 'Colby Donaldson', 'Vatu', 'https://www.fantasysurvivorgame.com/images/50/draftpics/colbyDFT.jpg'),
  ('00000000-0000-0000-0000-000000000009', '550e8400-e29b-41d4-a716-446655440000', 9, 'Dee', 'Dee Valladares', 'Kalo', 'https://www.fantasysurvivorgame.com/images/50/draftpics/deeDFT.jpg'),
  ('00000000-0000-0000-0000-000000000010', '550e8400-e29b-41d4-a716-446655440000', 10, 'Emily', 'Emily Flippen', 'Cila', 'https://www.fantasysurvivorgame.com/images/50/draftpics/emilyDFT.jpg'),
  ('00000000-0000-0000-0000-000000000011', '550e8400-e29b-41d4-a716-446655440000', 11, 'Genevieve', 'Genevieve Mushaluk', 'Vatu', 'https://www.fantasysurvivorgame.com/images/50/draftpics/genevieveDFT.jpg'),
  ('00000000-0000-0000-0000-000000000012', '550e8400-e29b-41d4-a716-446655440000', 12, 'Jenna', 'Jenna Lewis-Dougherty', 'Cila', 'https://www.fantasysurvivorgame.com/images/50/draftpics/jennaDFT.jpg'),
  ('00000000-0000-0000-0000-000000000013', '550e8400-e29b-41d4-a716-446655440000', 13, 'Joe', 'Joe Hunter', 'Cila', 'https://www.fantasysurvivorgame.com/images/50/draftpics/joeDFT.jpg'),
  ('00000000-0000-0000-0000-000000000014', '550e8400-e29b-41d4-a716-446655440000', 14, 'Jonathan', 'Jonathan Young', 'Kalo', 'https://www.fantasysurvivorgame.com/images/50/draftpics/jonathanDFT.jpg'),
  ('00000000-0000-0000-0000-000000000015', '550e8400-e29b-41d4-a716-446655440000', 15, 'Kamilla', 'Kamilla Karthigesu', 'Kalo', 'https://www.fantasysurvivorgame.com/images/50/draftpics/kamillaDFT.jpg'),
  ('00000000-0000-0000-0000-000000000016', '550e8400-e29b-41d4-a716-446655440000', 16, 'Kyle', 'Kyle Fraser', 'Vatu', 'https://www.fantasysurvivorgame.com/images/50/draftpics/kyleDFT.jpg'),
  ('00000000-0000-0000-0000-000000000017', '550e8400-e29b-41d4-a716-446655440000', 17, 'Mike', 'Mike White', 'Kalo', 'https://www.fantasysurvivorgame.com/images/50/draftpics/mikeDFT.jpg'),
  ('00000000-0000-0000-0000-000000000018', '550e8400-e29b-41d4-a716-446655440000', 18, 'Ozzy', 'Ozzy Lusth', 'Cila', 'https://www.fantasysurvivorgame.com/images/50/draftpics/ozzyDFT.jpg'),
  ('00000000-0000-0000-0000-000000000019', '550e8400-e29b-41d4-a716-446655440000', 19, '"Q"', 'Quintavius "Q" Burdette', 'Vatu', 'https://www.fantasysurvivorgame.com/images/50/draftpics/%22q%22DFT.jpg'),
  ('00000000-0000-0000-0000-000000000020', '550e8400-e29b-41d4-a716-446655440000', 20, 'Rick', 'Rick Devens', 'Cila', 'https://www.fantasysurvivorgame.com/images/50/draftpics/rickDFT.jpg'),
  ('00000000-0000-0000-0000-000000000021', '550e8400-e29b-41d4-a716-446655440000', 21, 'Rizo', 'Rizo Velovic', 'Vatu', 'https://www.fantasysurvivorgame.com/images/50/draftpics/rizoDFT.jpg'),
  ('00000000-0000-0000-0000-000000000022', '550e8400-e29b-41d4-a716-446655440000', 22, 'Savannah', 'Savannah Louie', 'Cila', 'https://www.fantasysurvivorgame.com/images/50/draftpics/savannahDFT.jpg'),
  ('00000000-0000-0000-0000-000000000023', '550e8400-e29b-41d4-a716-446655440000', 23, 'Stephenie', 'Stephenie LaGrossa Kendrick', 'Vatu', 'https://www.fantasysurvivorgame.com/images/50/draftpics/stephenieDFT.jpg'),
  ('00000000-0000-0000-0000-000000000024', '550e8400-e29b-41d4-a716-446655440000', 24, 'Tiffany', 'Tiffany Ervin', 'Kalo', 'https://www.fantasysurvivorgame.com/images/50/draftpics/tiffanyDFT.jpg');

-- ============================================================
-- 3. MANAGERS (12 league members)
-- Draft order: 1.Alli, 2.Alan, 3.Hari, 4.Stephanie, 5.Alec, 6.Veena,
--              7.Ramu, 8.Cassie, 9.Amy, 10.Michael, 11.Gisele, 12.Samin
-- ============================================================
INSERT INTO managers (id, season_id, name, email, is_commissioner, draft_position) VALUES
  ('10000000-0000-0000-0000-000000000001', '550e8400-e29b-41d4-a716-446655440000', 'Alli',      NULL, FALSE, 1),
  ('10000000-0000-0000-0000-000000000002', '550e8400-e29b-41d4-a716-446655440000', 'Alan',      NULL, FALSE, 2),
  ('10000000-0000-0000-0000-000000000003', '550e8400-e29b-41d4-a716-446655440000', 'Hari',      NULL, FALSE, 3),
  ('10000000-0000-0000-0000-000000000004', '550e8400-e29b-41d4-a716-446655440000', 'Stephanie', NULL, FALSE, 4),
  ('10000000-0000-0000-0000-000000000005', '550e8400-e29b-41d4-a716-446655440000', 'Alec',      NULL, FALSE, 5),
  ('10000000-0000-0000-0000-000000000006', '550e8400-e29b-41d4-a716-446655440000', 'Veena',     NULL, FALSE, 6),
  ('10000000-0000-0000-0000-000000000007', '550e8400-e29b-41d4-a716-446655440000', 'Ramu',      NULL, TRUE,  7),
  ('10000000-0000-0000-0000-000000000008', '550e8400-e29b-41d4-a716-446655440000', 'Cassie',    NULL, FALSE, 8),
  ('10000000-0000-0000-0000-000000000009', '550e8400-e29b-41d4-a716-446655440000', 'Amy',       NULL, FALSE, 9),
  ('10000000-0000-0000-0000-000000000010', '550e8400-e29b-41d4-a716-446655440000', 'Michael',   NULL, FALSE, 10),
  ('10000000-0000-0000-0000-000000000011', '550e8400-e29b-41d4-a716-446655440000', 'Gisele',    NULL, FALSE, 11),
  ('10000000-0000-0000-0000-000000000012', '550e8400-e29b-41d4-a716-446655440000', 'Samin',     NULL, FALSE, 12);

-- ============================================================
-- 4. SET PARTNER IDs
-- Draft partner pairings (1↔12, 2↔11, 3↔10, 4↔9, 5↔8, 6↔7)
-- Alli↔Samin, Alan↔Gisele, Hari↔Michael, Stephanie↔Amy, Alec↔Cassie, Veena↔Ramu
-- ============================================================
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000012' WHERE id = '10000000-0000-0000-0000-000000000001';
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000001' WHERE id = '10000000-0000-0000-0000-000000000012';
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000011' WHERE id = '10000000-0000-0000-0000-000000000002';
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000002' WHERE id = '10000000-0000-0000-0000-000000000011';
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000010' WHERE id = '10000000-0000-0000-0000-000000000003';
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000003' WHERE id = '10000000-0000-0000-0000-000000000010';
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000009' WHERE id = '10000000-0000-0000-0000-000000000004';
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000004' WHERE id = '10000000-0000-0000-0000-000000000009';
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000008' WHERE id = '10000000-0000-0000-0000-000000000005';
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000005' WHERE id = '10000000-0000-0000-0000-000000000008';
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000007' WHERE id = '10000000-0000-0000-0000-000000000006';
UPDATE managers SET partner_id = '10000000-0000-0000-0000-000000000006' WHERE id = '10000000-0000-0000-0000-000000000007';

-- ============================================================
-- 5. COUPLES
-- Couple pairings (for leaderboard)
-- ============================================================
INSERT INTO couples (season_id, manager1_id, manager2_id, label) VALUES
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'Alli & Alec'),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'Stephanie & Alan'),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000003', 'Amy & Hari'),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000007', 'Veena & Ramu'),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000010', 'Cassie & Michael'),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000012', 'Gisele & Samin');

-- ============================================================
-- 6. POOL STATUS (initialize all 12 managers as active)
-- Alli was S49 winner → has immunity idol
-- ============================================================
INSERT INTO pool_status (season_id, manager_id, status, has_immunity_idol, weeks_survived) VALUES
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000001', 'active', TRUE,  0),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000002', 'active', FALSE, 0),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000003', 'active', FALSE, 0),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000004', 'active', FALSE, 0),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000005', 'active', FALSE, 0),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000006', 'active', FALSE, 0),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000007', 'active', FALSE, 0),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000008', 'active', FALSE, 0),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000009', 'active', FALSE, 0),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000010', 'active', FALSE, 0),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000011', 'active', FALSE, 0),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000012', 'active', FALSE, 0);

-- ============================================================
-- 7. MANAGER TOTALS (initialize all at 0)
-- ============================================================
INSERT INTO manager_totals (season_id, manager_id, fantasy_total, pool_score, quinfecta_score, net_total, grand_total, rank) VALUES
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000001', 0, 0, 0, 0, 0, 1),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000002', 0, 0, 0, 0, 0, 2),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000003', 0, 0, 0, 0, 0, 3),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000004', 0, 0, 0, 0, 0, 4),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000005', 0, 0, 0, 0, 0, 5),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000006', 0, 0, 0, 0, 0, 6),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000007', 0, 0, 0, 0, 0, 7),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000008', 0, 0, 0, 0, 0, 8),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000009', 0, 0, 0, 0, 0, 9),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000010', 0, 0, 0, 0, 0, 10),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000011', 0, 0, 0, 0, 0, 11),
  ('550e8400-e29b-41d4-a716-446655440000', '10000000-0000-0000-0000-000000000012', 0, 0, 0, 0, 0, 12);

-- ============================================================
-- 8. DYNASTY (historical rankings S44-S49)
-- ============================================================
-- Alan
INSERT INTO dynasty (manager_name, season_number, final_rank) VALUES
  ('Alan', 44, 3), ('Alan', 45, 5), ('Alan', 46, 4), ('Alan', 47, 1), ('Alan', 48, 2), ('Alan', 49, 2);
-- Hari
INSERT INTO dynasty (manager_name, season_number, final_rank) VALUES
  ('Hari', 44, 2), ('Hari', 45, 1), ('Hari', 46, 5), ('Hari', 47, 2), ('Hari', 48, 10), ('Hari', 49, 3);
-- Veena
INSERT INTO dynasty (manager_name, season_number, final_rank) VALUES
  ('Veena', 44, 1), ('Veena', 45, 3), ('Veena', 46, 3), ('Veena', 47, 7), ('Veena', 48, 6), ('Veena', 49, 6);
-- Ramu
INSERT INTO dynasty (manager_name, season_number, final_rank) VALUES
  ('Ramu', 44, 4), ('Ramu', 45, 2), ('Ramu', 46, 10), ('Ramu', 47, 3), ('Ramu', 48, 1), ('Ramu', 49, 7);
-- Stephanie
INSERT INTO dynasty (manager_name, season_number, final_rank) VALUES
  ('Stephanie', 44, 5), ('Stephanie', 45, 7), ('Stephanie', 46, 3), ('Stephanie', 47, 4), ('Stephanie', 48, 7), ('Stephanie', 49, 4);
-- Alli
INSERT INTO dynasty (manager_name, season_number, final_rank) VALUES
  ('Alli', 45, 6), ('Alli', 46, 8), ('Alli', 47, 10), ('Alli', 48, 4), ('Alli', 49, 1);
-- Amy
INSERT INTO dynasty (manager_name, season_number, final_rank) VALUES
  ('Amy', 44, 6), ('Amy', 45, 4), ('Amy', 46, 6), ('Amy', 47, 5), ('Amy', 48, 9), ('Amy', 49, 9);
-- Alec
INSERT INTO dynasty (manager_name, season_number, final_rank) VALUES
  ('Alec', 45, 8), ('Alec', 46, 7), ('Alec', 47, 8), ('Alec', 48, 5), ('Alec', 49, 5);
-- Cassie
INSERT INTO dynasty (manager_name, season_number, final_rank) VALUES
  ('Cassie', 45, 10), ('Cassie', 46, 1), ('Cassie', 47, 9), ('Cassie', 48, 8), ('Cassie', 49, 8);
-- Michael
INSERT INTO dynasty (manager_name, season_number, final_rank) VALUES
  ('Michael', 45, 9), ('Michael', 46, 9), ('Michael', 47, 6), ('Michael', 48, 3), ('Michael', 49, 10);
-- Gisele (new for S50 — no dynasty data)
-- Samin (new for S50 — no dynasty data)
