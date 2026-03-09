'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, TRIBE_COLORS } from '@/lib/constants';

// ============================================================
// Types
// ============================================================
interface Manager {
  id: string;
  name: string;
  draft_position: number;
}

interface PoolStatusRow {
  manager_id: string;
  status: string;
  weeks_survived: number;
  has_immunity_idol: boolean;
  drowned_episode: number | null;
}

interface WeeklyPickRow {
  manager_id: string;
  episode: number;
  pool_pick_id: string | null;
  pool_backdoor_id: string | null;
}

interface SurvivorInfo {
  id: string;
  name: string;
  tribe: string;
  is_active: boolean;
  eliminated_episode: number | null;
}

// ============================================================
// Helpers
// ============================================================

/** Returns true if it is currently past Wednesday 7pm CT */
function isPicksLocked(): boolean {
  const now = new Date();
  // Wednesday = day 3. CT is UTC-5 (CST) or UTC-6 (CDT).
  // Simpler: convert to CT by offsetting. CDT = UTC-5, CST = UTC-6.
  // We'll use UTC-5 as a conservative approximation (picks lock slightly early in CST).
  const CT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC-5
  const ctNow = new Date(now.getTime() - CT_OFFSET_MS);
  const dayOfWeek = ctNow.getUTCDay(); // 0=Sun … 3=Wed … 6=Sat
  const hour = ctNow.getUTCHours();
  const minute = ctNow.getUTCMinutes();

  // Locked if: day > Wednesday, OR day === Wednesday AND time >= 19:00
  if (dayOfWeek > 3) return true;
  if (dayOfWeek === 3 && (hour > 19 || (hour === 19 && minute >= 0))) return true;
  return false;
}

