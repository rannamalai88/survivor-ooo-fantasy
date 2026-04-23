'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, TRIBE_COLORS } from '@/lib/constants';

// ============================================================
// Types
// ============================================================
interface Survivor {
  id: string;
  name: string;
  tribe: string;
  is_active: boolean;
  elimination_order: number | null;
  eliminated_episode: number | null;
}

interface SurvivorScoreRow {
  survivor_id: string;
  episode: number;
  final_points: number;
}

interface ManagerInfo {
  id: string;
  name: string;
  draft_position: number;
}

interface ManagerScoreRow {
  manager_id: string;
  episode: number;
  fantasy_points: number;
  base_team_points: number;
  captain_bonus: number;
  chip_bonus: number;
  voted_out_bonus: number;
  net_correct: boolean;
  chip_played: number | null;
  chip_detail: string | null;
  captain_lost: boolean;
}

interface WeeklyPickRow {
  manager_id: string;
  episode: number;
  captain_id: string | null;
  chip_played: number | null;
  swap_out_ids: string[] | null;
  swap_in_ids: string[] | null;
}

interface TeamRow {
  manager_id: string;
  survivor_id: string;
}

// ============================================================
// Helpers
// ============================================================
function heatColor(val: number, min: number, max: number): string {
  if (max === min) return 'rgba(255,255,255,0.05)';
  const pct = (val - min) / (max - min);
  if (pct >= 0.75) return 'rgba(26,188,156,0.2)';
  if (pct >= 0.5)  return 'rgba(26,188,156,0.08)';
  if (pct >= 0.25) return 'rgba(255,107,53,0.08)';
  return 'rgba(231,76,60,0.15)';
}

const CHIP_NAMES: Record<number, string> = {
  1: 'Assistant Manager',
  2: 'Team Boost',
  3: 'Super Captain',
  4: 'Swap Out',
  5: 'Player Add',
};

