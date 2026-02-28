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
  voted_out_bonus: number;
  net_correct: boolean;
  chip_effect_detail: string | null;
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

// ============================================================
// Main
// ============================================================
export default function ScoreboardPage() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'survivors' | 'managers'>('survivors');
  const [tribeFilter, setTribeFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'total' | 'name'>('total');

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
        supabase.from('manager_scores').select('manager_id, episode, fantasy_points, voted_out_bonus, net_correct, chip_effect_detail').eq('season_id', SEASON_ID).order('episode'),
        supabase.from('weekly_picks').select('manager_id, episode, captain_id, chip_played').eq('season_id', SEASON_ID),
        supabase.from('teams').select('manager_id, survivor_id').eq('season_id', SEASON_ID).eq('is_active', true),
      ]);

      setCurrentEpisode(seasonRes.data?.current_episode || 2);
      setSurvivors(survivorsRes.data || []);
      setSurvivorScores(sScoresRes.data || []);
      setManagers(managersRes.data || []);
      setManagerScores(mScoresRes.data || []);
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
    const eps = [...new Set(survivorScores.map(s => s.episode))].sort((a, b) => a - b);
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
      const scores: Record<number, number> = {};
      let grandTotal = 0;
      let votedOutTotal = 0;

      managerScores.filter(ms => ms.manager_id === m.id).forEach(ms => {
        scores[ms.episode] = ms.fantasy_points;
        grandTotal += ms.fantasy_points;
        votedOutTotal += ms.voted_out_bonus || 0;
      });

      // Get captain picks per episode
      const captains: Record<number, string | null> = {};
      const chips: Record<number, number | null> = {};
      weeklyPicks.filter(p => p.manager_id === m.id).forEach(p => {
        captains[p.episode] = p.captain_id;
        chips[p.episode] = p.chip_played;
      });

      return { ...m, scores, grandTotal, votedOutTotal, captains, chips };
    }).sort((a, b) => b.grandTotal - a.grandTotal);
  }, [managers, managerScores, weeklyPicks]);

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
          <h1 className="text-xl font-extrabold text-white tracking-wider">📊 Scoreboard</h1>
          <p className="text-white/25 text-xs mt-1">Season 50 · Through Episode {currentEpisode}</p>
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {[
            { key: 'survivors' as const, label: 'Survivors' },
            { key: 'managers' as const, label: 'Managers' },
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
                  // Compute heat map bounds per episode
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
                        // Heat map: get all survivor scores for this episode
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

      {/* ======== MANAGERS VIEW ======== */}
      {view === 'managers' && (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="text-left p-2.5 text-white/35 font-bold text-[10px] tracking-wider sticky left-0 bg-[#0d0d15] z-10 min-w-[100px]">MANAGER</th>
                  {episodes.map(ep => (
                    <th key={ep} className="text-center p-2 text-white/25 font-bold text-[9px] tracking-wider min-w-[50px]">E{ep}</th>
                  ))}
                  <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-14">V.O.</th>
                  <th className="text-center p-2.5 text-white/50 font-extrabold text-[10px] tracking-wider w-16">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {managerData.map((m, mi) => {
                  return (
                    <tr key={m.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="p-2.5 sticky left-0 bg-[#0d0d15] z-10">
                        <div className="font-bold text-white text-[13px]">{m.name}</div>
                      </td>
                      {episodes.map(ep => {
                        const pts = m.scores[ep] || 0;
                        const hasChip = m.chips[ep];
                        // Heat map across all managers for this episode
                        const allMgrPts = managerData.map(md => md.scores[ep] || 0);
                        const epMin = Math.min(...allMgrPts);
                        const epMax = Math.max(...allMgrPts);

                        return (
                          <td key={ep} className="p-1.5 text-center">
                            <span
                              className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ background: pts > 0 ? heatColor(pts, epMin, epMax) : 'transparent' }}
                            >
                              {pts || '—'}
                            </span>
                            {hasChip && (
                              <div className="text-[8px] text-yellow-300 mt-0.5">🎰</div>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2.5 text-center">
                        {m.votedOutTotal > 0 ? (
                          <span className="text-[11px] font-semibold text-emerald-400">+{m.votedOutTotal}</span>
                        ) : (
                          <span className="text-white/[0.06]">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className="text-[15px] font-extrabold text-white px-2 py-0.5 rounded-md bg-white/[0.05]">
                          {m.grandTotal}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-[10px] text-white/20">
            Manager episode totals include captain 2x multiplier. V.O. = voted out bonus points from eliminated team members. 🎰 = chip played that episode.
          </div>
        </>
      )}
    </div>
  );
}