// ============================================================
// Component
// ============================================================
export default function PoolBoardPage() {
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [poolStatuses, setPoolStatuses] = useState<PoolStatusRow[]>([]);
  const [weeklyPicks, setWeeklyPicks] = useState<WeeklyPickRow[]>([]);
  const [survivors, setSurvivors] = useState<SurvivorInfo[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);
  const [totalEpisodes, setTotalEpisodes] = useState(13);
  const [picksLocked, setPicksLocked] = useState(false);

  useEffect(() => {
    loadData();
    // Check lock status immediately and re-check every minute
    setPicksLocked(isPicksLocked());
    const iv = setInterval(() => setPicksLocked(isPicksLocked()), 60_000);
    return () => clearInterval(iv);
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [seasonRes, managersRes, poolRes, picksRes, survivorsRes] = await Promise.all([
        supabase.from('seasons').select('current_episode, total_episodes').eq('id', SEASON_ID).single(),
        supabase.from('managers').select('id, name, draft_position').eq('season_id', SEASON_ID).order('draft_position'),
        supabase.from('pool_status').select('*').eq('season_id', SEASON_ID),
        supabase.from('weekly_picks').select('manager_id, episode, pool_pick_id, pool_backdoor_id').eq('season_id', SEASON_ID).order('episode'),
        supabase.from('survivors').select('id, name, tribe, is_active, eliminated_episode').eq('season_id', SEASON_ID),
      ]);

      setCurrentEpisode(seasonRes.data?.current_episode || 2);
      setTotalEpisodes(seasonRes.data?.total_episodes || 13);
      setManagers(managersRes.data || []);
      setPoolStatuses(poolRes.data || []);
      setWeeklyPicks(picksRes.data || []);
      setSurvivors(survivorsRes.data || []);
    } catch (err) {
      console.error('Failed to load pool data:', err);
    } finally {
      setLoading(false);
    }
  }

  // ---- Computed ----

  const survivorMap = useMemo(() => {
    const map = new Map<string, SurvivorInfo>();
    survivors.forEach(s => map.set(s.id, s));
    return map;
  }, [survivors]);

  // Eliminated survivor per episode
  const eliminatedByEp = useMemo(() => {
    const map = new Map<number, string>();
    survivors.filter(s => s.eliminated_episode).forEach(s => {
      map.set(s.eliminated_episode!, s.id);
    });
    return map;
  }, [survivors]);

  // Episodes to show:
  // - Always exclude E1
  // - Exclude current episode until picks are locked
  const episodes = useMemo(() => {
    const allEps = [...new Set(weeklyPicks.map(p => p.episode))].sort((a, b) => a - b);
    const base = allEps.length > 0 ? allEps : [2];
    return base.filter(ep => {
      if (ep === 1) return false;                          // always hide E1
      if (ep === currentEpisode && !picksLocked) return false; // hide current until locked
      return true;
    });
  }, [weeklyPicks, currentEpisode, picksLocked]);

  const poolData = useMemo(() => {
    return managers.map(m => {
      const ps = poolStatuses.find(p => p.manager_id === m.id);
      const picks = weeklyPicks.filter(p => p.manager_id === m.id);

      const epPicks = episodes.map(ep => {
        const pick = picks.find(p => p.episode === ep);
        if (!pick) return { episode: ep, type: 'none' as const, survivor: null };

        if (pick.pool_pick_id) {
          const survivor = survivorMap.get(pick.pool_pick_id);
          const wasEliminated = survivor && survivor.eliminated_episode === ep;
          return {
            episode: ep,
            type: wasEliminated ? 'drowned' as const : 'safe' as const,
            survivor,
          };
        }

        if (pick.pool_backdoor_id) {
          const survivor = survivorMap.get(pick.pool_backdoor_id);
          const eliminatedId = eliminatedByEp.get(ep);
          const correct = eliminatedId === pick.pool_backdoor_id;
          return {
            episode: ep,
            type: 'backdoor' as const,
            survivor,
            backdoorCorrect: correct,
          };
        }

        return { episode: ep, type: 'none' as const, survivor: null };
      });

      return {
        ...m,
        status: ps?.status || 'active',
        weeksSafe: ps?.weeks_survived || 0,
        hasIdol: ps?.has_immunity_idol || false,
        drownedEp: ps?.drowned_episode || null,
        picks: epPicks,
      };
    });
  }, [managers, poolStatuses, weeklyPicks, episodes, survivorMap, eliminatedByEp]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { active: 0, drowned: 0, burnt: 0, finished: 0 };
    poolData.forEach(m => {
      const s = m.status as keyof typeof counts;
      if (counts[s] !== undefined) counts[s]++;
    });
    return counts;
  }, [poolData]);

  // ---- Survivor pick frequency heatmap ----
  // Count how many managers have ever picked each survivor across all episodes
  const survivorPickCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    weeklyPicks.forEach(pick => {
      if (pick.pool_pick_id) {
        counts[pick.pool_pick_id] = (counts[pick.pool_pick_id] || 0) + 1;
      }
    });
    return counts;
  }, [weeklyPicks]);

  const maxPickCount = useMemo(() => {
    const vals = Object.values(survivorPickCounts);
    return vals.length > 0 ? Math.max(...vals) : 1;
  }, [survivorPickCounts]);

  // Sort survivors: most-picked first, then alphabetical
  const sortedSurvivors = useMemo(() => {
    return [...survivors].sort((a, b) => {
      const ca = survivorPickCounts[a.id] || 0;
      const cb = survivorPickCounts[b.id] || 0;
      if (cb !== ca) return cb - ca;
      return a.name.localeCompare(b.name);
    });
  }, [survivors, survivorPickCounts]);

  // ---- Render ----
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4 animate-pulse">🌊</div>
        <p className="text-white/30 text-sm">Loading pool board...</p>
      </div>
    );
  }

  const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
    active:   { color: '#1ABC9C', bg: 'rgba(26,188,156,0.1)',  label: 'Active'    },
    finished: { color: '#FFD54F', bg: 'rgba(255,215,0,0.1)',   label: 'Finished!' },
    drowned:  { color: '#E74C3C', bg: 'rgba(231,76,60,0.1)',   label: 'Drowned'   },
    burnt:    { color: '#95a5a6', bg: 'rgba(149,165,166,0.1)', label: 'Burnt'     },
  };

  const totalPoolWeeks = totalEpisodes - 1;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-wider">🌊 Survivor Pool Board</h1>
          <p className="text-white/25 text-xs mt-1">Season 50 · Through Episode {currentEpisode - 1}</p>
        </div>
        {!picksLocked && (
          <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            ⏱ E{currentEpisode} picks hidden until Wed 7pm CT
          </span>
        )}
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {Object.entries(STATUS_CFG).map(([key, cfg]) => (
          <div
            key={key}
            className="text-center rounded-lg p-3"
            style={{ background: cfg.bg, border: `1px solid ${cfg.color}22` }}
          >
            <div className="text-2xl font-extrabold" style={{ color: cfg.color }}>
              {(statusCounts as any)[key] || 0}
            </div>
            <div className="text-[10px] font-bold tracking-wider text-white/25 uppercase mt-0.5">{cfg.label}</div>
          </div>
        ))}
      </div>

      {/* Pool Grid */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-white/[0.03]">
              <th className="text-left p-2.5 text-white/35 font-bold text-[10px] tracking-wider sticky left-0 bg-[#0d0d15] z-10 min-w-[120px]">MANAGER</th>
              <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-20">STATUS</th>
              {episodes.map(ep => (
                <th key={ep} className="text-center p-2 text-white/25 font-bold text-[9px] tracking-wider min-w-[72px]">E{ep}</th>
              ))}
              <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-20">WEEKS SAFE</th>
            </tr>
          </thead>
          <tbody>
            {poolData.map(m => {
              const sc = STATUS_CFG[m.status] || STATUS_CFG.active;
              return (
                <tr key={m.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                  {/* Manager name */}
                  <td className="p-2.5 sticky left-0 bg-[#0d0d15] z-10">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-[13px]">{m.name}</span>
                      {m.hasIdol && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-300 font-bold" title="Has Sole Survivor Immunity Idol">
                          🛡️
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Status */}
                  <td className="p-2.5 text-center">
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded tracking-wider"
                      style={{ background: sc.bg, color: sc.color }}
                    >
                      {sc.label}
                    </span>
                  </td>
                  {/* Episode picks */}
                  {m.picks.map((pick) => {
                    if (pick.type === 'none') {
                      return (
                        <td key={pick.episode} className="p-1.5 text-center">
                          <span className="text-white/[0.06]">—</span>
                        </td>
                      );
                    }

                    if (pick.type === 'safe') {
                      const tColor = pick.survivor ? TRIBE_COLORS[pick.survivor.tribe] : '#fff';
                      return (
                        <td key={pick.episode} className="p-1.5 text-center">
                          <div
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                            style={{ background: 'rgba(26,188,156,0.08)', border: '1px solid rgba(26,188,156,0.15)' }}
                          >
                            <span className="text-[10px] font-semibold" style={{ color: tColor }}>
                              {pick.survivor?.name || '?'}
                            </span>
                            <span className="text-emerald-400 text-[9px]">✓</span>
                          </div>
                        </td>
                      );
                    }

                    if (pick.type === 'drowned') {
                      const tColor = pick.survivor ? TRIBE_COLORS[pick.survivor.tribe] : '#fff';
                      return (
                        <td key={pick.episode} className="p-1.5 text-center">
                          <div
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                            style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.2)' }}
                          >
                            <span className="text-[10px] font-semibold" style={{ color: tColor }}>
                              {pick.survivor?.name || '?'}
                            </span>
                            <span className="text-red-400 text-[9px]">💀</span>
                          </div>
                        </td>
                      );
                    }

                    if (pick.type === 'backdoor') {
                      const tColor = pick.survivor ? TRIBE_COLORS[pick.survivor.tribe] : '#fff';
                      const correct = (pick as any).backdoorCorrect;
                      return (
                        <td key={pick.episode} className="p-1.5 text-center">
                          <div
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                            style={{
                              background: correct ? 'rgba(26,188,156,0.08)' : 'rgba(255,255,255,0.03)',
                              border: correct ? '1px solid rgba(26,188,156,0.2)' : '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            <span className="text-[8px] text-red-400">🚪</span>
                            <span className="text-[10px] font-semibold" style={{ color: tColor }}>
                              {pick.survivor?.name || '?'}
                            </span>
                            {correct && <span className="text-emerald-400 text-[9px]">✓</span>}
                            {correct === false && <span className="text-red-400/50 text-[9px]">✗</span>}
                          </div>
                        </td>
                      );
                    }

                    return <td key={pick.episode} className="p-1.5 text-center">—</td>;
                  })}
                  {/* Weeks Safe */}
                  <td className="p-2.5 text-center">
                    <span className="font-bold text-white">{m.weeksSafe}</span>
                    <span className="text-white/20">/{totalPoolWeeks}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 flex-wrap text-[10px] text-white/25">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> ✓ Safe pick</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 💀 Drowned (pick eliminated)</span>
        <span>🚪 Backdoor attempt</span>
        <span>🛡️ Immunity Idol holder</span>
      </div>

      {/* Pool scoring explanation */}
      <div className="mt-3 bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 text-[11px] text-white/25">
        <span className="font-bold text-white/40">Pool Score Formula:</span>{' '}
        (Weeks Safe / {totalPoolWeeks}) × (25% of Top Fantasy Score)
      </div>

      {/* ================================================================
          Survivor Pick Frequency Heatmap
          ================================================================ */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-white tracking-wider">🔥 Survivor Pick Popularity</h2>
            <p className="text-[10px] text-white/25 mt-0.5">
              How many managers have used each survivor as a pool pick (out of {managers.length} possible)
            </p>
          </div>
          {/* Heatmap legend */}
          <div className="flex items-center gap-1 text-[9px] text-white/25">
            <span>Low</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map(t => (
              <div
                key={t}
                className="w-4 h-4 rounded-sm"
                style={{ background: heatColor(t) }}
              />
            ))}
            <span>High</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {sortedSurvivors.map(s => {
            const count = survivorPickCounts[s.id] || 0;
            const ratio = managers.length > 0 ? count / managers.length : 0;
            const tColor = TRIBE_COLORS[s.tribe] || '#888';
            const heat = heatColor(ratio);

            return (
              <div
                key={s.id}
                className="relative rounded-lg p-3 flex items-center gap-2.5"
                style={{
                  background: count > 0
                    ? `linear-gradient(135deg, ${heat}18, ${heat}08)`
                    : 'rgba(255,255,255,0.02)',
                  border: count > 0
                    ? `1px solid ${heat}35`
                    : '1px solid rgba(255,255,255,0.04)',
                  opacity: s.is_active ? 1 : 0.55,
                }}
              >
                {/* Tribe color dot */}
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: tColor }}
                />

                {/* Name + status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="text-[12px] font-semibold truncate"
                      style={{ color: s.is_active ? '#fff' : 'rgba(255,255,255,0.35)' }}
                    >
                      {s.name}
                    </span>
                    {!s.is_active && (
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 flex-shrink-0">
                        OUT {s.eliminated_episode ? `E${s.eliminated_episode}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] font-bold mt-0.5" style={{ color: tColor }}>
                    {s.tribe.toUpperCase()}
                  </div>
                </div>

                {/* Pick count */}
                <div className="text-right flex-shrink-0">
                  <div
                    className="text-base font-extrabold leading-none"
                    style={{ color: count > 0 ? heat : 'rgba(255,255,255,0.12)' }}
                  >
                    {count}
                  </div>
                  <div className="text-[8px] text-white/20 mt-0.5">/{managers.length}</div>
                </div>

                {/* Heat bar along the bottom */}
                {count > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-lg" style={{ background: heat, opacity: 0.5 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Interpolate from cool blue → green → yellow → orange → red based on 0–1 ratio
function heatColor(ratio: number): string {
  if (ratio <= 0) return '#334155';
  if (ratio < 0.25) {
    // blue → teal
    const t = ratio / 0.25;
    return lerpColor('#3B82F6', '#1ABC9C', t);
  }
  if (ratio < 0.5) {
    // teal → yellow
    const t = (ratio - 0.25) / 0.25;
    return lerpColor('#1ABC9C', '#FFD54F', t);
  }
  if (ratio < 0.75) {
    // yellow → orange
    const t = (ratio - 0.5) / 0.25;
    return lerpColor('#FFD54F', '#FF6B35', t);
  }
  // orange → red
  const t = (ratio - 0.75) / 0.25;
  return lerpColor('#FF6B35', '#E74C3C', t);
}

function lerpColor(a: string, b: string, t: number): string {
  const ah = a.replace('#', '');
  const bh = b.replace('#', '');
  const ar = parseInt(ah.slice(0, 2), 16);
  const ag = parseInt(ah.slice(2, 4), 16);
  const ab = parseInt(ah.slice(4, 6), 16);
  const br = parseInt(bh.slice(0, 2), 16);
  const bg = parseInt(bh.slice(2, 4), 16);
  const bb = parseInt(bh.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * t).toString(16).padStart(2, '0');
  const g = Math.round(ag + (bg - ag) * t).toString(16).padStart(2, '0');
  const bl = Math.round(ab + (bb - ab) * t).toString(16).padStart(2, '0');
  return `#${r}${g}${bl}`;
}
