'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, TRIBE_COLORS, COUPLES, CHIPS as CHIP_DEFS } from '@/lib/constants';

// ============================================================
// Types
// ============================================================
interface Manager {
  id: string;
  name: string;
  draft_position: number;
  is_commissioner: boolean;
}

interface SurvivorBasic {
  id: string;
  name: string;
  tribe: string;
  is_active: boolean;
  elimination_order: number | null;
  eliminated_episode: number | null;
}

interface TeamSurvivor {
  survivor_id: string;
  acquired_round: number;
  acquired_via: string;
  survivor: {
    id: string;
    name: string;
    tribe: string;
    is_active: boolean;
    elimination_order: number | null;
    eliminated_episode: number | null;
  };
}

interface SurvivorScoreRow {
  survivor_id: string;
  episode: number;
  final_points: number;
}

interface ManagerScoreRow {
  episode: number;
  fantasy_points: number;
  base_team_points: number;
  captain_bonus: number;
  voted_out_bonus: number;
  chip_bonus: number;
  captain_lost: boolean;
  chip_played: number | null;
}

interface WeeklyPickRow {
  manager_id: string;
  episode: number;
  captain_id: string | null;
  pool_pick_id: string | null;
  net_pick_id: string | null;
  chip_played: number | null;
  chip_target: string | null;
  swap_out_ids: string[] | null;
  swap_in_ids: string[] | null;
  player_add_id: string | null;
}

interface NetAnswerRow {
  episode: number;
  correct_survivor_id: string;
}

interface ManagerTotalRow {
  manager_id: string;
  fantasy_total: number;
  grand_total: number;
  rank: number;
}

// ============================================================
// Helpers
// ============================================================
const TC = TRIBE_COLORS as Record<string, string>;

function heatColor(val: number, min: number, max: number): string {
  if (!val || max === min) return 'transparent';
  const pct = (val - min) / (max - min);
  if (pct >= 0.75) return 'rgba(26,188,156,0.18)';
  if (pct >= 0.5)  return 'rgba(26,188,156,0.07)';
  if (pct >= 0.25) return 'rgba(255,107,53,0.07)';
  return 'rgba(231,76,60,0.13)';
}

const POOL_CFG: Record<string, { color: string; bg: string; label: string }> = {
  active:   { color: '#1ABC9C', bg: 'rgba(26,188,156,0.1)',  label: 'Active'    },
  finished: { color: '#FFD54F', bg: 'rgba(255,215,0,0.1)',   label: 'Finished!' },
  drowned:  { color: '#E74C3C', bg: 'rgba(231,76,60,0.1)',   label: 'Drowned'   },
  burnt:    { color: '#95a5a6', bg: 'rgba(149,165,166,0.1)', label: 'Burnt'     },
};

