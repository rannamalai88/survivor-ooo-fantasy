-- S51 schedule seed. Run AFTER new tables exist, the S51 season row exists,
-- and S51 managers are seeded. Joins on managers.name, so it is re-runnable.
-- Couples Week = Round 6 = E7. Rivalry Week = Round 11 = E12.

begin;

-- 1. Episodes -------------------------------------------------------
insert into episodes (season_id, number, air_date, lock_at, is_finale, h2h_round,
                      is_couples_week, is_rivalry_week, status)
select s.id, v.number, v.air_date::date,
       (v.air_date || ' 19:00:00 America/Chicago')::timestamptz,
       v.is_finale, v.h2h_round, v.couples, v.rivalry, v.status
from seasons s, (values
  (1,'2026-09-23',false,null,false,false,'aired'),
  (2,'2026-09-30',false,1,false,false,'scheduled'),
  (3,'2026-10-07',false,2,false,false,'scheduled'),
  (4,'2026-10-14',false,3,false,false,'scheduled'),
  (5,'2026-10-21',false,4,false,false,'scheduled'),
  (6,'2026-10-28',false,5,false,false,'scheduled'),
  (7,'2026-11-04',false,6,true,false,'scheduled'),
  (8,'2026-11-11',false,7,false,false,'scheduled'),
  (9,'2026-11-18',false,8,false,false,'scheduled'),
  (10,'2026-11-25',false,9,false,false,'scheduled'),
  (11,'2026-12-02',false,10,false,false,'scheduled'),
  (12,'2026-12-09',false,11,false,true,'scheduled'),
  (13,'2026-12-16',true,null,false,false,'scheduled')
) as v(number, air_date, is_finale, h2h_round, couples, rivalry, status)
where s.number = 51;

-- 2. Fixtures -------------------------------------------------------
insert into fixtures (season_id, round, manager_a, manager_b)
select s.id, v.round, ma.id, mb.id
from seasons s
cross join (values
  (1,'Alan','Alec'),
  (1,'Alli','Amy'),
  (1,'Cassie','Gisele'),
  (1,'Hari','Michael'),
  (1,'Ramu','Stephanie'),
  (1,'Samin','Veena'),
  (2,'Alan','Alli'),
  (2,'Alec','Amy'),
  (2,'Cassie','Hari'),
  (2,'Gisele','Ramu'),
  (2,'Michael','Veena'),
  (2,'Samin','Stephanie'),
  (3,'Alan','Amy'),
  (3,'Alec','Cassie'),
  (3,'Alli','Gisele'),
  (3,'Hari','Veena'),
  (3,'Michael','Stephanie'),
  (3,'Ramu','Samin'),
  (4,'Alan','Cassie'),
  (4,'Alec','Hari'),
  (4,'Alli','Samin'),
  (4,'Amy','Stephanie'),
  (4,'Gisele','Veena'),
  (4,'Michael','Ramu'),
  (5,'Alan','Gisele'),
  (5,'Alec','Michael'),
  (5,'Alli','Stephanie'),
  (5,'Amy','Ramu'),
  (5,'Cassie','Veena'),
  (5,'Hari','Samin'),
  (6,'Alan','Stephanie'),
  (6,'Alec','Alli'),
  (6,'Amy','Hari'),
  (6,'Cassie','Michael'),
  (6,'Gisele','Samin'),
  (6,'Ramu','Veena'),
  (7,'Alan','Michael'),
  (7,'Alec','Ramu'),
  (7,'Alli','Veena'),
  (7,'Amy','Samin'),
  (7,'Cassie','Stephanie'),
  (7,'Gisele','Hari'),
  (8,'Alan','Ramu'),
  (8,'Alec','Samin'),
  (8,'Alli','Cassie'),
  (8,'Amy','Veena'),
  (8,'Gisele','Michael'),
  (8,'Hari','Stephanie'),
  (9,'Alan','Samin'),
  (9,'Alec','Veena'),
  (9,'Alli','Michael'),
  (9,'Amy','Cassie'),
  (9,'Gisele','Stephanie'),
  (9,'Hari','Ramu'),
  (10,'Alan','Veena'),
  (10,'Alec','Stephanie'),
  (10,'Alli','Hari'),
  (10,'Amy','Gisele'),
  (10,'Cassie','Ramu'),
  (10,'Michael','Samin'),
  (11,'Alan','Hari'),
  (11,'Alec','Gisele'),
  (11,'Alli','Ramu'),
  (11,'Amy','Michael'),
  (11,'Cassie','Samin'),
  (11,'Stephanie','Veena')
) as v(round, a, b)
join managers ma on ma.name = v.a and ma.season_id = s.id
join managers mb on mb.name = v.b and mb.season_id = s.id
where s.number = 51;

commit;

-- 3. VERIFY ---------------------------------------------------------
-- expect: 13 episodes, 11 with an h2h_round
select count(*) total, count(h2h_round) with_round from episodes e
  join seasons s on s.id=e.season_id where s.number=51;

-- expect: 66 fixtures across 11 rounds
select count(*) fixtures, count(distinct round) rounds from fixtures f
  join seasons s on s.id=f.season_id where s.number=51;

-- expect ZERO rows (every manager plays exactly 11 times).
-- Rows here almost certainly mean a managers.name mismatch.
select name, n from (
  select m.name, count(*) n from fixtures f
  join seasons s on s.id=f.season_id
  join managers m on m.id in (f.manager_a,f.manager_b) and m.season_id=s.id
  where s.number=51 group by m.name) t where n <> 11;

-- expect ZERO rows (no pairing repeats)
select least(manager_a,manager_b) a, greatest(manager_a,manager_b) b, count(*)
from fixtures f join seasons s on s.id=f.season_id where s.number=51
group by 1,2 having count(*) > 1;