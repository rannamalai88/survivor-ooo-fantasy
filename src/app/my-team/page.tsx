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
  captain_id?: string | null;
}

interface WeeklyPickRow {
  manager_id: string;
  episode: number;
  captain_id: string | null;
  pool_pick_id: string | null;
  net_pick_id: string | null;
  chip_played: number | null;
  chip_target: string | null;
}

interface PoolStatusRow {
  status: string;
  weeks_survived: number;
}

interface NetAnswerRow {
  episode: number;
  correct_survivor_id: string;
}

interface ManagerTotalRow {
  manager_id: string;
  grand_total: number;
  rank: number;
}

// ============================================================
// Helpers
// ============================================================
const TC = TRIBE_COLORS as Record<string, string>;

function heatColor(val: number, min: number, max: number): string {
  if (max === min || !val) return 'transparent';
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
  const [poolStatus, setPoolStatus] = useState<PoolStatusRow | null>(null);
  const [netAnswers, setNetAnswers] = useState<NetAnswerRow[]>([]);
  const [survivors, setSurvivors] = useState<{ id: string; name: string }[]>([]);
  const [allTotals, setAllTotals] = useState<ManagerTotalRow[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);
  const [expandedSurvivor, setExpandedSurvivor] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<'total' | number>('total');
  const [isCommissioner, setIsCommissioner] = useState(true);

  useEffect(() => { loadInitial(); }, []);

  async function loadInitial() {
    setLoading(true);
    const [seasonRes, managersRes, survivorsRes, netRes, totalsRes] = await Promise.all([
      supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
      supabase.from('managers').select('id, name, draft_position, is_commissioner').eq('season_id', SEASON_ID).order('draft_position'),
      supabase.from('survivors').select('id, name').eq('season_id', SEASON_ID),
      supabase.from('net_answers').select('episode, correct_survivor_id').eq('season_id', SEASON_ID).order('episode'),
      supabase.from('manager_totals').select('manager_id, grand_total, rank').eq('season_id', SEASON_ID),
    ]);
    setCurrentEpisode(seasonRes.data?.current_episode || 2);
    setManagers(managersRes.data || []);
    setSurvivors(survivorsRes.data || []);
    setNetAnswers(netRes.data || []);
    setAllTotals(totalsRes.data || []);

    const mgrs = managersRes.data || [];
    const commissioner = mgrs.find((m: Manager) => m.is_commissioner);
    const defaultId = commissioner?.id || mgrs[0]?.id;
    setSelectedManagerId(defaultId);
  }

  useEffect(() => {
    if (selectedManagerId) loadManagerData(selectedManagerId);
  }, [selectedManagerId]);

  async function loadManagerData(managerId: string) {
    setLoading(true);
    const [teamRes, scoresRes, mScoresRes, picksRes, poolRes] = await Promise.all([
      supabase.from('teams')
        .select('survivor_id, acquired_round, acquired_via, survivors(id, name, tribe, is_active, elimination_order, eliminated_episode)')
        .eq('season_id', SEASON_ID).eq('manager_id', managerId).eq('is_active', true),
      supabase.from('survivor_scores').select('survivor_id, episode, final_points').eq('season_id', SEASON_ID),
      supabase.from('manager_scores')
        .select('episode, fantasy_points, base_team_points, captain_bonus, voted_out_bonus, chip_bonus, captain_lost')
        .eq('season_id', SEASON_ID).eq('manager_id', managerId).order('episode'),
      supabase.from('weekly_picks')
        .select('manager_id, episode, captain_id, pool_pick_id, net_pick_id, chip_played, chip_target')
        .eq('season_id', SEASON_ID).eq('manager_id', managerId).order('episode'),
      supabase.from('pool_status').select('status, weeks_survived').eq('season_id', SEASON_ID).eq('manager_id', managerId).single(),
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
    setWeeklyPicks(picksRes.data || []);
    setPoolStatus(poolRes.data || null);
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

  const episodes = useMemo(() => {
    return Array.from(new Set(survivorScores.map(s => s.episode))).sort((a, b) => a - b);
  }, [survivorScores]);

  const latestEp = episodes[episodes.length - 1] || null;

  // Captain privilege lost
  const captainPrivLost = useMemo(() => {
    return managerScores.some(ms => ms.captain_lost);
  }, [managerScores]);

  // Current captain (most recent pick)
  const currentCaptainId = useMemo(() => {
    const sorted = [...weeklyPicks].sort((a, b) => b.episode - a.episode);
    return sorted.find(p => p.captain_id)?.captain_id || null;
  }, [weeklyPicks]);

  const currentCaptainName = useMemo(() => {
    const s = team.find(t => t.survivor_id === currentCaptainId);
    return s?.survivor.name || '—';
  }, [team, currentCaptainId]);

  // Per-survivor data with scores + episode detail
  const teamWithScores = useMemo(() => {
    return team.map(t => {
      const scores: Record<number, number> = {};
      let total = 0;
      survivorScores.filter(s => s.survivor_id === t.survivor_id).forEach(s => {
        scores[s.episode] = s.final_points;
        total += s.final_points;
      });
      const captainEps = weeklyPicks.filter(p => p.captain_id === t.survivor_id).map(p => p.episode);
      return { ...t, scores, total, captainEps };
    });
  }, [team, survivorScores, weeklyPicks]);

  const sorted = useMemo(() => {
    return [...teamWithScores].sort((a, b) => {
      if (sortCol === 'total') return b.total - a.total;
      return (b.scores[sortCol] || 0) - (a.scores[sortCol] || 0);
    });
  }, [teamWithScores, sortCol]);

  const teamTotal = teamWithScores.reduce((s, t) => s + t.total, 0);
  const activePlayers = teamWithScores.filter(s => s.survivor.is_active).length;

  // Top scorer
  const topScorer = useMemo(() => {
    return [...teamWithScores].sort((a, b) => b.total - a.total)[0];
  }, [teamWithScores]);

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

  // Chip status
  const chipStatus = useMemo(() => {
    return (CHIP_DEFS || []).map((chip: any) => {
      const used = weeklyPicks.find(p => p.chip_played === chip.id);
      const [wStart, wEnd] = chip.window.replace('Week ', '').split('-').map(Number);
      const status = used ? 'used'
        : currentEpisode >= wStart && currentEpisode <= wEnd ? 'available'
        : currentEpisode < wStart ? 'upcoming' : 'expired';
      return { ...chip, status, usedEpisode: used?.episode, usedTarget: used?.chip_target };
    });
  }, [weeklyPicks, currentEpisode]);

  // Per-episode heat range for survivor scores
  const epHeatRanges = useMemo(() => {
    const ranges: Record<number, { min: number; max: number }> = {};
    episodes.forEach(ep => {
      const vals = teamWithScores.map(s => s.scores[ep] || 0).filter(v => v > 0);
      ranges[ep] = { min: vals.length ? Math.min(...vals) : 0, max: vals.length ? Math.max(...vals) : 0 };
    });
    return ranges;
  }, [teamWithScores, episodes]);

  // ---- Render helpers ----
  function rankBadge(rank: number) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }

  const poolCfg = POOL_CFG[poolStatus?.status || 'active'] || POOL_CFG.active;

  if (loading && !selectedManagerId) return (
    <div className="max-w-5xl mx-auto px-4 py-12 text-center">
      <div className="text-4xl mb-4 animate-pulse">🏕️</div>
      <p className="text-white/30 text-sm">Loading team...</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">

      {/* ── Commissioner Dropdown ── */}
      {isCommissioner && (
        <div className="flex items-center gap-3 mb-5">
          <span className="text-[10px] font-bold text-white/25 tracking-wider flex-shrink-0">VIEW AS</span>
          <select
            value={selectedManagerId || ''}
            onChange={e => setSelectedManagerId(e.target.value)}
            className="bg-white/[0.05] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm font-semibold text-white cursor-pointer"
            style={{ outline: 'none' }}
          >
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
          {/* ── ESPN-style Header ── */}
          <div className="flex items-start gap-4 mb-5 pb-5 border-b border-white/[0.08]">
            {/* Avatar / Logo */}
            <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 text-2xl font-extrabold text-white border-2 border-white/10"
              style={{ background: 'linear-gradient(135deg, rgba(255,107,53,0.3), rgba(255,143,0,0.15))' }}>
              {selectedManager?.name?.[0] || '?'}
            </div>
            {/* Info */}
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
            {/* Total */}
            <div className="text-right flex-shrink-0">
              <div className="text-3xl font-extrabold text-white">{Math.round(managerTotal?.grand_total || 0)}</div>
              <div className="text-[10px] text-white/25 tracking-wider font-bold uppercase mt-0.5">Total Pts</div>
            </div>
          </div>

          {/* ── Team Leaders Strip (ESPN-style) ── */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
            {/* Top Scorer */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-wider text-white/25 uppercase mb-1">Top Scorer</div>
              {topScorer && (
                <>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: TC[topScorer.survivor.tribe] || '#888' }} />
                    <span className="text-[12px] font-bold text-white truncate">{topScorer.survivor.name}</span>
                  </div>
                  <div className="text-xl font-extrabold mt-1" style={{ color: TC[topScorer.survivor.tribe] || '#fff' }}>{topScorer.total}</div>
                </>
              )}
            </div>

            {/* Captain */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-wider text-white/25 uppercase mb-1">Captain</div>
              <div className="text-[12px] font-bold text-white truncate">{currentCaptainName}</div>
              {captainPrivLost ? (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block" style={{ background: 'rgba(231,76,60,0.1)', color: '#E74C3C' }}>💀 LOST</span>
              ) : (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block" style={{ background: 'rgba(26,188,156,0.1)', color: '#1ABC9C' }}>✓ ACTIVE</span>
              )}
            </div>

            {/* Fantasy */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-wider text-white/25 uppercase mb-1">Fantasy</div>
              <div className="text-xl font-extrabold text-orange-400">{teamTotal}</div>
              <div className="text-[9px] text-white/20 mt-0.5">team pts</div>
            </div>

            {/* Pool */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-wider text-white/25 uppercase mb-1">Pool</div>
              <div className="text-xl font-extrabold" style={{ color: poolCfg.color }}>{poolStatus?.weeks_survived || 0}</div>
              <div className="text-[8px] font-bold mt-0.5 px-1.5 py-0.5 rounded inline-block" style={{ background: poolCfg.bg, color: poolCfg.color }}>{poolCfg.label}</div>
            </div>

            {/* NET */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3">
              <div className="text-[9px] font-bold tracking-wider text-white/25 uppercase mb-1">NET</div>
              <div className="text-xl font-extrabold text-purple-400">{netRecord.correct}/{netRecord.total}</div>
              <div className="text-[9px] text-white/20 mt-0.5">{netRecord.pts} pts</div>
            </div>
          </div>

          {/* ── Player Stats Table ── */}
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white tracking-wider">Player Stats</h2>
            <span className="text-[10px] text-white/20">Click a player to expand · Click episode headers to sort</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/[0.06] mb-6">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th className="text-left p-3 text-white/35 font-bold text-[10px] tracking-wider sticky left-0 z-10 min-w-[130px]"
                    style={{ background: '#0d0d15' }}>
                    NAME
                  </th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider w-14">TRIBE</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider w-16">STATUS</th>
                  {episodes.map(ep => (
                    <th key={ep}
                      onClick={() => setSortCol(sortCol === ep ? 'total' : ep)}
                      className="text-center p-2 font-bold text-[9px] tracking-wider min-w-[44px] cursor-pointer transition-all"
                      style={{
                        color: sortCol === ep ? '#FF6B35' : ep === latestEp ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
                        background: ep === latestEp ? 'rgba(255,107,53,0.04)' : 'transparent',
                        borderLeft: ep === latestEp ? '1px solid rgba(255,107,53,0.1)' : 'none',
                        borderRight: ep === latestEp ? '1px solid rgba(255,107,53,0.1)' : 'none',
                      }}>
                      E{ep} {sortCol === ep ? '↓' : ''}
                    </th>
                  ))}
                  <th onClick={() => setSortCol('total')}
                    className="text-center p-3 font-extrabold text-[10px] tracking-wider w-16 cursor-pointer transition-all"
                    style={{ color: sortCol === 'total' ? '#FF6B35' : 'rgba(255,255,255,0.5)' }}>
                    PTS {sortCol === 'total' ? '↓' : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(s => {
                  const isExp = expandedSurvivor === s.survivor_id;
                  const isCaptain = s.survivor_id === currentCaptainId;
                  const tColor = TC[s.survivor.tribe] || '#888';
                  const isOut = !s.survivor.is_active;

                  return (
                    <>
                      {/* ── Player row ── */}
                      <tr key={s.survivor_id}
                        onClick={() => setExpandedSurvivor(isExp ? null : s.survivor_id)}
                        className="border-t border-white/[0.03] cursor-pointer transition-all"
                        style={{ background: isExp ? `${tColor}08` : 'transparent', opacity: isOut ? 0.55 : 1 }}
                        onMouseEnter={e => { if (!isExp) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; }}
                        onMouseLeave={e => { if (!isExp) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>

                        {/* Name */}
                        <td className="p-3 sticky left-0 z-10" style={{ background: isExp ? `${tColor}08` : '#0a0a0f' }}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-extrabold text-white"
                              style={{ background: `linear-gradient(135deg,${tColor}44,${tColor}77)`, border: `1.5px solid ${tColor}` }}>
                              {s.survivor.name.startsWith('"') ? 'Q' : s.survivor.name[0]}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`font-bold text-[12px] ${isOut ? 'text-white/35 line-through' : 'text-white'}`}>
                                  {s.survivor.name}
                                </span>
                                {isCaptain && !captainPrivLost && <span className="text-[10px]">👑</span>}
                              </div>
                              <div className="text-[9px] text-white/20 mt-0.5">
                                {s.acquired_via === 'draft' ? `Rd ${s.acquired_round}` : s.acquired_via}
                              </div>
                            </div>
                            <span className="ml-auto text-white/15 text-[9px]">{isExp ? '▲' : '▼'}</span>
                          </div>
                        </td>

                        {/* Tribe */}
                        <td className="p-3 text-center">
                          <span className="text-[9px] font-bold tracking-wider" style={{ color: tColor }}>{s.survivor.tribe.toUpperCase()}</span>
                        </td>

                        {/* Status */}
                        <td className="p-3 text-center">
                          {isOut
                            ? <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">OUT E{s.survivor.eliminated_episode}</span>
                            : <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">ACTIVE</span>}
                        </td>

                        {/* Episode cells */}
                        {episodes.map(ep => {
                          const pts = s.scores[ep];
                          const isCaptEp = s.captainEps.includes(ep);
                          const isLatest = ep === latestEp;
                          const { min, max } = epHeatRanges[ep] || { min: 0, max: 0 };
                          return (
                            <td key={ep} className="p-1.5 text-center"
                              style={{ background: isLatest ? 'rgba(255,107,53,0.03)' : 'transparent' }}>
                              {pts !== undefined ? (
                                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${isCaptEp ? 'text-yellow-300 font-extrabold' : 'text-white/60'}`}
                                  style={{ background: heatColor(pts, min, max) }}>
                                  {isCaptEp && <span className="text-[7px] mr-0.5">👑</span>}
                                  {pts}
                                </span>
                              ) : <span className="text-white/[0.08]">—</span>}
                            </td>
                          );
                        })}

                        {/* Total */}
                        <td className="p-3 text-center">
                          <span className="text-[13px] font-extrabold text-white">{s.total}</span>
                        </td>
                      </tr>

                      {/* ── Expanded detail drawer ── */}
                      {isExp && (
                        <tr key={`${s.survivor_id}-detail`} className="border-t border-white/[0.04]">
                          <td colSpan={3 + episodes.length + 1} className="p-0" style={{ background: '#08080e' }}>
                            <div className="px-4 py-3">
                              <div className="text-[9px] font-bold tracking-widest text-white/25 uppercase mb-3">
                                {s.survivor.name} — Episode Detail
                              </div>
                              <div className="flex gap-2 overflow-x-auto pb-1">
                                {episodes.map(ep => {
                                  const pts = s.scores[ep];
                                  if (pts === undefined) return null;
                                  const isCaptEp = s.captainEps.includes(ep);
                                  const ms = managerScores.find(m => m.episode === ep);
                                  const isVotedOutEp = s.survivor.eliminated_episode === ep;
                                  // Captain bonus for this survivor this episode
                                  const captBonus = isCaptEp ? (ms?.captain_bonus || 0) : 0;
                                  // V.O. bonus — only if this survivor was voted out
                                  const voBonus = isVotedOutEp ? (ms?.voted_out_bonus || 0) : 0;

                                  return (
                                    <div key={ep} className="flex-shrink-0 rounded-lg border border-white/[0.06] overflow-hidden"
                                      style={{ minWidth: '130px', background: 'rgba(255,255,255,0.02)' }}>
                                      {/* Ep header */}
                                      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]"
                                        style={{ background: ep === latestEp ? 'rgba(255,107,53,0.08)' : 'rgba(255,255,255,0.02)' }}>
                                        <span className="text-[10px] font-extrabold" style={{ color: ep === latestEp ? '#FF6B35' : 'rgba(255,255,255,0.4)' }}>E{ep}</span>
                                        <span className="text-[12px] font-extrabold text-white">{pts}</span>
                                      </div>
                                      <div className="p-2.5 flex flex-col gap-1.5">
                                        {/* FSG pts */}
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] text-white/30">FSG pts</span>
                                          <span className="text-[11px] font-semibold text-white/60">{pts}</span>
                                        </div>
                                        {/* Captain bonus */}
                                        {isCaptEp && (
                                          <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-yellow-400/60">👑 Capt ×2</span>
                                            <span className="text-[11px] font-bold text-yellow-300">+{captBonus}</span>
                                          </div>
                                        )}
                                        {/* Voted out */}
                                        {isVotedOutEp && voBonus > 0 && (
                                          <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-red-400/60">💀 V.O.</span>
                                            <span className="text-[11px] font-bold text-red-400">+{voBonus}</span>
                                          </div>
                                        )}
                                        {isVotedOutEp && (
                                          <div className="mt-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded text-center"
                                            style={{ background: 'rgba(231,76,60,0.1)', color: '#E74C3C' }}>
                                            ELIMINATED
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}

                {/* Team total row */}
                <tr className="border-t-2" style={{ borderColor: 'rgba(255,107,53,0.2)', background: 'rgba(255,107,53,0.03)' }}>
                  <td className="p-3 sticky left-0 z-10" style={{ background: '#0a0a0f' }}>
                    <span className="text-[11px] font-extrabold text-orange-400 tracking-wider">TEAM TOTAL</span>
                  </td>
                  <td colSpan={2} />
                  {episodes.map(ep => {
                    const epTotal = teamWithScores.reduce((sum, s) => sum + (s.scores[ep] || 0), 0);
                    const isLatest = ep === latestEp;
                    return (
                      <td key={ep} className="p-1.5 text-center"
                        style={{ background: isLatest ? 'rgba(255,107,53,0.03)' : 'transparent' }}>
                        <span className="text-[11px] font-bold text-orange-400">{epTotal || '—'}</span>
                      </td>
                    );
                  })}
                  <td className="p-3 text-center">
                    <span className="text-[14px] font-extrabold text-orange-400">{teamTotal}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Chips Section ── */}
          <div className="mb-2">
            <h2 className="text-sm font-extrabold text-white tracking-wider mb-3">Game Chips</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {chipStatus.map((chip: any) => {
                const statusCfg: Record<string, { bg: string; color: string; label: string }> = {
                  used:      { bg: 'rgba(255,255,255,0.03)', color: '#95a5a6',             label: 'USED'      },
                  available: { bg: 'rgba(26,188,156,0.06)',  color: '#1ABC9C',             label: 'AVAILABLE' },
                  upcoming:  { bg: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.2)', label: 'UPCOMING'  },
                  expired:   { bg: 'rgba(231,76,60,0.04)',   color: '#E74C3C',             label: 'EXPIRED'   },
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
                          Used E{chip.usedEpisode}{chip.usedTarget ? ` · ${chip.usedTarget}` : ''}
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
