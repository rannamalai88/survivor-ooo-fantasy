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
}

interface WeeklyPickRow {
  manager_id: string;
  episode: number;
  captain_id: string | null;
  chip_played: number | null;
}

// ============================================================
// Helpers
// ============================================================
function heatColor(val: number, min: number, max: number): string {
  if (max === min) return 'rgba(255,255,255,0.05)';
  const pct = (val - min) / (max - min);
  if (pct >= 0.75) return 'rgba(26,188,156,0.2)';
  if (pct >= 0.5) return 'rgba(26,188,156,0.08)';
  if (pct >= 0.25) return 'rgba(255,107,53,0.08)';
  return 'rgba(231,76,60,0.15)';
}

const CHIP_NAMES: Record<number, string> = {
  1: 'Asst Mgr',
  2: 'Team Boost',
  3: 'Super Capt',
  4: 'Swap Out',
  5: 'Player Add',
};

// ============================================================
// Main
// ============================================================
export default function ScoreboardPage() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'survivors' | 'fantasy'>('survivors');
  const [tribeFilter, setTribeFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'total' | 'name'>('total');
  const [expandedManager, setExpandedManager] = useState<string | null>(null);

  // Data
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [survivorScores, setSurvivorScores] = useState<SurvivorScoreRow[]>([]);
  const [managers, setManagers] = useState<ManagerInfo[]>([]);
  const [managerScores, setManagerScores] = useState<ManagerScoreRow[]>([]);
  const [weeklyPicks, setWeeklyPicks] = useState<WeeklyPickRow[]>([]);
  const [teams, setTeams] = useState<{ manager_id: string; survivor_id: string }[]>([]);
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
        supabase.from('manager_scores').select('manager_id, episode, fantasy_points, base_team_points, captain_bonus, chip_bonus, voted_out_bonus, net_correct, chip_played, chip_detail').eq('season_id', SEASON_ID).order('episode'),
        supabase.from('weekly_picks').select('manager_id, episode, captain_id, chip_played').eq('season_id', SEASON_ID),
        supabase.from('teams').select('manager_id, survivor_id').eq('season_id', SEASON_ID).eq('is_active', true),
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

  // Episodes that have scores
  const episodes = useMemo(() => {
    const eps = Array.from(new Set(survivorScores.map(s => s.episode))).sort((a, b) => a - b);
    return eps;
  }, [survivorScores]);

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
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return b.total - a.total;
    });
  }, [survivors, survivorScores, tribeFilter, sortBy]);

  // ---- Manager view data ----
  const managerData = useMemo(() => {
    return managers.map(m => {
      const epDetails: Record<number, {
        fantasy: number;
        team: number;
        captain: number;
        votedOut: number;
        chip: number;
        chipPlayed: number | null;
        chipDetail: string | null;
        netCorrect: boolean;
      }> = {};
      let grandTotal = 0;

      managerScores.filter(ms => ms.manager_id === m.id).forEach(ms => {
        epDetails[ms.episode] = {
          fantasy: ms.fantasy_points || 0,
          team: ms.base_team_points || 0,
          captain: ms.captain_bonus || 0,
          votedOut: ms.voted_out_bonus || 0,
          chip: ms.chip_bonus || 0,
          chipPlayed: ms.chip_played || null,
          chipDetail: ms.chip_detail || null,
          netCorrect: ms.net_correct || false,
        };
        grandTotal += ms.fantasy_points || 0;
      });

      return { ...m, epDetails, grandTotal };
    }).sort((a, b) => b.grandTotal - a.grandTotal);
  }, [managers, managerScores]);

  // ---- Render ----
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4 animate-pulse">📊</div>
        <p className="text-white/30 text-sm">Loading scoreboard...</p>
      </div>
    );
  }

  if (episodes.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4">📊</div>
        <h1 className="text-2xl font-extrabold text-white mb-2">Scoreboard</h1>
        <p className="text-white/30 text-sm">No scores yet. Check back after Episode 2 scores are entered.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-wider">📊 Fantasy Scoring</h1>
          <p className="text-white/25 text-xs mt-1">Season 50 · Through Episode {currentEpisode}</p>
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {[
            { key: 'survivors' as const, label: 'Survivors' },
            { key: 'fantasy' as const, label: 'Fantasy Scoring' },
          ].map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className="px-4 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer border-none"
              style={{
                background: view === v.key ? 'rgba(255,107,53,0.15)' : 'transparent',
                color: view === v.key ? '#FF6B35' : 'rgba(255,255,255,0.35)',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ======== SURVIVORS VIEW ======== */}
      {view === 'survivors' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex gap-0.5 bg-white/[0.03] rounded-md p-0.5">
              {['All', 'Vatu', 'Kalo', 'Cila'].map(t => {
                const active = tribeFilter === t;
                const color = t === 'All' ? '#fff' : TRIBE_COLORS[t];
                return (
                  <button
                    key={t}
                    onClick={() => setTribeFilter(t)}
                    className="px-3 py-1.5 text-[10px] font-semibold border-none rounded cursor-pointer transition-all"
                    style={{
                      background: active ? (t === 'All' ? 'rgba(255,255,255,0.1)' : `${color}22`) : 'transparent',
                      color: active ? color : 'rgba(255,255,255,0.25)',
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-0.5 bg-white/[0.03] rounded-md p-0.5">
              {[
                { key: 'total' as const, label: 'By Points' },
                { key: 'name' as const, label: 'A–Z' },
              ].map(s => (
                <button
                  key={s.key}
                  onClick={() => setSortBy(s.key)}
                  className="px-3 py-1.5 text-[10px] font-semibold border-none rounded cursor-pointer transition-all"
                  style={{
                    background: sortBy === s.key ? 'rgba(255,107,53,0.15)' : 'transparent',
                    color: sortBy === s.key ? '#FF6B35' : 'rgba(255,255,255,0.25)',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
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
                {survivorData.map(s => {
                  return (
                    <tr key={s.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="p-2.5 sticky left-0 bg-[#0d0d15] z-10">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-extrabold text-white"
                            style={{
                              background: `linear-gradient(135deg, ${TRIBE_COLORS[s.tribe]}44, ${TRIBE_COLORS[s.tribe]}77)`,
                              border: `1.5px solid ${TRIBE_COLORS[s.tribe]}`,
                            }}
                          >
                            {s.name.startsWith('"') ? 'Q' : s.name[0]}
                          </div>
                          <span className={`font-semibold ${s.is_active ? 'text-white/70' : 'text-white/30 line-through'}`}>
                            {s.name}
                          </span>
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-[10px] font-bold tracking-wider" style={{ color: TRIBE_COLORS[s.tribe] }}>
                          {s.tribe.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        {s.is_active ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">ACTIVE</span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                            OUT {s.eliminated_episode ? `E${s.eliminated_episode}` : ''}
                          </span>
                        )}
                      </td>
                      {episodes.map(ep => {
                        const pts = s.scores[ep];
                        const isElimEp = s.eliminated_episode === ep;
                        const allEpPts = survivorData.map(sd => sd.scores[ep] || 0).filter(p => p > 0);
                        const epMin = allEpPts.length ? Math.min(...allEpPts) : 0;
                        const epMax = allEpPts.length ? Math.max(...allEpPts) : 0;

                        if (pts === undefined || pts === null) {
                          return (
                            <td key={ep} className="p-1.5 text-center">
                              <span className="text-white/[0.06]">—</span>
                            </td>
                          );
                        }

                        return (
                          <td key={ep} className="p-1.5 text-center">
                            <span
                              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${isElimEp ? 'ring-1 ring-red-500/30' : ''}`}
                              style={{ background: heatColor(pts, epMin, epMax) }}
                            >
                              {pts}
                              {isElimEp && <span className="text-[8px] text-red-400 ml-0.5">✕</span>}
                            </span>
                          </td>
                        );
                      })}
                      <td className="p-2.5 text-center">
                        <span className="text-[13px] font-extrabold text-white px-2 py-0.5 rounded-md bg-white/[0.05]">
                          {s.total}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-[10px] text-white/20">
            Scores from FantasySurvivorGame.com + manual adjustments. ✕ = elimination episode. Colors show relative performance per episode.
          </div>
        </>
      )}

      {/* ======== FANTASY SCORING VIEW ======== */}
      {view === 'fantasy' && (
        <>
          <p className="text-xs text-white/30 mb-4">
            Click a manager to expand their episode-by-episode scoring breakdown.
          </p>

          <div className="space-y-2">
            {managerData.map((m, mi) => {
              const isExpanded = expandedManager === m.id;
              const rank = mi + 1;

              return (
                <div key={m.id} className="rounded-xl border border-white/[0.06] overflow-hidden">
                  {/* Summary row */}
                  <div
                    onClick={() => setExpandedManager(isExpanded ? null : m.id)}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer transition-all hover:bg-white/[0.02]"
                    style={{ background: isExpanded ? 'rgba(255,107,53,0.04)' : 'rgba(255,255,255,0.01)' }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-white/20 text-xs font-bold w-6 text-center">
                        {rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank}
                      </span>
                      <span className="text-white font-bold text-sm">{m.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Mini episode scores */}
                      <div className="hidden sm:flex items-center gap-1">
                        {episodes.map(ep => {
                          const d = m.epDetails[ep];
                          if (!d) return <span key={ep} className="text-white/10 text-[10px] w-7 text-center">—</span>;
                          return (
                            <span key={ep} className="text-white/40 text-[10px] font-semibold w-7 text-center">{d.fantasy}</span>
                          );
                        })}
                      </div>
                      <span className="text-white font-extrabold text-lg px-3 py-0.5 rounded-lg bg-white/[0.05] min-w-[50px] text-center">
                        {m.grandTotal}
                      </span>
                      <span className="text-white/20 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded breakdown */}
                  {isExpanded && (
                    <div className="border-t border-white/[0.06]">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-white/[0.03]">
                              <th className="text-left p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-20">EPISODE</th>
                              <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider">TEAM</th>
                              <th className="text-center p-2.5 text-yellow-400/50 font-bold text-[10px] tracking-wider">👑 CAPT</th>
                              <th className="text-center p-2.5 text-emerald-400/50 font-bold text-[10px] tracking-wider">V.O.</th>
                              <th className="text-center p-2.5 text-orange-400/50 font-bold text-[10px] tracking-wider">🎰 CHIP</th>
                              <th className="text-center p-2.5 text-white/50 font-extrabold text-[10px] tracking-wider">TOTAL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {episodes.map(ep => {
                              const d = m.epDetails[ep];
                              if (!d) {
                                return (
                                  <tr key={ep} className="border-t border-white/[0.03]">
                                    <td className="p-2.5 text-white/30 font-semibold">Ep {ep}</td>
                                    <td colSpan={5} className="p-2.5 text-center text-white/10">No scores</td>
                                  </tr>
                                );
                              }
                              return (
                                <tr key={ep} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                                  <td className="p-2.5">
                                    <span className="text-white/50 font-semibold">Ep {ep}</span>
                                  </td>
                                  <td className="p-2.5 text-center">
                                    <span className="text-white/60 font-semibold">{d.team}</span>
                                  </td>
                                  <td className="p-2.5 text-center">
                                    {d.captain > 0 ? (
                                      <span className="text-yellow-300 font-bold">+{d.captain}</span>
                                    ) : (
                                      <span className="text-white/10">—</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-center">
                                    {d.votedOut > 0 ? (
                                      <span className="text-emerald-400 font-bold">+{d.votedOut}</span>
                                    ) : (
                                      <span className="text-white/10">—</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-center">
                                    {d.chip > 0 ? (
                                      <div>
                                        <span className="text-orange-400 font-bold">+{d.chip}</span>
                                        {d.chipPlayed && (
                                          <div className="text-[9px] text-orange-400/50 mt-0.5">
                                            {CHIP_NAMES[d.chipPlayed] || `Chip ${d.chipPlayed}`}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-white/10">—</span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-center">
                                    <span className="text-white font-extrabold text-sm px-2 py-0.5 rounded bg-white/[0.05]">
                                      {d.fantasy}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                            {/* Season total row */}
                            <tr className="border-t-2 border-white/[0.1] bg-white/[0.02]">
                              <td className="p-2.5">
                                <span className="text-white/70 font-bold text-[11px]">SEASON</span>
                              </td>
                              <td className="p-2.5 text-center">
                                <span className="text-white/40 font-semibold">
                                  {episodes.reduce((s, ep) => s + (m.epDetails[ep]?.team || 0), 0)}
                                </span>
                              </td>
                              <td className="p-2.5 text-center">
                                <span className="text-yellow-300/70 font-semibold">
                                  {(() => { const t = episodes.reduce((s, ep) => s + (m.epDetails[ep]?.captain || 0), 0); return t > 0 ? `+${t}` : '—'; })()}
                                </span>
                              </td>
                              <td className="p-2.5 text-center">
                                <span className="text-emerald-400/70 font-semibold">
                                  {(() => { const t = episodes.reduce((s, ep) => s + (m.epDetails[ep]?.votedOut || 0), 0); return t > 0 ? `+${t}` : '—'; })()}
                                </span>
                              </td>
                              <td className="p-2.5 text-center">
                                <span className="text-orange-400/70 font-semibold">
                                  {(() => { const t = episodes.reduce((s, ep) => s + (m.epDetails[ep]?.chip || 0), 0); return t > 0 ? `+${t}` : '—'; })()}
                                </span>
                              </td>
                              <td className="p-2.5 text-center">
                                <span className="text-white font-extrabold text-base px-2.5 py-0.5 rounded-lg" style={{ background: 'linear-gradient(135deg, rgba(255,107,53,0.15), rgba(255,143,0,0.1))' }}>
                                  {m.grandTotal}
                                </span>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-[10px] text-white/20">
            Team = base team points. 👑 Capt = captain 2x bonus. V.O. = voted out bonus. 🎰 Chip = chip effect bonus. Total = all combined.
          </div>
        </>
      )}
    </div>
  );
}