// ============================================================
// Main
// ============================================================
export default function ScoreboardPage() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'survivors' | 'managers'>('survivors');
  const [tribeFilter, setTribeFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'total' | 'name'>('total');
  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<number>>(new Set());
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(new Set());

  // Data
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [survivorScores, setSurvivorScores] = useState<SurvivorScoreRow[]>([]);
  const [managers, setManagers] = useState<ManagerInfo[]>([]);
  const [managerScores, setManagerScores] = useState<ManagerScoreRow[]>([]);
  const [weeklyPicks, setWeeklyPicks] = useState<WeeklyPickRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [seasonRes, survivorsRes, sScoresRes, managersRes, mScoresRes, picksRes, teamsRes] = await Promise.all([
        supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
        supabase.from('survivors').select('id, name, tribe, is_active, elimination_order, eliminated_episode').eq('season_id', SEASON_ID).order('name'),
        supabase.from('survivor_scores').select('survivor_id, episode, final_points').eq('season_id', SEASON_ID).order('episode'),
        supabase.from('managers').select('id, name, draft_position').eq('season_id', SEASON_ID).order('draft_position'),
        supabase.from('manager_scores').select('manager_id, episode, fantasy_points, base_team_points, captain_bonus, chip_bonus, voted_out_bonus, net_correct, chip_played, chip_detail, captain_lost').eq('season_id', SEASON_ID).order('episode'),
        supabase.from('weekly_picks').select('manager_id, episode, captain_id, chip_played, swap_out_ids, swap_in_ids').eq('season_id', SEASON_ID).order('episode', { ascending: false }),
        // Fetch ALL team members (active + inactive) so voted-out survivors still show
        supabase.from('teams').select('manager_id, survivor_id').eq('season_id', SEASON_ID),
      ]);

      setCurrentEpisode(seasonRes.data?.current_episode || 2);
      setSurvivors(survivorsRes.data || []);
      setSurvivorScores(sScoresRes.data || []);
      setManagers(managersRes.data || []);
      setManagerScores((mScoresRes.data || []) as ManagerScoreRow[]);
      setWeeklyPicks(picksRes.data || []);
      setTeams(teamsRes.data || []);
    } catch (err) {
      console.error('Failed to load scoreboard:', err);
    } finally {
      setLoading(false);
    }
  }

  const episodes = useMemo(() => {
    return Array.from(new Set(survivorScores.map(s => s.episode))).sort((a, b) => a - b);
  }, [survivorScores]);

  const survivorMap = useMemo(() => {
    const m = new Map<string, Survivor>();
    survivors.forEach(s => m.set(s.id, s));
    return m;
  }, [survivors]);

  // ---- Captain info per manager (most recent pick) ----
  const captainInfo = useMemo(() => {
    const info: Record<string, { name: string; isActive: boolean }> = {};
    // weeklyPicks is sorted desc by episode, first match = most recent
    weeklyPicks.forEach(pick => {
      if (info[pick.manager_id]) return;
      if (!pick.captain_id) return;
      const s = survivorMap.get(pick.captain_id);
      if (s) {
        info[pick.manager_id] = { name: s.name, isActive: s.is_active };
      } else {
        info[pick.manager_id] = { name: '—', isActive: false };
      }
    });
    return info;
  }, [weeklyPicks, survivorMap]);

  // Captain privilege lost per manager (any prior episode with captain_lost = true)
  const captainPrivilegeLost = useMemo(() => {
    const lost = new Set<string>();
    managerScores.forEach(ms => { if (ms.captain_lost) lost.add(ms.manager_id); });
    return lost;
  }, [managerScores]);

  // ---- Survivor view data ----
  const survivorData = useMemo(() => {
    const filtered = tribeFilter === 'All' ? survivors : survivors.filter(s => s.tribe === tribeFilter);
    return filtered.map(s => {
      const scores: Record<number, number> = {};
      let total = 0;
      survivorScores.filter(ss => ss.survivor_id === s.id).forEach(ss => {
        scores[ss.episode] = ss.final_points;
        total += ss.final_points;
      });
      return { ...s, scores, total };
    }).sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : b.total - a.total);
  }, [survivors, survivorScores, tribeFilter, sortBy]);

  // ---- Manager view data ----
  const managerData = useMemo(() => {
    return managers.map(m => {
      const myTeamIds = teams.filter(t => t.manager_id === m.id).map(t => t.survivor_id);
      const myTeam = myTeamIds.map(id => survivorMap.get(id)).filter(Boolean) as Survivor[];
      const activePlayers = myTeam.filter(s => s.is_active).length;
      const captain = captainInfo[m.id] || { name: '—', isActive: false };
      const privLost = captainPrivilegeLost.has(m.id);

      const epDetails: Record<number, {
        fantasy: number; team: number; captain: number;
        votedOut: number; chip: number; chipPlayed: number | null;
        chipDetail: string | null; netCorrect: boolean; captainLost: boolean;
        captainId: string | null;
        swapOutIds: string[]; swapInIds: string[];
      }> = {};
      let grandTotal = 0;

      managerScores.filter(ms => ms.manager_id === m.id).forEach(ms => {
        const pick = weeklyPicks.find(p => p.manager_id === m.id && p.episode === ms.episode);
        epDetails[ms.episode] = {
          fantasy:    ms.fantasy_points    || 0,
          team:       ms.base_team_points  || 0,
          captain:    ms.captain_bonus     || 0,
          votedOut:   ms.voted_out_bonus   || 0,
          chip:       ms.chip_bonus        || 0,
          chipPlayed: ms.chip_played       || null,
          chipDetail: ms.chip_detail       || null,
          netCorrect: ms.net_correct       || false,
          captainLost:ms.captain_lost      || false,
          captainId:  pick?.captain_id     || null,
          swapOutIds: pick?.swap_out_ids   || [],
          swapInIds:  pick?.swap_in_ids    || [],
        };
        grandTotal += ms.fantasy_points || 0;
      });

      return { ...m, myTeam, activePlayers, captain, captainPrivLost: privLost, epDetails, grandTotal };
    }).sort((a, b) => b.grandTotal - a.grandTotal);
  }, [managers, managerScores, weeklyPicks, teams, survivorMap, captainInfo, captainPrivilegeLost]);

  function toggleEpisode(ep: number) {
    setExpandedEpisodes(prev => {
      const next = new Set(prev);
      next.has(ep) ? next.delete(ep) : next.add(ep);
      return next;
    });
  }

  function toggleManager(id: string) {
    setExpandedManagers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto px-4 py-12 text-center">
      <div className="text-4xl mb-4 animate-pulse">📊</div>
      <p className="text-white/30 text-sm">Loading scoreboard...</p>
    </div>
  );

  if (episodes.length === 0) return (
    <div className="max-w-5xl mx-auto px-4 py-12 text-center">
      <div className="text-4xl mb-4">📊</div>
      <h1 className="text-2xl font-extrabold text-white mb-2">Fantasy Scoring</h1>
      <p className="text-white/30 text-sm">No scores yet. Check back after Episode 2 scores are entered.</p>
    </div>
  );

  const tribes = [...new Set(survivors.map(s => s.tribe))].sort();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-wider">📊 Fantasy Scoring</h1>
          <p className="text-white/25 text-xs mt-1">Season 50 · Through Episode {currentEpisode - 1}</p>
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {(['survivors', 'managers'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-4 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer border-none capitalize"
              style={{ background: view === v ? 'rgba(255,107,53,0.15)' : 'transparent', color: view === v ? '#FF6B35' : 'rgba(255,255,255,0.35)' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ======== SURVIVORS VIEW ======== */}
      {view === 'survivors' && (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex gap-0.5 bg-white/[0.03] rounded-md p-0.5">
              {['All', ...tribes].map(t => {
                const active = tribeFilter === t;
                const color = t === 'All' ? '#fff' : (TRIBE_COLORS as any)[t];
                return (
                  <button key={t} onClick={() => setTribeFilter(t)}
                    className="px-3 py-1.5 text-[10px] font-semibold border-none rounded cursor-pointer transition-all"
                    style={{ background: active ? (t === 'All' ? 'rgba(255,255,255,0.1)' : `${color}22`) : 'transparent', color: active ? color : 'rgba(255,255,255,0.25)' }}>
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-0.5 bg-white/[0.03] rounded-md p-0.5">
              {[{ key: 'total' as const, label: 'By Points' }, { key: 'name' as const, label: 'A–Z' }].map(s => (
                <button key={s.key} onClick={() => setSortBy(s.key)}
                  className="px-3 py-1.5 text-[10px] font-semibold border-none rounded cursor-pointer transition-all"
                  style={{ background: sortBy === s.key ? 'rgba(255,107,53,0.15)' : 'transparent', color: sortBy === s.key ? '#FF6B35' : 'rgba(255,255,255,0.25)' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="text-left p-2.5 text-white/35 font-bold text-[10px] tracking-wider sticky left-0 bg-[#0d0d15] z-10 min-w-[120px]">SURVIVOR</th>
                  <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-16">TRIBE</th>
                  <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-16">STATUS</th>
                  {episodes.map(ep => (
                    <th key={ep} className="text-center p-2 text-white/25 font-bold text-[9px] tracking-wider min-w-[44px]">E{ep}</th>
                  ))}
                  <th className="text-center p-2.5 text-white/50 font-extrabold text-[10px] tracking-wider w-16">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {survivorData.map(s => (
                  <tr key={s.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="p-2.5 sticky left-0 bg-[#0d0d15] z-10">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-extrabold text-white"
                          style={{ background: `linear-gradient(135deg, ${(TRIBE_COLORS as any)[s.tribe]}44, ${(TRIBE_COLORS as any)[s.tribe]}77)`, border: `1.5px solid ${(TRIBE_COLORS as any)[s.tribe]}` }}>
                          {s.name.startsWith('"') ? 'Q' : s.name[0]}
                        </div>
                        <span className={`font-semibold ${s.is_active ? 'text-white/70' : 'text-white/30 line-through'}`}>{s.name}</span>
                      </div>
                    </td>
                    <td className="p-2.5 text-center">
                      <span className="text-[10px] font-bold tracking-wider" style={{ color: (TRIBE_COLORS as any)[s.tribe] }}>{s.tribe.toUpperCase()}</span>
                    </td>
                    <td className="p-2.5 text-center">
                      {s.is_active
                        ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">ACTIVE</span>
                        : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">OUT {s.eliminated_episode ? `E${s.eliminated_episode}` : ''}</span>}
                    </td>
                    {episodes.map(ep => {
                      const pts = s.scores[ep];
                      const isElimEp = s.eliminated_episode === ep;
                      const allEpPts = survivorData.map(sd => sd.scores[ep] || 0).filter(p => p > 0);
                      if (pts === undefined || pts === null) return <td key={ep} className="p-1.5 text-center"><span className="text-white/[0.06]">—</span></td>;
                      return (
                        <td key={ep} className="p-1.5 text-center">
                          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${isElimEp ? 'ring-1 ring-red-500/30' : ''}`}
                            style={{ background: heatColor(pts, Math.min(...allEpPts), Math.max(...allEpPts)) }}>
                            {pts}{isElimEp && <span className="text-[8px] text-red-400 ml-0.5">✕</span>}
                          </span>
                        </td>
                      );
                    })}
                    <td className="p-2.5 text-center">
                      <span className="text-[13px] font-extrabold text-white px-2 py-0.5 rounded-md bg-white/[0.05]">{s.total}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[10px] text-white/20">
            Scores from FantasySurvivorGame.com + manual adjustments. ✕ = elimination episode. Colors show relative performance per episode.
          </div>
        </>
      )}

      {/* ======== MANAGERS VIEW ======== */}
      {view === 'managers' && (
        <>
          <p className="text-xs text-white/30 mb-4">
            Click a manager&apos;s name for a full episode breakdown. Click an episode header to show summary sub-columns.
          </p>

          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.03]">
                  {/* Manager */}
                  <th className="text-left p-2.5 text-white/35 font-bold text-[10px] tracking-wider sticky left-0 bg-[#0d0d15] z-10 min-w-[110px]">MANAGER</th>
                  {/* Players */}
                  <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-16">PLAYERS</th>
                  {/* Captain */}
                  <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-24">CAPTAIN</th>
                  {/* Episode columns */}
                  {episodes.map(ep => {
                    const isExp = expandedEpisodes.has(ep);
                    if (isExp) {
                      return (
                        <th key={ep} colSpan={5} className="p-0">
                          <div onClick={() => toggleEpisode(ep)} className="cursor-pointer hover:bg-white/[0.02] transition-all">
                            <div className="flex items-center justify-center gap-1 p-2 border-b border-white/[0.06]" style={{ background: 'rgba(255,107,53,0.06)' }}>
                              <span className="text-[10px] font-bold text-[#FF6B35] tracking-wider">E{ep}</span>
                              <span className="text-white/20 text-[9px]">▲</span>
                            </div>
                            <div className="flex">
                              <div className="flex-1 text-center p-1.5 text-white/25 font-bold text-[8px] tracking-wider border-r border-white/[0.04]">TEAM</div>
                              <div className="flex-1 text-center p-1.5 text-yellow-400/40 font-bold text-[8px] tracking-wider border-r border-white/[0.04]">👑</div>
                              <div className="flex-1 text-center p-1.5 text-emerald-400/40 font-bold text-[8px] tracking-wider border-r border-white/[0.04]">V.O.</div>
                              <div className="flex-1 text-center p-1.5 text-orange-400/40 font-bold text-[8px] tracking-wider border-r border-white/[0.04]">🎰</div>
                              <div className="flex-1 text-center p-1.5 text-white/40 font-extrabold text-[8px] tracking-wider">TOT</div>
                            </div>
                          </div>
                        </th>
                      );
                    }
                    return (
                      <th key={ep} onClick={() => toggleEpisode(ep)}
                        className="text-center p-2 text-white/25 font-bold text-[9px] tracking-wider min-w-[50px] cursor-pointer hover:bg-white/[0.02] transition-all">
                        <div className="flex items-center justify-center gap-0.5">
                          <span>E{ep}</span>
                          <span className="text-white/15 text-[8px]">▼</span>
                        </div>
                      </th>
                    );
                  })}
                  <th className="text-center p-2.5 text-white/50 font-extrabold text-[10px] tracking-wider w-16">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {managerData.map((m, mi) => {
                  const rank = mi + 1;
                  const isExpanded = expandedManagers.has(m.id);

                  return (
                    <>
                      {/* ── Main row ── */}
                      <tr key={m.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">

                        {/* Manager name — clickable to expand detail drawer */}
                        <td className="p-2.5 sticky left-0 bg-[#0d0d15] z-10">
                          <button
                            onClick={() => toggleManager(m.id)}
                            className="flex items-center gap-2 w-full text-left border-none bg-transparent cursor-pointer group"
                          >
                            <span className="text-white/20 text-[10px] font-bold w-4 text-center flex-shrink-0">
                              {rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank}
                            </span>
                            <span className="font-bold text-white text-[12px] group-hover:text-orange-300 transition-colors">{m.name}</span>
                            <span className="text-white/20 text-[9px] ml-auto">{isExpanded ? '▲' : '▼'}</span>
                          </button>
                        </td>

                        {/* Players */}
                        <td className="p-2.5 text-center">
                          <div className="flex justify-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, j) => (
                              <div key={j} className="w-1.5 h-1.5 rounded-full"
                                style={{ background: j < m.activePlayers ? '#1ABC9C' : 'rgba(255,255,255,0.1)' }} />
                            ))}
                          </div>
                          <div className="text-[8px] text-white/20 mt-0.5">{m.activePlayers}/5</div>
                        </td>

                        {/* Captain */}
                        <td className="p-2.5 text-center">
                          {m.captainPrivLost ? (
                            <div>
                              <div className="text-[11px] font-semibold text-white/25">{m.captain.name}</div>
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded mt-0.5 inline-block" style={{ background: 'rgba(231,76,60,0.1)', color: '#E74C3C' }}>💀 LOST</span>
                            </div>
                          ) : (
                            <div>
                              <div className="text-[11px] font-semibold text-white">{m.captain.name}</div>
                              {m.captain.name !== '—' && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded mt-0.5 inline-block" style={{ background: 'rgba(26,188,156,0.12)', color: '#1ABC9C' }}>✓ ACTIVE</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Episode cells */}
                        {episodes.map(ep => {
                          const d = m.epDetails[ep];
                          const isExp = expandedEpisodes.has(ep);
                          const pts = d?.fantasy || 0;

                          if (isExp) {
                            return (
                              <td key={ep} colSpan={5} className="p-0">
                                <div className="flex">
                                  <div className="flex-1 text-center p-2 border-r border-white/[0.04]"><span className="text-white/50 font-semibold text-[11px]">{d?.team || 0}</span></div>
                                  <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                                    {(d?.captain || 0) > 0 ? <span className="text-yellow-300 font-bold text-[11px]">+{d!.captain}</span> : <span className="text-white/[0.08] text-[11px]">—</span>}
                                  </div>
                                  <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                                    {(d?.votedOut || 0) > 0 ? <span className="text-emerald-400 font-bold text-[11px]">+{d!.votedOut}</span> : <span className="text-white/[0.08] text-[11px]">—</span>}
                                  </div>
                                  <div className="flex-1 text-center p-2 border-r border-white/[0.04]">
                                    {(d?.chip || 0) > 0 ? <span className="text-orange-400 font-bold text-[11px]">+{d!.chip}</span> : <span className="text-white/[0.08] text-[11px]">—</span>}
                                  </div>
                                  <div className="flex-1 text-center p-2"><span className="text-white font-extrabold text-[12px]">{pts}</span></div>
                                </div>
                              </td>
                            );
                          }

                          const allMgrPts = managerData.map(md => md.epDetails[ep]?.fantasy || 0);
                          return (
                            <td key={ep} className="p-1.5 text-center">
                              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ background: pts > 0 ? heatColor(pts, Math.min(...allMgrPts), Math.max(...allMgrPts)) : 'transparent' }}>
                                {pts || '—'}
                              </span>
                              {d?.chipPlayed && <div className="text-[8px] text-yellow-300 mt-0.5">🎰</div>}
                            </td>
                          );
                        })}

                        {/* Total */}
                        <td className="p-2.5 text-center">
                          <span className="text-[15px] font-extrabold text-white px-2 py-0.5 rounded-md bg-white/[0.05]">{m.grandTotal}</span>
                        </td>
                      </tr>

                      {/* ── Detail drawer row ── */}
                      {isExpanded && (
                        <tr key={`${m.id}-drawer`} className="border-t border-orange-500/10">
                          <td colSpan={3 + (expandedEpisodes.size > 0 ? episodes.reduce((acc, ep) => acc + (expandedEpisodes.has(ep) ? 5 : 1), 0) : episodes.length) + 1}
                            className="p-0 bg-[#0d0d12]">
                            <div className="p-4">
                              <div className="text-[10px] font-bold tracking-widest text-orange-400/60 uppercase mb-3">
                                {m.name} — Episode Breakdown
                              </div>
                              <div className="flex gap-3 overflow-x-auto pb-2">
                                {episodes.map(ep => {
                                  const d = m.epDetails[ep];
                                  if (!d) return null;

                                  // Get captain for this episode
                                  const epCaptainId = d.captainId;
                                  const epCaptain = epCaptainId ? survivorMap.get(epCaptainId) : null;

                                  // Build effective team for this episode.
                                  // If chip 4 (Swap Out) was played, substitute swapped survivors.
                                  const isSwapEp = d.chipPlayed === 4 && d.swapOutIds.length > 0 && d.swapInIds.length > 0;
                                  const effectiveTeamIds: string[] = isSwapEp
                                    ? [
                                        ...m.myTeam.filter(s => !d.swapOutIds.includes(s.id)).map(s => s.id),
                                        ...d.swapInIds,
                                      ]
                                    : m.myTeam.map(s => s.id);

                                  // Build display rows — duplicates (e.g. all-Rick) get separate rows
                                  const teamWithScores = effectiveTeamIds.map((sid, idx) => {
                                    const s = survivorMap.get(sid);
                                    if (!s) return null;
                                    const score = survivorScores.find(ss => ss.survivor_id === sid && ss.episode === ep);
                                    const isVotedOut = s.eliminated_episode === ep;
                                    const isCaptain = sid === epCaptainId;
                                    const isSwappedIn = isSwapEp && d.swapInIds.includes(sid);
                                    return { ...s, epPts: score?.final_points || 0, isVotedOut, isCaptain, isSwappedIn, rowKey: `${sid}-${idx}` };
                                  }).filter(Boolean).sort((a, b) => b!.epPts - a!.epPts) as (Survivor & { epPts: number; isVotedOut: boolean; isCaptain: boolean; isSwappedIn: boolean; rowKey: string })[];

                                  // All survivors eliminated this episode who are on this team
                                  const votedOutThisEp = teamWithScores.filter(s => s.isVotedOut);

                                  const tc = TRIBE_COLORS as Record<string, string>;

                                  return (
                                    <div key={ep} className="flex-shrink-0 rounded-xl border border-white/[0.06] overflow-hidden"
                                      style={{ minWidth: '200px', background: 'rgba(255,255,255,0.02)' }}>
                                        {/* Episode header */}
                                        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]"
                                          style={{ background: isSwapEp ? 'rgba(52,152,219,0.08)' : 'rgba(255,107,53,0.06)' }}>
                                          <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-extrabold text-orange-400">E{ep}</span>
                                            {isSwapEp && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(52,152,219,0.15)', color: '#3498DB' }}>🔄 SWAP</span>}
                                          </div>
                                          <span className="text-[13px] font-extrabold text-white">{d.fantasy} pts</span>
                                        </div>

                                        <div className="p-3 flex flex-col gap-3">

                                          {/* Team section */}
                                          <div>
                                            <div className="text-[8px] font-bold tracking-widest text-white/25 uppercase mb-1.5">
                                              Team <span className="text-white/40">{d.team} pts</span>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                              {teamWithScores.map(s => (
                                                <div key={s.rowKey} className="flex items-center justify-between gap-2">
                                                  <div className="flex items-center gap-1.5 min-w-0">
                                                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tc[s.tribe] || '#888' }} />
                                                    <span className="text-[11px] truncate" style={{
                                                      color: s.isVotedOut ? '#E74C3C' : s.isCaptain ? '#FFD54F' : s.isSwappedIn ? '#3498DB' : 'rgba(255,255,255,0.6)',
                                                      textDecoration: s.isVotedOut ? 'none' : !s.is_active ? 'line-through' : 'none',
                                                    }}>
                                                      {s.name}
                                                    </span>
                                                    {s.isCaptain && <span className="text-[8px]">👑</span>}
                                                    {s.isVotedOut && <span className="text-[8px]">💀</span>}
                                                    {s.isSwappedIn && !s.isVotedOut && <span className="text-[7px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(52,152,219,0.15)', color: '#3498DB' }}>NEW</span>}
                                                  </div>
                                                  <span className="text-[11px] font-bold flex-shrink-0" style={{ color: s.epPts > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)' }}>
                                                    {s.epPts || '—'}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>

                                        {/* Captain bonus */}
                                        {d.captain > 0 && (
                                          <div className="border-t border-white/[0.04] pt-2">
                                            <div className="text-[8px] font-bold tracking-widest text-yellow-400/50 uppercase mb-1">Captain 2×</div>
                                            <div className="flex items-center justify-between">
                                              <span className="text-[11px] text-white/50">{epCaptain?.name || '—'}</span>
                                              <span className="text-[11px] font-bold text-yellow-300">+{d.captain}</span>
                                            </div>
                                            {d.captainLost && (
                                              <div className="text-[9px] text-red-400/70 mt-0.5">⚠ Captain privilege lost this episode</div>
                                            )}
                                          </div>
                                        )}

                                        {/* Voted out bonus — one line per eliminated survivor */}
                                        {d.votedOut > 0 && (
                                          <div className="border-t border-white/[0.04] pt-2">
                                            <div className="text-[8px] font-bold tracking-widest text-emerald-400/50 uppercase mb-1">Voted Out Bonus</div>
                                            {votedOutThisEp.length > 0 ? (
                                              votedOutThisEp.map(s => (
                                                <div key={s.id} className="flex items-center justify-between">
                                                  <span className="text-[11px] text-white/50">{s.name}</span>
                                                  <span className="text-[11px] font-bold text-emerald-400">+{s.elimination_order || 0}</span>
                                                </div>
                                              ))
                                            ) : (
                                              // Fallback: shouldn't normally hit, but just in case
                                              <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-white/50">Eliminated</span>
                                                <span className="text-[11px] font-bold text-emerald-400">+{d.votedOut}</span>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Chip bonus */}
                                        {d.chip > 0 && (
                                          <div className="border-t border-white/[0.04] pt-2">
                                            <div className="text-[8px] font-bold tracking-widest text-orange-400/50 uppercase mb-1">
                                              Chip: {d.chipPlayed ? CHIP_NAMES[d.chipPlayed] || `Chip ${d.chipPlayed}` : ''}
                                            </div>
                                            <div className="flex items-center justify-between">
                                              <span className="text-[10px] text-white/30 truncate pr-2">{d.chipDetail || ''}</span>
                                              <span className="text-[11px] font-bold text-orange-400 flex-shrink-0">+{d.chip}</span>
                                            </div>
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
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-[10px] text-white/20">
            Click a manager&apos;s name to expand episode detail cards. Click episode headers to show summary sub-columns. 👑 = captain 2x bonus · V.O. = voted out bonus · 🎰 = chip.
          </div>
        </>
      )}
    </div>
  );
}
