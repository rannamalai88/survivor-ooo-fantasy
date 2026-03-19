'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, TRIBE_COLORS, COUPLES } from '@/lib/constants';

// ============================================================
// Types
// ============================================================
interface ManagerTotal {
  manager_id: string;
  fantasy_total: number;
  pool_score: number;
  quinfecta_score: number;
  net_total: number;
  grand_total: number;
  rank: number;
}

interface ManagerInfo {
  id: string;
  name: string;
  draft_position: number;
}

interface ManagerEpScore {
  manager_id: string;
  episode: number;
  fantasy_points: number;
  voted_out_bonus: number;
  net_correct: boolean;
  chip_effect_detail: string | null;
}

interface PoolStatusInfo {
  manager_id: string;
  status: string;
  weeks_survived: number;
}

interface TeamSurvivor {
  manager_id: string;
  survivor_id: string;
  survivor_name: string;
  survivor_tribe: string;
  is_active: boolean;
}

interface CaptainPick {
  manager_id: string;
  episode: number;
  captain_id: string | null;
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

function rankBadge(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}`;
}

function rankHeat(rank: number, total: number): string {
  if (rank <= 1) return 'rgba(255,215,0,0.15)';
  if (rank <= 3) return 'rgba(26,188,156,0.12)';
  if (rank <= Math.ceil(total / 2)) return 'rgba(255,255,255,0.03)';
  if (rank <= total - 2) return 'rgba(255,107,53,0.08)';
  return 'rgba(231,76,60,0.12)';
}

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  active:   { color: '#1ABC9C', bg: 'rgba(26,188,156,0.1)',  label: 'Active'    },
  finished: { color: '#FFD54F', bg: 'rgba(255,215,0,0.1)',   label: 'Finished!' },
  drowned:  { color: '#E74C3C', bg: 'rgba(231,76,60,0.1)',   label: 'Drowned'   },
  burnt:    { color: '#95a5a6', bg: 'rgba(149,165,166,0.1)', label: 'Burnt'     },
};

// ============================================================
// Main Component
// ============================================================
export default function LeaderboardPage() {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'individual' | 'couples'>('individual');
  const [sortKey, setSortKey] = useState<string>('grand_total');
  const [showEpBreakdown, setShowEpBreakdown] = useState(false);

  // Data
  const [managers, setManagers] = useState<ManagerInfo[]>([]);
  const [totals, setTotals] = useState<ManagerTotal[]>([]);
  const [epScores, setEpScores] = useState<ManagerEpScore[]>([]);
  const [poolStatuses, setPoolStatuses] = useState<PoolStatusInfo[]>([]);
  const [teamData, setTeamData] = useState<TeamSurvivor[]>([]);
  const [captainPicks, setCaptainPicks] = useState<CaptainPick[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [seasonRes, managersRes, totalsRes, epScoresRes, poolRes, teamsRes, captainsRes] = await Promise.all([
        supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
        supabase.from('managers').select('id, name, draft_position').eq('season_id', SEASON_ID).order('draft_position'),
        supabase.from('manager_totals').select('*').eq('season_id', SEASON_ID),
        supabase.from('manager_scores').select('*').eq('season_id', SEASON_ID).order('episode'),
        supabase.from('pool_status').select('manager_id, status, weeks_survived').eq('season_id', SEASON_ID),
        supabase.from('teams').select('manager_id, is_active, survivors(id, name, tribe, is_active)').eq('season_id', SEASON_ID).eq('is_active', true),
        // Fetch all captain picks to determine most recent captain + active status
        supabase.from('weekly_picks').select('manager_id, episode, captain_id').eq('season_id', SEASON_ID).not('captain_id', 'is', null).order('episode', { ascending: false }),
      ]);

      setCurrentEpisode(seasonRes.data?.current_episode || 2);
      setManagers(managersRes.data || []);
      setTotals(totalsRes.data || []);
      setEpScores(epScoresRes.data || []);
      setPoolStatuses(poolRes.data || []);

      const teams: TeamSurvivor[] = (teamsRes.data || []).map((t: any) => ({
        manager_id: t.manager_id,
        survivor_id: t.survivors?.id || '',
        survivor_name: t.survivors?.name || '?',
        survivor_tribe: t.survivors?.tribe || 'Vatu',
        is_active: t.survivors?.is_active ?? true,
      }));
      setTeamData(teams);
      setCaptainPicks(captainsRes.data || []);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setLoading(false);
    }
  }

  // ---- Derive captain info per manager ----
  // Most recent weekly pick's captain_id → look up in teamData to get name + active status
  const captainInfo = useMemo(() => {
    const info: Record<string, { name: string; isActive: boolean }> = {};
    // captainPicks is sorted desc by episode, so first match = most recent
    captainPicks.forEach(pick => {
      if (info[pick.manager_id]) return; // already have their most recent
      if (!pick.captain_id) return;
      // Find this survivor in teamData
      const survivor = teamData.find(t => t.manager_id === pick.manager_id && t.survivor_id === pick.captain_id);
      if (survivor) {
        info[pick.manager_id] = { name: survivor.survivor_name, isActive: survivor.is_active };
      } else {
        // Survivor not in active teams (voted out and removed) — captain lost
        info[pick.manager_id] = { name: '—', isActive: false };
      }
    });
    return info;
  }, [captainPicks, teamData]);

  // ---- Enriched manager data ----
  const enriched = useMemo(() => {
    return managers.map((m) => {
      const t = totals.find((t) => t.manager_id === m.id);
      const ps = poolStatuses.find((p) => p.manager_id === m.id);
      const team = teamData.filter((td) => td.manager_id === m.id);
      const activePlayers = team.filter((td) => td.is_active).length;
      const captain = captainInfo[m.id] || { name: '—', isActive: false };

      return {
        ...m,
        fantasy_total: t?.fantasy_total || 0,
        pool_score: t?.pool_score || 0,
        quinfecta_score: t?.quinfecta_score || 0,
        net_total: t?.net_total || 0,
        grand_total: t?.grand_total || 0,
        rank: t?.rank || 0,
        pool_status: ps?.status || 'active',
        active_players: activePlayers,
        total_players: team.length,
        captain_name: captain.name,
        captain_active: captain.isActive,
      };
    });
  }, [managers, totals, poolStatuses, teamData, captainInfo]);

  // ---- Sorted ----
  const sorted = useMemo(() => {
    const arr = [...enriched];
    arr.sort((a, b) => ((b as any)[sortKey] || 0) - ((a as any)[sortKey] || 0));
    arr.forEach((m, i) => { (m as any).displayRank = i + 1; });
    return arr;
  }, [enriched, sortKey]);

  // ---- Min/Max for heat mapping ----
  const stats = useMemo(() => {
    const vals = (key: string) => sorted.map((m) => (m as any)[key] || 0);
    return {
      grand:   { min: Math.min(...vals('grand_total')),   max: Math.max(...vals('grand_total'))   },
      fantasy: { min: Math.min(...vals('fantasy_total')), max: Math.max(...vals('fantasy_total')) },
      pool:    { min: Math.min(...vals('pool_score')),    max: Math.max(...vals('pool_score'))    },
      net:     { min: Math.min(...vals('net_total')),     max: Math.max(...vals('net_total'))     },
    };
  }, [sorted]);

  const episodes = useMemo(() => {
    return Array.from(new Set(epScores.map((s) => s.episode))).sort((a, b) => a - b);
  }, [epScores]);

  // ---- Couples data ----
  const couplesData = useMemo(() => {
    return COUPLES.map((c) => {
      const m1 = enriched.find((m) => m.name === c.members[0]);
      const m2 = enriched.find((m) => m.name === c.members[1]);
      return {
        label: c.label,
        members: c.members,
        m1_total: m1?.grand_total || 0,
        m2_total: m2?.grand_total || 0,
        combined: (m1?.grand_total || 0) + (m2?.grand_total || 0),
        fantasy:  (m1?.fantasy_total || 0) + (m2?.fantasy_total || 0),
        pool:     (m1?.pool_score || 0) + (m2?.pool_score || 0),
        quinfecta:(m1?.quinfecta_score || 0) + (m2?.quinfecta_score || 0),
        net:      (m1?.net_total || 0) + (m2?.net_total || 0),
        rank: 0,
      };
    }).sort((a, b) => b.combined - a.combined).map((c, i) => ({ ...c, rank: i + 1 }));
  }, [enriched]);

  // ---- Render ----
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4 animate-pulse">🏆</div>
        <p className="text-white/30 text-sm">Loading standings...</p>
      </div>
    );
  }

  if (totals.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4">🏆</div>
        <h1 className="text-2xl font-extrabold text-white mb-2">Leaderboard</h1>
        <p className="text-white/30 text-sm">No scores yet. The leaderboard will populate after Episode 2 scores are entered.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-xl font-extrabold text-white tracking-wider">🏆 Leaderboard</h1>
          <p className="text-white/25 text-xs mt-1">Season 50 · Through Episode {currentEpisode - 1}</p>
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {(['individual', 'couples'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className="px-4 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer border-none capitalize"
              style={{ background: view === v ? 'rgba(255,107,53,0.15)' : 'transparent', color: view === v ? '#FF6B35' : 'rgba(255,255,255,0.35)' }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ======== INDIVIDUAL VIEW ======== */}
      {view === 'individual' && (
        <>
          {/* Top 3 Cards */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {sorted.slice(0, 3).map((m, i) => {
              const medals = ['🥇', '🥈', '🥉'];
              const borderColors = ['rgba(255,215,0,0.3)', 'rgba(192,192,192,0.3)', 'rgba(205,127,50,0.3)'];
              return (
                <div key={m.id} className="bg-white/[0.03] rounded-xl p-4 text-center" style={{ border: `1px solid ${borderColors[i]}` }}>
                  <div className="text-3xl mb-1">{medals[i]}</div>
                  <div className="text-base font-extrabold text-white">{m.name}</div>
                  <div className="text-2xl font-extrabold mt-1" style={{ color: i === 0 ? '#FFD54F' : '#fff' }}>{Math.round(m.grand_total)}</div>
                  <div className="text-[10px] text-white/25 mt-1">F:{m.fantasy_total} · P:{Math.round(m.pool_score)} · N:{m.net_total}</div>
                  <div className="mt-2 flex justify-center gap-1">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div key={j} className="w-2 h-2 rounded-full" style={{ background: j < m.active_players ? '#1ABC9C' : 'rgba(255,255,255,0.1)' }} />
                    ))}
                  </div>
                  <div className="text-[9px] text-white/20 mt-0.5">{m.active_players}/5 active</div>
                </div>
              );
            })}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/25 font-bold tracking-wider">SORT BY:</span>
              {[
                { key: 'grand_total',   label: 'Total'   },
                { key: 'fantasy_total', label: 'Fantasy' },
                { key: 'pool_score',    label: 'Pool'    },
                { key: 'net_total',     label: 'NET'     },
              ].map((s) => (
                <button key={s.key} onClick={() => setSortKey(s.key)}
                  className="px-2.5 py-1 text-[10px] font-semibold rounded cursor-pointer border-none transition-all"
                  style={{ background: sortKey === s.key ? 'rgba(255,107,53,0.15)' : 'rgba(255,255,255,0.03)', color: sortKey === s.key ? '#FF6B35' : 'rgba(255,255,255,0.3)' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Table */}
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="text-left p-3 text-white/35 font-bold text-[10px] tracking-wider w-8">#</th>
                  <th className="text-left p-3 text-white/35 font-bold text-[10px] tracking-wider">MANAGER</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider">PLAYERS</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider">CAPTAIN</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider">POOL</th>
                  {/* Fantasy header with expand toggle */}
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider">
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className="cursor-pointer hover:text-white/60 transition-colors"
                        onClick={() => setSortKey('fantasy_total')}
                      >FANTASY</span>
                      <button
                        onClick={() => setShowEpBreakdown(!showEpBreakdown)}
                        className="text-[8px] px-1.5 py-0.5 rounded border-none cursor-pointer transition-all"
                        style={{
                          background: showEpBreakdown ? 'rgba(255,107,53,0.2)' : 'rgba(255,255,255,0.06)',
                          color: showEpBreakdown ? '#FF6B35' : 'rgba(255,255,255,0.3)',
                        }}
                        title={showEpBreakdown ? 'Hide episode breakdown' : 'Show episode breakdown'}
                      >
                        {showEpBreakdown ? '▲' : '▼'} EP
                      </button>
                    </div>
                  </th>
                  {/* Episode sub-columns, only when expanded */}
                  {showEpBreakdown && episodes.map((ep) => (
                    <th key={ep} className="text-center p-2 text-orange-400/50 font-bold text-[9px] tracking-wider min-w-[38px] border-l border-orange-500/10">
                      E{ep}
                    </th>
                  ))}
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider cursor-pointer hover:text-white/60" onClick={() => setSortKey('pool_score')}>POOL PTS</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider">QUIN</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider cursor-pointer hover:text-white/60" onClick={() => setSortKey('net_total')}>NET</th>
                  <th className="text-center p-3 text-white/50 font-extrabold text-[10px] tracking-wider cursor-pointer hover:text-white" onClick={() => setSortKey('grand_total')}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => {
                  const displayRank = (m as any).displayRank;
                  const ps = STATUS_COLORS[m.pool_status] || STATUS_COLORS.active;
                  const managerEpScores = epScores.filter((s) => s.manager_id === m.id);
                  const tribeColor = TRIBE_COLORS as Record<string, string>;

                  return (
                    <tr key={m.id} className="border-t border-white/[0.03] hover:bg-white/[0.02]"
                      style={{ background: rankHeat(displayRank, sorted.length) }}>

                      {/* # */}
                      <td className="p-3 text-center">
                        <span className={displayRank <= 3 ? 'text-base' : 'text-xs text-white/30 font-bold'}>
                          {rankBadge(displayRank)}
                        </span>
                      </td>

                      {/* Manager */}
                      <td className="p-3">
                        <div className="font-bold text-white text-[13px]">{m.name}</div>
                      </td>

                      {/* Players */}
                      <td className="p-3 text-center">
                        <div className="flex justify-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, j) => (
                            <div key={j} className="w-1.5 h-1.5 rounded-full"
                              style={{ background: j < m.active_players ? '#1ABC9C' : 'rgba(255,255,255,0.1)' }} />
                          ))}
                        </div>
                        <div className="text-[8px] text-white/20 mt-0.5">{m.active_players}/5</div>
                      </td>

                      {/* Captain */}
                      <td className="p-3 text-center">
                        <div className="text-[11px] font-semibold" style={{ color: m.captain_active ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                          {m.captain_name}
                        </div>
                        {m.captain_name !== '—' && (
                          <div className="mt-0.5">
                            {m.captain_active ? (
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(26,188,156,0.12)', color: '#1ABC9C' }}>
                                ✓ ACTIVE
                              </span>
                            ) : (
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(231,76,60,0.1)', color: '#E74C3C' }}>
                                💀 LOST
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Pool Status */}
                      <td className="p-3 text-center">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: ps.bg, color: ps.color }}>
                          {ps.label}
                        </span>
                      </td>

                      {/* Fantasy Total */}
                      <td className="p-3 text-center">
                        <span className="font-bold px-2 py-0.5 rounded text-[13px]"
                          style={{ background: heatColor(m.fantasy_total, stats.fantasy.min, stats.fantasy.max) }}>
                          {m.fantasy_total}
                        </span>
                      </td>

                      {/* Episode breakdown sub-columns */}
                      {showEpBreakdown && episodes.map((ep) => {
                        const epScore = managerEpScores.find((s) => s.episode === ep);
                        const pts = epScore?.fantasy_points || 0;
                        const allEpPts = sorted.map((s) => {
                          const es = epScores.find((e) => e.manager_id === s.id && e.episode === ep);
                          return es?.fantasy_points || 0;
                        });
                        return (
                          <td key={ep} className="p-1.5 text-center border-l border-orange-500/10">
                            <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ background: heatColor(pts, Math.min(...allEpPts), Math.max(...allEpPts)), color: pts ? '#fff' : 'rgba(255,255,255,0.2)' }}>
                              {pts || '—'}
                            </span>
                          </td>
                        );
                      })}

                      {/* Pool Score */}
                      <td className="p-3 text-center">
                        <span className="font-semibold px-2 py-0.5 rounded"
                          style={{ background: heatColor(m.pool_score, stats.pool.min, stats.pool.max) }}>
                          {Math.round(m.pool_score)}
                        </span>
                      </td>

                      {/* Quinfecta */}
                      <td className="p-3 text-center text-white/25">{m.quinfecta_score || '—'}</td>

                      {/* NET */}
                      <td className="p-3 text-center">
                        <span className="font-semibold px-2 py-0.5 rounded"
                          style={{ background: heatColor(m.net_total, stats.net.min, stats.net.max) }}>
                          {m.net_total}
                        </span>
                      </td>

                      {/* Grand Total */}
                      <td className="p-3 text-center">
                        <span className="text-[15px] font-extrabold text-white px-2.5 py-1 rounded-md bg-white/[0.05]">
                          {Math.round(m.grand_total)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-4 flex-wrap text-[10px] text-white/20">
            <span>Fantasy includes team pts, captain 2x, voted-out bonus, and chip effects.</span>
            <span>Pool = (weeks survived / total weeks) × 25% of top fantasy score.</span>
            <span>Click column headers to sort.</span>
          </div>
        </>
      )}

      {/* ======== COUPLES VIEW ======== */}
      {view === 'couples' && (
        <>
          {couplesData.length > 0 && (
            <div className="bg-gradient-to-r from-yellow-500/[0.06] to-orange-500/[0.06] border border-yellow-500/20 rounded-xl p-5 text-center mb-5">
              <div className="text-3xl mb-1">💑</div>
              <div className="text-lg font-extrabold text-yellow-300">{couplesData[0].label}</div>
              <div className="text-3xl font-extrabold text-white mt-1">{Math.round(couplesData[0].combined)}</div>
              <div className="text-xs text-white/30 mt-1">
                {couplesData[0].members[0]}: {Math.round(couplesData[0].m1_total)} · {couplesData[0].members[1]}: {Math.round(couplesData[0].m2_total)}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="text-left p-3 text-white/35 font-bold text-[10px] tracking-wider w-8">#</th>
                  <th className="text-left p-3 text-white/35 font-bold text-[10px] tracking-wider">COUPLE</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider">FANTASY</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider">POOL</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider">QUIN</th>
                  <th className="text-center p-3 text-white/35 font-bold text-[10px] tracking-wider">NET</th>
                  <th className="text-center p-3 text-white/50 font-extrabold text-[10px] tracking-wider">COMBINED</th>
                </tr>
              </thead>
              <tbody>
                {couplesData.map((c) => {
                  const medals = ['🥇', '🥈', '🥉'];
                  const combMin = Math.min(...couplesData.map((x) => x.combined));
                  const combMax = Math.max(...couplesData.map((x) => x.combined));
                  return (
                    <tr key={c.label} className="border-t border-white/[0.03] hover:bg-white/[0.02]"
                      style={{ background: rankHeat(c.rank, couplesData.length) }}>
                      <td className="p-3 text-center">
                        <span className={c.rank <= 3 ? 'text-base' : 'text-xs text-white/30 font-bold'}>
                          {c.rank <= 3 ? medals[c.rank - 1] : c.rank}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-white text-[13px]">{c.label}</div>
                        <div className="text-[10px] text-white/25 mt-0.5">
                          {c.members[0]}: {Math.round(c.m1_total)} · {c.members[1]}: {Math.round(c.m2_total)}
                        </div>
                      </td>
                      <td className="p-3 text-center font-semibold">{c.fantasy}</td>
                      <td className="p-3 text-center font-semibold">{Math.round(c.pool)}</td>
                      <td className="p-3 text-center text-white/25">{c.quinfecta || '—'}</td>
                      <td className="p-3 text-center font-semibold">{c.net}</td>
                      <td className="p-3 text-center">
                        <span className="text-[15px] font-extrabold text-white px-2.5 py-1 rounded-md"
                          style={{ background: heatColor(c.combined, combMin, combMax) }}>
                          {Math.round(c.combined)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[10px] text-white/20">
            Combined = sum of both partners&apos; individual totals. Winning couple earns 10% of the $240 pot ($24).
          </div>
        </>
      )}
    </div>
  );
}