// ============================================================
// Main Component
// ============================================================
export default function MyTeamPage() {
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamSurvivor[]>([]);
  const [survivorScores, setSurvivorScores] = useState<SurvivorScoreRow[]>([]);
  const [managerScores, setManagerScores] = useState<ManagerScoreRow[]>([]);
  const [weeklyPicks, setWeeklyPicks] = useState<WeeklyPickRow[]>([]);
  const [netAnswers, setNetAnswers] = useState<NetAnswerRow[]>([]);
  const [survivors, setSurvivors] = useState<SurvivorBasic[]>([]);
  const [allTotals, setAllTotals] = useState<ManagerTotalRow[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<number>>(new Set());
  const [expandTotal, setExpandTotal] = useState(false);
  const [isCommissioner, setIsCommissioner] = useState(true);

  useEffect(() => { loadInitial(); }, []);

  async function loadInitial() {
    setLoading(true);
    const [seasonRes, managersRes, survivorsRes, netRes, totalsRes] = await Promise.all([
      supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
      supabase.from('managers').select('id, name, draft_position, is_commissioner').eq('season_id', SEASON_ID).order('draft_position'),
      supabase.from('survivors').select('id, name, tribe, is_active, elimination_order, eliminated_episode').eq('season_id', SEASON_ID),
      supabase.from('net_answers').select('episode, correct_survivor_id').eq('season_id', SEASON_ID).order('episode'),
      supabase.from('manager_totals').select('manager_id, fantasy_total, grand_total, rank').eq('season_id', SEASON_ID),
    ]);
    setCurrentEpisode(seasonRes.data?.current_episode || 2);
    setManagers(managersRes.data || []);
    setSurvivors((survivorsRes.data || []) as SurvivorBasic[]);
    setNetAnswers(netRes.data || []);
    setAllTotals(totalsRes.data || []);

    const mgrs = managersRes.data || [];
    const commissioner = mgrs.find((m: Manager) => m.is_commissioner);
    setSelectedManagerId(commissioner?.id || mgrs[0]?.id);
  }

  useEffect(() => {
    if (selectedManagerId) loadManagerData(selectedManagerId);
  }, [selectedManagerId]);

  async function loadManagerData(managerId: string) {
    setLoading(true);
    const [teamRes, scoresRes, mScoresRes, picksRes] = await Promise.all([
      supabase.from('teams')
        .select('survivor_id, acquired_round, acquired_via, survivors(id, name, tribe, is_active, elimination_order, eliminated_episode)')
        .eq('season_id', SEASON_ID).eq('manager_id', managerId).eq('is_active', true),
      supabase.from('survivor_scores').select('survivor_id, episode, final_points').eq('season_id', SEASON_ID),
      supabase.from('manager_scores')
        .select('episode, fantasy_points, base_team_points, captain_bonus, voted_out_bonus, chip_bonus, captain_lost, chip_played')
        .eq('season_id', SEASON_ID).eq('manager_id', managerId).order('episode'),
      supabase.from('weekly_picks')
        .select('manager_id, episode, captain_id, pool_pick_id, net_pick_id, chip_played, chip_target, swap_out_ids, swap_in_ids, player_add_id')
        .eq('season_id', SEASON_ID).eq('manager_id', managerId).order('episode'),
    ]);

    const teamData = (teamRes.data || []).map((t: any) => ({
      survivor_id: t.survivor_id,
      acquired_round: t.acquired_round,
      acquired_via: t.acquired_via,
      survivor: t.survivors,
    }));
    teamData.sort((a: TeamSurvivor, b: TeamSurvivor) => a.acquired_round - b.acquired_round);

    setTeam(teamData);
    setSurvivorScores(scoresRes.data || []);
    setManagerScores((mScoresRes.data || []) as ManagerScoreRow[]);
    setWeeklyPicks((picksRes.data || []) as WeeklyPickRow[]);
    setLoading(false);
  }

  // ---- Derived ----
  const selectedManager = managers.find(m => m.id === selectedManagerId);
  const managerTotal = allTotals.find(t => t.manager_id === selectedManagerId);
  const managerRank = managerTotal?.rank || 0;

  const partner = useMemo(() => {
    if (!selectedManager) return null;
    const couple = COUPLES.find(c => c.members.includes(selectedManager.name));
    return couple ? couple.members.find(n => n !== selectedManager.name) : null;
  }, [selectedManager]);

  const episodes = useMemo(() =>
    Array.from(new Set(survivorScores.map(s => s.episode))).sort((a, b) => a - b),
  [survivorScores]);

  const latestEp = episodes[episodes.length - 1] || null;

  const captainPrivLost = useMemo(() =>
    managerScores.some(ms => ms.captain_lost),
  [managerScores]);

  const currentCaptainId = useMemo(() => {
    return [...weeklyPicks].sort((a, b) => b.episode - a.episode).find(p => p.captain_id)?.captain_id || null;
  }, [weeklyPicks]);

  const currentCaptainName = useMemo(() => {
    return team.find(t => t.survivor_id === currentCaptainId)?.survivor.name || '—';
  }, [team, currentCaptainId]);

  // ---- Chip-driven roster changes ----
  // Per-episode: which permanent survivors were swapped OUT (chip 4)?
  // Cells for these (manager × episode) should be blanked since the survivor
  // wasn't on the effective team that ep — their FSG points didn't count.
  const swappedOutByEp = useMemo(() => {
    const map: Record<number, Set<string>> = {};
    weeklyPicks.forEach(p => {
      if (p.chip_played === 4 && p.swap_out_ids?.length) {
        map[p.episode] = new Set(p.swap_out_ids);
      }
    });
    return map;
  }, [weeklyPicks]);

  // Guest rows: survivors who were on the effective team for an episode via
  // chip 4 (swap_in) or chip 5 (player_add) but are NOT on the permanent roster.
  // Each guest row appears once per (survivor, chip episode) pair.
  // For chip 5 doubling-up (added survivor already on permanent team), the
  // guest row still renders separately so the second roster slot is visible
  // and both contributions are clear.
  const guestRows = useMemo(() => {
    interface GuestRow {
      survivor: SurvivorBasic;
      chipEp: number;
      chipType: 4 | 5;
      rowKey: string;
      scores: Record<number, number>;
      captainEps: number[];
      total: number;
    }
    const guests: GuestRow[] = [];

    weeklyPicks.forEach(p => {
      // Chip 4: each swap_in_id is a guest row
      if (p.chip_played === 4 && p.swap_in_ids?.length) {
        p.swap_in_ids.forEach((sid, i) => {
          const s = survivors.find(sv => sv.id === sid);
          if (!s) return;
          const score = survivorScores.find(ss => ss.survivor_id === sid && ss.episode === p.episode);
          const pts = score?.final_points || 0;
          guests.push({
            survivor: s,
            chipEp: p.episode,
            chipType: 4,
            rowKey: `swap-${p.episode}-${sid}-${i}`,
            scores: { [p.episode]: pts },
            captainEps: p.captain_id === sid ? [p.episode] : [],
            total: pts,
          });
        });
      }
      // Chip 5: player_add_id is a guest row
      if (p.chip_played === 5 && p.player_add_id) {
        const s = survivors.find(sv => sv.id === p.player_add_id);
        if (!s) return;
        const score = survivorScores.find(ss => ss.survivor_id === p.player_add_id && ss.episode === p.episode);
        const pts = score?.final_points || 0;
        guests.push({
          survivor: s,
          chipEp: p.episode,
          chipType: 5,
          rowKey: `add-${p.episode}-${p.player_add_id}`,
          scores: { [p.episode]: pts },
          captainEps: p.captain_id === p.player_add_id ? [p.episode] : [],
          total: pts,
        });
      }
    });
    return guests;
  }, [weeklyPicks, survivors, survivorScores]);

  // ---- Per-survivor scores (permanent roster) ----
  // Skip episodes where this survivor was swapped OUT — those points didn't
  // count for this manager that episode, so they shouldn't show on the row.
  const teamWithScores = useMemo(() => {
    return team.map(t => {
      const scores: Record<number, number> = {};
      let total = 0;
      survivorScores.filter(s => s.survivor_id === t.survivor_id).forEach(s => {
        if (swappedOutByEp[s.episode]?.has(t.survivor_id)) {
          // Cell will render as "OUT" — don't include in total either
          return;
        }
        scores[s.episode] = s.final_points;
        total += s.final_points;
      });
      const captainEps = weeklyPicks.filter(p => p.captain_id === t.survivor_id).map(p => p.episode);
      return { ...t, scores, total, captainEps };
    });
  }, [team, survivorScores, weeklyPicks, swappedOutByEp]);

  // Aggregate scoring totals from manager_scores
  const scoringTotals = useMemo(() => {
    let teamPts = 0, captainPts = 0, votedOutPts = 0, chipPts = 0;
    managerScores.forEach(ms => {
      teamPts    += ms.base_team_points || 0;
      captainPts += ms.captain_bonus    || 0;
      votedOutPts+= ms.voted_out_bonus  || 0;
      chipPts    += ms.chip_bonus       || 0;
    });
    return { teamPts, captainPts, votedOutPts, chipPts };
  }, [managerScores]);

  const topScorer = useMemo(() =>
    [...teamWithScores].sort((a, b) => b.total - a.total)[0],
  [teamWithScores]);

  const activePlayers = teamWithScores.filter(s => s.survivor.is_active).length;

  // NET record
  const netRecord = useMemo(() => {
    let correct = 0, total = 0;
    weeklyPicks.forEach(p => {
      if (!p.net_pick_id) return;
      const answer = netAnswers.find(a => a.episode === p.episode);
      if (answer) { total++; if (answer.correct_survivor_id === p.net_pick_id) correct++; }
    });
    return { correct, total, pts: correct * 3 };
  }, [weeklyPicks, netAnswers]);

  // Chip status with points earned
  const chipStatus = useMemo(() => {
    return (CHIP_DEFS || []).map((chip: any) => {
      const usedPick = weeklyPicks.find(p => p.chip_played === chip.id);
      const usedScore = usedPick ? managerScores.find(ms => ms.episode === usedPick.episode) : null;
      const [wStart, wEnd] = chip.window.replace('Week ', '').split('-').map(Number);
      const status = usedPick ? 'used'
        : currentEpisode >= wStart && currentEpisode <= wEnd ? 'available'
        : currentEpisode < wStart ? 'upcoming' : 'expired';
      return {
        ...chip, status,
        usedEpisode: usedPick?.episode,
        usedTarget: usedPick?.chip_target,
        ptsEarned: usedScore?.chip_bonus || 0,
      };
    });
  }, [weeklyPicks, managerScores, currentEpisode]);

  // Episode heat ranges (from permanent roster + guest rows for that ep)
  const epHeatRanges = useMemo(() => {
    const ranges: Record<number, { min: number; max: number }> = {};
    episodes.forEach(ep => {
      const permVals = teamWithScores.map(s => s.scores[ep] || 0).filter(v => v > 0);
      const guestVals = guestRows.filter(g => g.chipEp === ep).map(g => g.scores[ep] || 0).filter(v => v > 0);
      const vals = [...permVals, ...guestVals];
      ranges[ep] = { min: vals.length ? Math.min(...vals) : 0, max: vals.length ? Math.max(...vals) : 0 };
    });
    return ranges;
  }, [teamWithScores, guestRows, episodes]);

  function toggleEp(ep: number) {
    setExpandedEpisodes(prev => {
      const next = new Set(prev);
      next.has(ep) ? next.delete(ep) : next.add(ep);
      return next;
    });
  }

  function rankBadge(rank: number) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }

  if (loading && !selectedManagerId) return (
    <div className="max-w-5xl mx-auto px-4 py-12 text-center">
      <div className="text-4xl mb-4 animate-pulse">🏕️</div>
      <p className="text-white/30 text-sm">Loading team...</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">

      {/* Commissioner Dropdown */}
      {isCommissioner && (
        <div className="flex items-center gap-3 mb-5">
          <span className="text-[10px] font-bold text-white/25 tracking-wider flex-shrink-0">VIEW AS</span>
          <select value={selectedManagerId || ''} onChange={e => setSelectedManagerId(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm font-semibold text-white cursor-pointer"
            style={{ outline: 'none' }}>
            {managers.map(m => (
              <option key={m.id} value={m.id} style={{ background: '#0d0d15' }}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4 animate-pulse">🏕️</div>
          <p className="text-white/30 text-sm">Loading...</p>
        </div>
      ) : (
        <>
          {/* ── Header ── */}
          <div className="flex items-start gap-4 mb-5 pb-5 border-b border-white/[0.08]">
            <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 text-2xl font-extrabold text-white border-2 border-white/10"
              style={{ background: 'linear-gradient(135deg, rgba(255,107,53,0.3), rgba(255,143,0,0.15))' }}>
              {selectedManager?.name?.[0] || '?'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-extrabold text-white tracking-tight">{selectedManager?.name}</h1>
                {managerRank > 0 && (
                  <span className="text-sm font-bold px-2 py-0.5 rounded"
                    style={{ background: managerRank <= 3 ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.05)', color: managerRank <= 3 ? '#FFD54F' : 'rgba(255,255,255,0.4)' }}>
                    {rankBadge(managerRank)} of {managers.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-white/30">
                <span>Season 50</span>
                <span>·</span>
                <span>{activePlayers}/5 active</span>
                {partner && <><span>·</span><span>Partner: {partner}</span></>}
                <span>·</span>
                <span>Through Ep. {latestEp || '—'}</span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-3xl font-extrabold text-white">{managerTotal?.fantasy_total || 0}</div>
              <div className="text-[10px] text-white/25 tracking-wider font-bold uppercase mt-0.5">Fantasy Pts</div>
            </div>
          </div>

          {/* ── Leaders Strip ── */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-wider text-white/25 uppercase mb-1">Top Scorer</div>
              {topScorer && (
                <>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: TC[topScorer.survivor.tribe] || '#888' }} />
                    <span className="text-[11px] font-bold text-white truncate">{topScorer.survivor.name}</span>
                  </div>
                  <div className="text-xl font-extrabold mt-1" style={{ color: TC[topScorer.survivor.tribe] || '#fff' }}>{topScorer.total}</div>
                </>
              )}
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-wider text-white/25 uppercase mb-1">Captain</div>
              <div className="text-[11px] font-bold text-white truncate">{currentCaptainName}</div>
              {captainPrivLost
                ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block" style={{ background: 'rgba(231,76,60,0.1)', color: '#E74C3C' }}>💀 LOST</span>
                : <span className="text-[8px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block" style={{ background: 'rgba(26,188,156,0.1)', color: '#1ABC9C' }}>✓ ACTIVE</span>}
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-wider text-white/25 uppercase mb-1">Team</div>
              <div className="text-xl font-extrabold text-orange-400">{scoringTotals.teamPts}</div>
              <div className="text-[9px] text-white/20 mt-0.5">FSG pts</div>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-wider text-white/25 uppercase mb-1">Captain</div>
              <div className="text-xl font-extrabold text-yellow-400">{scoringTotals.captainPts}</div>
              <div className="text-[9px] text-white/20 mt-0.5">2× bonus</div>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-wider text-white/25 uppercase mb-1">Vote Out</div>
              <div className="text-xl font-extrabold text-emerald-400">{scoringTotals.votedOutPts}</div>
              <div className="text-[9px] text-white/20 mt-0.5">bonus pts</div>
            </div>

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-wider text-white/25 uppercase mb-1">Chips</div>
              <div className="text-xl font-extrabold text-purple-400">{scoringTotals.chipPts}</div>
              <div className="text-[9px] text-white/20 mt-0.5">chip pts</div>
            </div>
          </div>

          {/* ── Player Stats Table ── */}
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white tracking-wider">Player Stats</h2>
            <span className="text-[10px] text-white/20">Click episode headers to expand breakdown</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/[0.06] mb-6">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th className="text-left p-3 text-white/35 font-bold text-[10px] tracking-wider sticky left-0 z-10 min-w-[140px]"
                    style={{ background: '#0d0d15' }}>NAME</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider w-14">TRIBE</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider w-16">STATUS</th>
                  {episodes.map(ep => {
                    const isExp = expandedEpisodes.has(ep);
                    const isLatest = ep === latestEp;
                    if (isExp) {
                      return (
                        <th key={ep} colSpan={3} className="p-0"
                          style={{ background: isLatest ? 'rgba(255,107,53,0.04)' : 'transparent' }}>
                          <div onClick={() => toggleEp(ep)} className="cursor-pointer">
                            <div className="flex items-center justify-center gap-1 p-2 border-b border-white/[0.06]"
                              style={{ background: isLatest ? 'rgba(255,107,53,0.08)' : 'rgba(255,255,255,0.03)' }}>
                              <span className="text-[10px] font-bold tracking-wider" style={{ color: isLatest ? '#FF6B35' : 'rgba(255,255,255,0.5)' }}>E{ep}</span>
                              <span className="text-white/20 text-[9px]">▲</span>
                            </div>
                            <div className="flex">
                              <div className="flex-1 text-center p-1.5 text-white/25 font-bold text-[8px] tracking-wider border-r border-white/[0.04] min-w-[38px]">TEAM</div>
                              <div className="flex-1 text-center p-1.5 text-yellow-400/50 font-bold text-[8px] tracking-wider border-r border-white/[0.04] min-w-[38px]">CAPT</div>
                              <div className="flex-1 text-center p-1.5 text-emerald-400/50 font-bold text-[8px] tracking-wider min-w-[38px]">V.O.</div>
                            </div>
                          </div>
                        </th>
                      );
                    }
                    return (
                      <th key={ep} onClick={() => toggleEp(ep)}
                        className="text-center p-2 font-bold text-[9px] tracking-wider min-w-[50px] cursor-pointer transition-all"
                        style={{
                          color: isLatest ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)',
                          background: isLatest ? 'rgba(255,107,53,0.04)' : 'transparent',
                        }}>
                        <div className="flex items-center justify-center gap-0.5">
                          <span>E{ep}</span>
                          <span className="text-white/20 text-[8px]">▼</span>
                        </div>
                      </th>
                    );
                  })}
                  <th onClick={() => setExpandTotal(!expandTotal)}
                    className="text-center p-0 font-extrabold text-[10px] tracking-wider cursor-pointer"
                    style={{ minWidth: expandTotal ? '120px' : '60px' }}>
                    {expandTotal ? (
                      <div>
                        <div className="flex items-center justify-center gap-1 p-2 border-b border-white/[0.06]" style={{ background: 'rgba(255,107,53,0.06)' }}>
                          <span className="text-orange-400">PTS</span>
                          <span className="text-white/20 text-[9px]">▲</span>
                        </div>
                        <div className="flex">
                          <div className="flex-1 text-center p-1.5 text-white/25 font-bold text-[8px] border-r border-white/[0.04] min-w-[36px]">TEAM</div>
                          <div className="flex-1 text-center p-1.5 text-yellow-400/50 font-bold text-[8px] border-r border-white/[0.04] min-w-[36px]">CAPT</div>
                          <div className="flex-1 text-center p-1.5 text-emerald-400/50 font-bold text-[8px] min-w-[36px]">V.O.</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-0.5 p-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        <span>PTS</span>
                        <span className="text-white/20 text-[8px]">▼</span>
                      </div>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* ── Permanent roster rows ── */}
                {teamWithScores.map(s => {
                  const isCaptain = s.survivor_id === currentCaptainId;
                  const tColor = TC[s.survivor.tribe] || '#888';
                  const isOut = !s.survivor.is_active;

                  const survivorTeamTotal = s.total;

                  const survivorCaptTotal = s.captainEps.reduce((sum, ep) => {
                    const ms = managerScores.find(m => m.episode === ep);
                    return sum + (ms?.captain_bonus || 0);
                  }, 0);

                  const survivorVoTotal = isOut ? (s.survivor.elimination_order || 0) : 0;

                  return (
                    <tr key={s.survivor_id}
                      className="border-t border-white/[0.03] transition-all"
                      style={{ opacity: isOut ? 0.6 : 1 }}>

                      <td className="p-3 sticky left-0 z-10" style={{ background: '#0a0a0f' }}>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-extrabold text-white"
                            style={{ background: `linear-gradient(135deg,${tColor}44,${tColor}77)`, border: `1.5px solid ${tColor}` }}>
                            {s.survivor.name.startsWith('"') ? 'Q' : s.survivor.name[0]}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold text-[12px] ${isOut ? 'text-white/35 line-through' : 'text-white'}`}>{s.survivor.name}</span>
                              {isCaptain && !captainPrivLost && <span className="text-[10px]">👑</span>}
                            </div>
                            <div className="text-[9px] text-white/20 mt-0.5">
                              {s.acquired_via === 'draft' ? `Rd ${s.acquired_round}` : s.acquired_via}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <span className="text-[9px] font-bold tracking-wider" style={{ color: tColor }}>{s.survivor.tribe.toUpperCase()}</span>
                      </td>

                      <td className="p-3 text-center">
                        {isOut
                          ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">OUT E{s.survivor.eliminated_episode}</span>
                          : <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">ACTIVE</span>}
                      </td>

                      {episodes.map(ep => {
                        const wasSwappedOut = swappedOutByEp[ep]?.has(s.survivor_id);
                        const pts = s.scores[ep];
                        const isCaptEp = s.captainEps.includes(ep);
                        const isVoEp = s.survivor.eliminated_episode === ep;
                        const isLatest = ep === latestEp;
                        const isExp = expandedEpisodes.has(ep);
                        const ms = managerScores.find(m => m.episode === ep);
                        const captBonus = isCaptEp ? (ms?.captain_bonus || 0) : 0;
                        const voBonus = isVoEp ? (s.survivor.elimination_order || 0) : 0;
                        const { min, max } = epHeatRanges[ep] || { min: 0, max: 0 };

                        // Swapped out — render OUT marker, no points counted
                        if (wasSwappedOut) {
                          if (isExp) {
                            return (
                              <td key={ep} colSpan={3} className="p-0"
                                style={{ background: isLatest ? 'rgba(52,152,219,0.04)' : 'rgba(52,152,219,0.02)' }}>
                                <div className="flex items-center justify-center p-2">
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(52,152,219,0.12)', color: '#3498DB' }}>🔄 SWAPPED OUT</span>
                                </div>
                              </td>
                            );
                          }
                          return (
                            <td key={ep} className="p-1.5 text-center"
                              style={{ background: isLatest ? 'rgba(52,152,219,0.04)' : 'rgba(52,152,219,0.02)' }}>
                              <span className="text-[8px] font-bold" style={{ color: '#3498DB' }}>🔄</span>
                            </td>
                          );
                        }

                        if (isExp) {
                          return (
                            <td key={ep} colSpan={3} className="p-0"
                              style={{ background: isLatest ? 'rgba(255,107,53,0.02)' : 'transparent' }}>
                              <div className="flex">
                                <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                                  {pts !== undefined
                                    ? <span className="text-[11px] font-semibold px-1 py-0.5 rounded text-white/60"
                                        style={{ background: heatColor(pts, min, max) }}>{pts}</span>
                                    : <span className="text-white/[0.08]">—</span>}
                                </div>
                                <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                                  {captBonus > 0
                                    ? <span className="text-[11px] font-bold text-yellow-300">+{captBonus}</span>
                                    : <span className="text-white/[0.08]">—</span>}
                                </div>
                                <div className="flex-1 text-center p-2">
                                  {voBonus > 0
                                    ? <span className="text-[11px] font-bold text-emerald-400">+{voBonus}</span>
                                    : <span className="text-white/[0.08]">—</span>}
                                </div>
                              </div>
                            </td>
                          );
                        }

                        const combinedPts = (pts || 0) + captBonus + voBonus;
                        return (
                          <td key={ep} className="p-1.5 text-center"
                            style={{ background: isLatest ? 'rgba(255,107,53,0.02)' : 'transparent' }}>
                            {pts !== undefined ? (
                              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${isCaptEp ? 'text-yellow-300 font-extrabold' : 'text-white/60'}`}
                                style={{ background: heatColor(pts, min, max) }}>
                                {isCaptEp && <span className="text-[7px] mr-0.5">👑</span>}
                                {combinedPts}
                              </span>
                            ) : <span className="text-white/[0.08]">—</span>}
                          </td>
                        );
                      })}

                      <td className="p-0">
                        {expandTotal ? (
                          <div className="flex">
                            <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                              <span className="text-[11px] font-semibold text-white/60">{survivorTeamTotal || '—'}</span>
                            </div>
                            <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                              {survivorCaptTotal > 0
                                ? <span className="text-[11px] font-bold text-yellow-300">+{survivorCaptTotal}</span>
                                : <span className="text-white/[0.08]">—</span>}
                            </div>
                            <div className="flex-1 text-center p-2">
                              {survivorVoTotal > 0
                                ? <span className="text-[11px] font-bold text-emerald-400">+{survivorVoTotal}</span>
                                : <span className="text-white/[0.08]">—</span>}
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 text-center">
                            <span className="text-[13px] font-extrabold text-white">
                              {survivorTeamTotal + survivorCaptTotal + survivorVoTotal}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* ── Guest rows (chip 4 swap-in / chip 5 player-add) ── */}
                {guestRows.length > 0 && (
                  <tr className="border-t border-white/[0.03]">
                    <td colSpan={3 + episodes.reduce((acc, ep) => acc + (expandedEpisodes.has(ep) ? 3 : 1), 0) + (expandTotal ? 3 : 1)}
                      className="p-1.5 sticky left-0 z-10"
                      style={{ background: 'rgba(155,89,182,0.04)' }}>
                      <span className="text-[9px] font-bold tracking-widest uppercase pl-3" style={{ color: 'rgba(155,89,182,0.7)' }}>
                        🎰 Chip-Activated Roster
                      </span>
                    </td>
                  </tr>
                )}
                {guestRows.map(g => {
                  const tColor = TC[g.survivor.tribe] || '#888';
                  const isOut = !g.survivor.is_active;
                  const chipColor = g.chipType === 4 ? '#3498DB' : '#9B59B6';
                  const chipBg = g.chipType === 4 ? 'rgba(52,152,219,0.10)' : 'rgba(155,89,182,0.10)';
                  const chipLabel = g.chipType === 4 ? '🔄 SWAP IN' : '➕ ADDED';

                  const survivorTeamTotal = g.total;
                  const survivorCaptTotal = g.captainEps.reduce((sum, ep) => {
                    const ms = managerScores.find(m => m.episode === ep);
                    return sum + (ms?.captain_bonus || 0);
                  }, 0);
                  const wasVotedOutInChipEp = g.survivor.eliminated_episode === g.chipEp;
                  const survivorVoTotal = wasVotedOutInChipEp ? (g.survivor.elimination_order || 0) : 0;

                  return (
                    <tr key={g.rowKey}
                      className="border-t transition-all"
                      style={{ borderColor: chipBg, background: 'rgba(155,89,182,0.015)', opacity: isOut ? 0.7 : 1 }}>

                      <td className="p-3 sticky left-0 z-10" style={{ background: '#0a0a0f' }}>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-extrabold text-white relative"
                            style={{ background: `linear-gradient(135deg,${tColor}44,${tColor}77)`, border: `1.5px solid ${tColor}` }}>
                            {g.survivor.name.startsWith('"') ? 'Q' : g.survivor.name[0]}
                            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full text-[7px] flex items-center justify-center"
                              style={{ background: chipColor, color: '#fff' }}>
                              {g.chipType === 4 ? '🔄' : '+'}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-[12px] text-white">{g.survivor.name}</span>
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded tracking-wider"
                                style={{ background: chipBg, color: chipColor }}>{chipLabel}</span>
                            </div>
                            <div className="text-[9px] text-white/20 mt-0.5">E{g.chipEp} only</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <span className="text-[9px] font-bold tracking-wider" style={{ color: tColor }}>{g.survivor.tribe.toUpperCase()}</span>
                      </td>

                      <td className="p-3 text-center">
                        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: chipBg, color: chipColor }}>
                          E{g.chipEp}
                        </span>
                      </td>

                      {episodes.map(ep => {
                        const isLatest = ep === latestEp;
                        const isExp = expandedEpisodes.has(ep);
                        const isMyChipEp = ep === g.chipEp;

                        // Only show pts in the chip episode; "—" everywhere else.
                        const pts = isMyChipEp ? g.scores[ep] : undefined;
                        const isCaptEp = isMyChipEp && g.captainEps.includes(ep);
                        const isVoEp = isMyChipEp && g.survivor.eliminated_episode === ep;
                        const ms = managerScores.find(m => m.episode === ep);
                        const captBonus = isCaptEp ? (ms?.captain_bonus || 0) : 0;
                        const voBonus = isVoEp ? (g.survivor.elimination_order || 0) : 0;
                        const { min, max } = epHeatRanges[ep] || { min: 0, max: 0 };

                        if (isExp) {
                          return (
                            <td key={ep} colSpan={3} className="p-0"
                              style={{ background: isLatest ? 'rgba(255,107,53,0.02)' : 'transparent' }}>
                              <div className="flex">
                                <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                                  {pts !== undefined
                                    ? <span className="text-[11px] font-semibold px-1 py-0.5 rounded text-white/60"
                                        style={{ background: heatColor(pts, min, max) }}>{pts}</span>
                                    : <span className="text-white/[0.08]">—</span>}
                                </div>
                                <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                                  {captBonus > 0
                                    ? <span className="text-[11px] font-bold text-yellow-300">+{captBonus}</span>
                                    : <span className="text-white/[0.08]">—</span>}
                                </div>
                                <div className="flex-1 text-center p-2">
                                  {voBonus > 0
                                    ? <span className="text-[11px] font-bold text-emerald-400">+{voBonus}</span>
                                    : <span className="text-white/[0.08]">—</span>}
                                </div>
                              </div>
                            </td>
                          );
                        }

                        if (pts === undefined) {
                          return (
                            <td key={ep} className="p-1.5 text-center"
                              style={{ background: isLatest ? 'rgba(255,107,53,0.02)' : 'transparent' }}>
                              <span className="text-white/[0.08]">—</span>
                            </td>
                          );
                        }

                        const combinedPts = pts + captBonus + voBonus;
                        return (
                          <td key={ep} className="p-1.5 text-center"
                            style={{ background: isLatest ? 'rgba(255,107,53,0.02)' : 'transparent' }}>
                            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${isCaptEp ? 'text-yellow-300 font-extrabold' : 'text-white/60'}`}
                              style={{ background: heatColor(pts, min, max) }}>
                              {isCaptEp && <span className="text-[7px] mr-0.5">👑</span>}
                              {combinedPts}
                            </span>
                          </td>
                        );
                      })}

                      <td className="p-0">
                        {expandTotal ? (
                          <div className="flex">
                            <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                              <span className="text-[11px] font-semibold text-white/60">{survivorTeamTotal || '—'}</span>
                            </div>
                            <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                              {survivorCaptTotal > 0
                                ? <span className="text-[11px] font-bold text-yellow-300">+{survivorCaptTotal}</span>
                                : <span className="text-white/[0.08]">—</span>}
                            </div>
                            <div className="flex-1 text-center p-2">
                              {survivorVoTotal > 0
                                ? <span className="text-[11px] font-bold text-emerald-400">+{survivorVoTotal}</span>
                                : <span className="text-white/[0.08]">—</span>}
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 text-center">
                            <span className="text-[13px] font-extrabold text-white">
                              {survivorTeamTotal + survivorCaptTotal + survivorVoTotal}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* ── Team Total row ── */}
                <tr className="border-t-2" style={{ borderColor: 'rgba(255,107,53,0.2)', background: 'rgba(255,107,53,0.03)' }}>
                  <td className="p-3 sticky left-0 z-10" style={{ background: '#0a0a0f' }}>
                    <span className="text-[11px] font-extrabold text-orange-400 tracking-wider">TEAM TOTAL</span>
                  </td>
                  <td colSpan={2} />
                  {episodes.map(ep => {
                    const isLatest = ep === latestEp;
                    const isExp = expandedEpisodes.has(ep);
                    const ms = managerScores.find(m => m.episode === ep);
                    const epTeam = ms?.base_team_points || 0;
                    const epCapt = ms?.captain_bonus || 0;
                    const epVo   = ms?.voted_out_bonus || 0;

                    if (isExp) {
                      return (
                        <td key={ep} colSpan={3} className="p-0"
                          style={{ background: isLatest ? 'rgba(255,107,53,0.03)' : 'transparent' }}>
                          <div className="flex">
                            <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                              <span className="text-[11px] font-bold text-orange-400">{epTeam || '—'}</span>
                            </div>
                            <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                              {epCapt > 0 ? <span className="text-[11px] font-bold text-yellow-300">+{epCapt}</span> : <span className="text-white/[0.08]">—</span>}
                            </div>
                            <div className="flex-1 text-center p-2">
                              {epVo > 0 ? <span className="text-[11px] font-bold text-emerald-400">+{epVo}</span> : <span className="text-white/[0.08]">—</span>}
                            </div>
                          </div>
                        </td>
                      );
                    }
                    const epCollapsed = epTeam + epCapt + epVo;
                    return (
                      <td key={ep} className="p-1.5 text-center"
                        style={{ background: isLatest ? 'rgba(255,107,53,0.02)' : 'transparent' }}>
                        <span className="text-[11px] font-bold text-orange-400">{epCollapsed || '—'}</span>
                      </td>
                    );
                  })}
                  <td className="p-0">
                    {expandTotal ? (
                      <div className="flex">
                        <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                          <span className="text-[11px] font-bold text-orange-400">{scoringTotals.teamPts}</span>
                        </div>
                        <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                          {scoringTotals.captainPts > 0 ? <span className="text-[11px] font-bold text-yellow-300">+{scoringTotals.captainPts}</span> : <span className="text-white/[0.08]">—</span>}
                        </div>
                        <div className="flex-1 text-center p-2">
                          {scoringTotals.votedOutPts > 0 ? <span className="text-[11px] font-bold text-emerald-400">+{scoringTotals.votedOutPts}</span> : <span className="text-white/[0.08]">—</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 text-center">
                        <span className="text-[14px] font-extrabold text-orange-400">
                          {scoringTotals.teamPts + scoringTotals.captainPts + scoringTotals.votedOutPts}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Game Chips ── */}
          <div className="mb-2">
            <h2 className="text-sm font-extrabold text-white tracking-wider mb-3">Game Chips</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {chipStatus.map((chip: any) => {
                const statusCfg: Record<string, { bg: string; color: string; label: string }> = {
                  used:      { bg: 'rgba(255,255,255,0.03)', color: '#95a5a6',               label: 'USED'      },
                  available: { bg: 'rgba(26,188,156,0.06)',  color: '#1ABC9C',               label: 'AVAILABLE' },
                  upcoming:  { bg: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.2)', label: 'UPCOMING'  },
                  expired:   { bg: 'rgba(231,76,60,0.04)',   color: '#E74C3C',               label: 'EXPIRED'   },
                };
                const sc = statusCfg[chip.status] || statusCfg.upcoming;
                return (
                  <div key={chip.id} className="flex items-center gap-3 rounded-xl p-3"
                    style={{ background: sc.bg, border: `1px solid ${sc.color}20` }}>
                    <span className="text-xl flex-shrink-0">{chip.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-bold text-white">{chip.name}</span>
                        <span className="text-[9px] font-semibold text-white/30">{chip.window}</span>
                      </div>
                      {chip.status === 'used' && (
                        <div className="text-[10px] text-white/25 mt-0.5">
                          E{chip.usedEpisode}{chip.usedTarget ? ` · ${chip.usedTarget}` : ''}
                          {chip.ptsEarned > 0 && <span className="text-purple-400 font-bold ml-1">+{chip.ptsEarned} pts</span>}
                        </div>
                      )}
                      {chip.status === 'available' && (
                        <div className="text-[10px] text-emerald-400/60 mt-0.5">Play on picks page</div>
                      )}
                    </div>
                    <span className="text-[8px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 tracking-wider"
                      style={{ background: `${sc.color}15`, color: sc.color }}>
                      {sc.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
