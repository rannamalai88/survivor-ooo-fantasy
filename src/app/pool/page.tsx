'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, TRIBE_COLORS } from '@/lib/constants';

interface Manager { id: string; name: string; draft_position: number; }
interface PoolStatusRow { manager_id: string; status: string; weeks_survived: number; has_immunity_idol: boolean; drowned_episode: number | null; }
interface WeeklyPickRow { manager_id: string; episode: number; pool_pick_id: string | null; pool_backdoor_id: string | null; }
interface ManagerTotalRow { manager_id: string; pool_score: number; }
interface SurvivorInfo { id: string; name: string; tribe: string; is_active: boolean; eliminated_episode: number | null; }

function isPicksLocked(): boolean {
  const now = new Date();
  const ctNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const day = ctNow.getUTCDay(), hour = ctNow.getUTCHours(), min = ctNow.getUTCMinutes();
  if (day > 3) return true;
  if (day === 3 && (hour > 19 || (hour === 19 && min >= 0))) return true;
  return false;
}

export default function PoolBoardPage() {
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [poolStatuses, setPoolStatuses] = useState<PoolStatusRow[]>([]);
  const [weeklyPicks, setWeeklyPicks] = useState<WeeklyPickRow[]>([]);
  const [survivors, setSurvivors] = useState<SurvivorInfo[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);
  const [totalEpisodes, setTotalEpisodes] = useState(13);
  const [picksLocked, setPicksLocked] = useState(false);
  const [managerTotals, setManagerTotals] = useState<ManagerTotalRow[]>([]);

  useEffect(() => {
    loadData();
    setPicksLocked(isPicksLocked());
    const iv = setInterval(() => setPicksLocked(isPicksLocked()), 60_000);
    return () => clearInterval(iv);
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [seasonRes, managersRes, poolRes, picksRes, survivorsRes, totalsRes] = await Promise.all([
        supabase.from('seasons').select('current_episode, total_episodes').eq('id', SEASON_ID).single(),
        supabase.from('managers').select('id, name, draft_position').eq('season_id', SEASON_ID).order('draft_position'),
        supabase.from('pool_status').select('*').eq('season_id', SEASON_ID),
        supabase.from('weekly_picks').select('manager_id, episode, pool_pick_id, pool_backdoor_id').eq('season_id', SEASON_ID).order('episode'),
        supabase.from('survivors').select('id, name, tribe, is_active, eliminated_episode').eq('season_id', SEASON_ID),
        supabase.from('manager_totals').select('manager_id, pool_score').eq('season_id', SEASON_ID),
      ]);
      setCurrentEpisode(seasonRes.data?.current_episode || 2);
      setTotalEpisodes(seasonRes.data?.total_episodes || 13);
      setManagers(managersRes.data || []);
      setPoolStatuses(poolRes.data || []);
      setWeeklyPicks(picksRes.data || []);
      setSurvivors(survivorsRes.data || []);
      setManagerTotals(totalsRes.data || []);
    } catch (err) {
      console.error('Failed to load pool data:', err);
    } finally {
      setLoading(false);
    }
  }

  const survivorMap = useMemo(() => {
    const map = new Map<string, SurvivorInfo>();
    survivors.forEach(s => map.set(s.id, s));
    return map;
  }, [survivors]);

  // FIX: Map episode → ALL eliminated survivor IDs (array, not single value).
  // Previously Map<number, string> with .set() overwrote the first elimination
  // in double-elimination episodes, making correct backdoor picks appear wrong.
  const eliminatedByEp = useMemo(() => {
    const map = new Map<number, string[]>();
    survivors.filter(s => s.eliminated_episode !== null).forEach(s => {
      const ep = s.eliminated_episode!;
      if (!map.has(ep)) map.set(ep, []);
      map.get(ep)!.push(s.id);
    });
    return map;
  }, [survivors]);

  const episodes = useMemo(() => {
    const allEps = [...new Set(weeklyPicks.map(p => p.episode))].sort((a, b) => a - b);
    const base = allEps.length > 0 ? allEps : [2];
    return base.filter(ep => ep !== 1 && !(ep === currentEpisode && !picksLocked));
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
          return { episode: ep, type: wasEliminated ? 'drowned' as const : 'safe' as const, survivor };
        }

        if (pick.pool_backdoor_id) {
          const survivor = survivorMap.get(pick.pool_backdoor_id);
          // FIX: check against ALL eliminations for this episode (handles double eliminations)
          const eliminatedIds = eliminatedByEp.get(ep) || [];
          const correct = eliminatedIds.includes(pick.pool_backdoor_id);
          return { episode: ep, type: 'backdoor' as const, survivor, backdoorCorrect: correct };
        }

        return { episode: ep, type: 'none' as const, survivor: null };
      });

      return {
        ...m,
        status: ps?.status || 'active',
        weeksSafe: epPicks.filter(p => p.type === 'safe').length,
        hasIdol: ps?.has_immunity_idol || false,
        drownedEp: ps?.drowned_episode || null,
        picks: epPicks,
      };
    });
  }, [managers, poolStatuses, weeklyPicks, episodes, survivorMap, eliminatedByEp]);

  const statusCounts = useMemo(() => {
    const counts = { active: 0, drowned: 0, burnt: 0, finished: 0 };
    poolData.forEach(m => { const s = m.status as keyof typeof counts; if (counts[s] !== undefined) counts[s]++; });
    return counts;
  }, [poolData]);

  const survivorPickCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    weeklyPicks.filter(p => p.episode < currentEpisode).forEach(p => {
      if (p.pool_pick_id) counts[p.pool_pick_id] = (counts[p.pool_pick_id] || 0) + 1;
    });
    return counts;
  }, [weeklyPicks, currentEpisode]);

  const sortedSurvivors = useMemo(() =>
    [...survivors].sort((a, b) => {
      const diff = (survivorPickCounts[b.id] || 0) - (survivorPickCounts[a.id] || 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    }),
  [survivors, survivorPickCounts]);

  if (loading) return (
    <div className="max-w-5xl mx-auto px-4 py-12 text-center">
      <div className="text-4xl mb-4 animate-pulse">🌊</div>
      <p className="text-white/30 text-sm">Loading pool board...</p>
    </div>
  );

  const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
    active:   { color: '#1ABC9C', bg: 'rgba(26,188,156,0.1)',  label: 'Active'    },
    finished: { color: '#FFD54F', bg: 'rgba(255,215,0,0.1)',   label: 'Finished!' },
    drowned:  { color: '#E74C3C', bg: 'rgba(231,76,60,0.1)',   label: 'Drowned'   },
    burnt:    { color: '#95a5a6', bg: 'rgba(149,165,166,0.1)', label: 'Burnt'     },
  };

  const totalPoolWeeks = totalEpisodes - 1;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
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

      <div className="grid grid-cols-4 gap-2 mb-5">
        {Object.entries(STATUS_CFG).map(([key, cfg]) => (
          <div key={key} className="text-center rounded-lg p-3" style={{ background: cfg.bg, border: `1px solid ${cfg.color}22` }}>
            <div className="text-2xl font-extrabold" style={{ color: cfg.color }}>{(statusCounts as any)[key] || 0}</div>
            <div className="text-[10px] font-bold tracking-wider text-white/25 uppercase mt-0.5">{cfg.label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-white/[0.03]">
              <th className="text-left p-2.5 text-white/35 font-bold text-[10px] tracking-wider sticky left-0 bg-[#0d0d15] z-10 min-w-[120px]">MANAGER</th>
              <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-20">STATUS</th>
              {episodes.map(ep => {
                // Show ALL eliminated survivors for this episode
                const eliminatedNames = (eliminatedByEp.get(ep) || [])
                  .map(id => survivorMap.get(id)?.name)
                  .filter(Boolean) as string[];
                return (
                  <th key={ep} className="text-center p-2 text-white/25 font-bold text-[9px] tracking-wider min-w-[80px]">
                    <div>E{ep}</div>
                    {eliminatedNames.map(name => (
                      <div key={name} className="text-[8px] font-semibold text-red-400/60 mt-0.5">✗ {name}</div>
                    ))}
                  </th>
                );
              })}
              <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-20">WEEKS SAFE</th>
              <th className="text-center p-2.5 text-white/35 font-bold text-[10px] tracking-wider w-20">POOL PTS</th>
            </tr>
          </thead>
          <tbody>
            {poolData.map(m => {
              const sc = STATUS_CFG[m.status] || STATUS_CFG.active;
              return (
                <tr key={m.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="p-2.5 sticky left-0 bg-[#0d0d15] z-10">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-[13px]">{m.name}</span>
                      {m.hasIdol && <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-300 font-bold" title="Has Sole Survivor Immunity Idol">🛡️</span>}
                    </div>
                  </td>
                  <td className="p-2.5 text-center">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded tracking-wider" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                  </td>
                  {m.picks.map(pick => {
                    if (pick.type === 'none') return <td key={pick.episode} className="p-1.5 text-center"><span className="text-white/[0.06]">—</span></td>;

                    if (pick.type === 'safe') {
                      const tColor = pick.survivor ? TRIBE_COLORS[pick.survivor.tribe] : '#fff';
                      const laterElim = pick.survivor && !pick.survivor.is_active && pick.survivor.eliminated_episode !== pick.episode;
                      return (
                        <td key={pick.episode} className="p-1.5 text-center">
                          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                            style={{ background: 'rgba(26,188,156,0.08)', border: '1px solid rgba(26,188,156,0.15)' }}
                            title={laterElim ? `${pick.survivor?.name} later eliminated E${pick.survivor?.eliminated_episode}` : undefined}>
                            <span className="text-[10px] font-semibold"
                              style={{ color: laterElim ? 'rgba(255,255,255,0.3)' : tColor, textDecoration: laterElim ? 'line-through' : 'none' }}>
                              {pick.survivor?.name || '?'}
                            </span>
                            <span className="text-emerald-400 text-[9px]">✓</span>
                            {laterElim && <span className="text-[8px] text-red-400/60">💀</span>}
                          </div>
                        </td>
                      );
                    }

                    if (pick.type === 'drowned') {
                      const tColor = pick.survivor ? TRIBE_COLORS[pick.survivor.tribe] : '#fff';
                      return (
                        <td key={pick.episode} className="p-1.5 text-center">
                          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                            style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.2)' }}>
                            <span className="text-[10px] font-semibold" style={{ color: tColor }}>{pick.survivor?.name || '?'}</span>
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
                          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                            style={{
                              background: correct ? 'rgba(26,188,156,0.1)' : 'rgba(255,255,255,0.03)',
                              border: correct ? '1px solid rgba(26,188,156,0.25)' : '1px solid rgba(255,255,255,0.06)',
                            }}>
                            <span className="text-[8px]">{correct ? '↩' : '🚪'}</span>
                            <span className="text-[10px] font-semibold" style={{ color: correct ? '#1ABC9C' : tColor }}>
                              {pick.survivor?.name || '?'}
                            </span>
                            {correct
                              ? <span className="text-emerald-400 text-[9px] font-bold">✓</span>
                              : <span className="text-red-400/50 text-[9px]">✗</span>}
                          </div>
                        </td>
                      );
                    }

                    return <td key={pick.episode} className="p-1.5 text-center">—</td>;
                  })}
                  <td className="p-2.5 text-center">
                    <span className="font-bold text-white">{m.weeksSafe}</span>
                    <span className="text-white/20">/{totalPoolWeeks}</span>
                  </td>
                  <td className="p-2.5 text-center">
                    {(() => {
                      const t = managerTotals.find(t => t.manager_id === m.id);
                      const pts = t ? Math.round(t.pool_score) : 0;
                      return pts > 0 ? <span className="text-[13px] font-bold text-emerald-400">{pts}</span> : <span className="text-white/20">—</span>;
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 flex-wrap text-[10px] text-white/25">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(26,188,156,0.08)', border: '1px solid rgba(26,188,156,0.15)' }}>
            <span style={{ color: '#1ABC9C' }}>Name</span><span className="text-emerald-400">✓</span>
          </span>
          Safe pick
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(26,188,156,0.08)', border: '1px solid rgba(26,188,156,0.15)' }}>
            <span className="text-white/30 line-through">Name</span><span className="text-emerald-400">✓</span><span>💀</span>
          </span>
          Safe pick (survivor later eliminated)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.2)' }}>
            <span>Name</span><span className="text-red-400">💀</span>
          </span>
          Drowned (pick eliminated)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(26,188,156,0.1)', border: '1px solid rgba(26,188,156,0.25)' }}>
            <span>↩</span><span style={{ color: '#1ABC9C' }}>Name</span><span className="text-emerald-400 font-bold">✓</span>
          </span>
          Correct backdoor (reactivated)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span>🚪</span><span className="text-white/30">Name</span><span className="text-red-400/50">✗</span>
          </span>
          Wrong backdoor
        </span>
        <span>🛡️ Immunity Idol holder</span>
      </div>

      <div className="mt-3 bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 text-[11px] text-white/25">
        <span className="font-bold text-white/40">Pool Score Formula:</span>{' '}
        (Weeks Safe / {totalPoolWeeks}) × (25% of Top Fantasy Score)
      </div>

      {/* Survivor Pick Popularity Heatmap */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-white tracking-wider">🔥 Survivor Pick Popularity</h2>
            <p className="text-[10px] text-white/25 mt-0.5">How many managers have used each survivor as a pool pick (out of {managers.length} possible)</p>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-white/25">
            <span>Low</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map(t => <div key={t} className="w-4 h-4 rounded-sm" style={{ background: heatColor(t) }} />)}
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
              <div key={s.id} className="relative rounded-lg p-3 flex items-center gap-2.5"
                style={{ background: count > 0 ? `linear-gradient(135deg, ${heat}18, ${heat}08)` : 'rgba(255,255,255,0.02)', border: count > 0 ? `1px solid ${heat}35` : '1px solid rgba(255,255,255,0.04)', opacity: s.is_active ? 1 : 0.55 }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tColor }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12px] font-semibold truncate" style={{ color: s.is_active ? '#fff' : 'rgba(255,255,255,0.35)' }}>{s.name}</span>
                    {!s.is_active && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 flex-shrink-0">OUT {s.eliminated_episode ? `E${s.eliminated_episode}` : ''}</span>}
                  </div>
                  <div className="text-[9px] font-bold mt-0.5" style={{ color: tColor }}>{s.tribe.toUpperCase()}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-base font-extrabold leading-none" style={{ color: count > 0 ? heat : 'rgba(255,255,255,0.12)' }}>{count}</div>
                  <div className="text-[8px] text-white/20 mt-0.5">/{managers.length}</div>
                </div>
                {count > 0 && <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-lg" style={{ background: heat, opacity: 0.5 }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function heatColor(ratio: number): string {
  if (ratio <= 0) return '#334155';
  if (ratio < 0.25) return lerpColor('#3B82F6', '#1ABC9C', ratio / 0.25);
  if (ratio < 0.5)  return lerpColor('#1ABC9C', '#FFD54F', (ratio - 0.25) / 0.25);
  if (ratio < 0.75) return lerpColor('#FFD54F', '#FF6B35', (ratio - 0.5) / 0.25);
  return lerpColor('#FF6B35', '#E74C3C', (ratio - 0.75) / 0.25);
}

function lerpColor(a: string, b: string, t: number): string {
  const ah = a.replace('#', ''), bh = b.replace('#', '');
  const ar = parseInt(ah.slice(0,2),16), ag = parseInt(ah.slice(2,4),16), ab = parseInt(ah.slice(4,6),16);
  const br = parseInt(bh.slice(0,2),16), bg = parseInt(bh.slice(2,4),16), bb = parseInt(bh.slice(4,6),16);
  return `#${Math.round(ar+(br-ar)*t).toString(16).padStart(2,'0')}${Math.round(ag+(bg-ag)*t).toString(16).padStart(2,'0')}${Math.round(ab+(bb-ab)*t).toString(16).padStart(2,'0')}`;
}
