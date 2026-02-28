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

interface WeeklyPickRow {
  manager_id: string;
  episode: number;
  captain_id: string | null;
  pool_pick_id: string | null;
  pool_backdoor_id: string | null;
  net_pick_id: string | null;
  chip_played: number | null;
  chip_target: string | null;
}

interface PoolStatusRow {
  manager_id: string;
  status: string;
  weeks_survived: number;
}

interface NetAnswerRow {
  episode: number;
  correct_survivor_id: string;
  episode_title: string | null;
}

// ============================================================
// Component
// ============================================================
export default function MyTeamPage() {
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamSurvivor[]>([]);
  const [survivorScores, setSurvivorScores] = useState<SurvivorScoreRow[]>([]);
  const [weeklyPicks, setWeeklyPicks] = useState<WeeklyPickRow[]>([]);
  const [poolStatus, setPoolStatus] = useState<PoolStatusRow | null>(null);
  const [netAnswers, setNetAnswers] = useState<NetAnswerRow[]>([]);
  const [survivors, setSurvivors] = useState<{ id: string; name: string }[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);
  const [activeTab, setActiveTab] = useState<'roster' | 'scoring' | 'chips' | 'pool'>('roster');
  const [expandedSurvivor, setExpandedSurvivor] = useState<string | null>(null);
  const [isCommissioner, setIsCommissioner] = useState(true); // TODO: auth

  // ---- Load initial ----
  useEffect(() => {
    loadInitial();
  }, []);

  async function loadInitial() {
    setLoading(true);
    const [seasonRes, managersRes, survivorsRes, netRes] = await Promise.all([
      supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
      supabase.from('managers').select('id, name, draft_position, is_commissioner').eq('season_id', SEASON_ID).order('draft_position'),
      supabase.from('survivors').select('id, name').eq('season_id', SEASON_ID),
      supabase.from('net_answers').select('episode, correct_survivor_id, episode_title').eq('season_id', SEASON_ID).order('episode'),
    ]);

    setCurrentEpisode(seasonRes.data?.current_episode || 2);
    setManagers(managersRes.data || []);
    setSurvivors(survivorsRes.data || []);
    setNetAnswers(netRes.data || []);

    // Default to commissioner (Ramu) or first manager
    const mgrs = managersRes.data || [];
    const commissioner = mgrs.find((m: Manager) => m.is_commissioner);
    const defaultId = commissioner?.id || mgrs[0]?.id;
    setSelectedManagerId(defaultId);
  }

  // ---- Load manager-specific data ----
  useEffect(() => {
    if (selectedManagerId) {
      loadManagerData(selectedManagerId);
    }
  }, [selectedManagerId]);

  async function loadManagerData(managerId: string) {
    setLoading(true);
    const [teamRes, scoresRes, picksRes, poolRes] = await Promise.all([
      supabase.from('teams').select('survivor_id, acquired_round, acquired_via, survivors(id, name, tribe, is_active, elimination_order, eliminated_episode)').eq('season_id', SEASON_ID).eq('manager_id', managerId).eq('is_active', true),
      supabase.from('survivor_scores').select('survivor_id, episode, final_points').eq('season_id', SEASON_ID),
      supabase.from('weekly_picks').select('*').eq('season_id', SEASON_ID).eq('manager_id', managerId).order('episode'),
      supabase.from('pool_status').select('manager_id, status, weeks_survived').eq('season_id', SEASON_ID).eq('manager_id', managerId).single(),
    ]);

    const teamData = (teamRes.data || []).map((t: any) => ({
      survivor_id: t.survivor_id,
      acquired_round: t.acquired_round,
      acquired_via: t.acquired_via,
      survivor: t.survivors,
    }));
    // Sort by draft round
    teamData.sort((a: TeamSurvivor, b: TeamSurvivor) => a.acquired_round - b.acquired_round);

    setTeam(teamData);
    setSurvivorScores(scoresRes.data || []);
    setWeeklyPicks(picksRes.data || []);
    setPoolStatus(poolRes.data || null);
    setLoading(false);
  }

  // ---- Computed ----
  const selectedManager = managers.find(m => m.id === selectedManagerId);
  const partner = useMemo(() => {
    if (!selectedManager) return null;
    const couple = COUPLES.find(c => c.members.includes(selectedManager.name));
    return couple ? couple.members.find(n => n !== selectedManager.name) : null;
  }, [selectedManager]);

  const episodes = useMemo(() => {
    const eps = [...new Set(survivorScores.map(s => s.episode))].sort((a, b) => a - b);
    return eps;
  }, [survivorScores]);

  const teamWithScores = useMemo(() => {
    return team.map(t => {
      const scores: Record<number, number> = {};
      let total = 0;
      survivorScores.filter(s => s.survivor_id === t.survivor_id).forEach(s => {
        scores[s.episode] = s.final_points;
        total += s.final_points;
      });

      // Captain episodes
      const captainEps = weeklyPicks.filter(p => p.captain_id === t.survivor_id).map(p => p.episode);

      return { ...t, scores, total, captainEps };
    });
  }, [team, survivorScores, weeklyPicks]);

  const teamTotal = teamWithScores.reduce((sum, s) => sum + s.total, 0);
  const activePlayers = teamWithScores.filter(s => s.survivor.is_active).length;

  const currentCaptainPick = weeklyPicks.find(p => p.episode === currentEpisode);
  const currentCaptain = teamWithScores.find(s => s.survivor_id === currentCaptainPick?.captain_id);

  const netTotal = useMemo(() => {
    let count = 0;
    weeklyPicks.forEach(p => {
      if (p.net_pick_id) {
        const answer = netAnswers.find(a => a.episode === p.episode);
        if (answer && answer.correct_survivor_id === p.net_pick_id) count++;
      }
    });
    return count * 3;
  }, [weeklyPicks, netAnswers]);

  // ---- Chip status ----
  const chipStatus = useMemo(() => {
    const usedChips = weeklyPicks.filter(p => p.chip_played).map(p => ({
      chip: p.chip_played!,
      episode: p.episode,
      target: p.chip_target,
    }));

    return (CHIP_DEFS || [
      { id: 1, name: 'Assistant Manager', window: 'W3-4', icon: '🤝' },
      { id: 2, name: 'Team Boost', window: 'W5-6', icon: '⚡' },
      { id: 3, name: 'Super Captain', window: 'W7-8', icon: '👑' },
      { id: 4, name: 'Swap Out', window: 'W9-10', icon: '🔄' },
      { id: 5, name: 'Player Add', window: 'W11-12', icon: '➕' },
    ]).map((chip: any) => {
      const used = usedChips.find(u => u.chip === chip.id);
      const windows: Record<number, [number, number]> = { 1: [3, 4], 2: [5, 6], 3: [7, 8], 4: [9, 10], 5: [11, 12] };
      const [wStart, wEnd] = windows[chip.id] || [0, 0];
      const isAvailable = !used && currentEpisode >= wStart && currentEpisode <= wEnd;
      const isUpcoming = !used && currentEpisode < wStart;
      const isExpired = !used && currentEpisode > wEnd;

      return {
        ...chip,
        status: used ? 'used' : isAvailable ? 'available' : isUpcoming ? 'upcoming' : 'expired',
        usedEpisode: used?.episode,
        usedTarget: used?.target,
      };
    });
  }, [weeklyPicks, currentEpisode]);

  // ---- Pool history ----
  const poolHistory = useMemo(() => {
    return weeklyPicks
      .filter(p => p.pool_pick_id || p.pool_backdoor_id)
      .map(p => {
        const pickName = survivors.find(s => s.id === p.pool_pick_id)?.name;
        const bdName = survivors.find(s => s.id === p.pool_backdoor_id)?.name;
        return {
          episode: p.episode,
          pick: pickName || null,
          backdoor: bdName || null,
        };
      });
  }, [weeklyPicks, survivors]);

  // ---- NET history ----
  const netHistory = useMemo(() => {
    return weeklyPicks
      .filter(p => p.net_pick_id)
      .map(p => {
        const guessName = survivors.find(s => s.id === p.net_pick_id)?.name || '?';
        const answer = netAnswers.find(a => a.episode === p.episode);
        const correctName = answer ? (survivors.find(s => s.id === answer.correct_survivor_id)?.name || '?') : null;
        const correct = answer ? p.net_pick_id === answer.correct_survivor_id : null;
        return {
          episode: p.episode,
          guess: guessName,
          correct,
          answer: correctName,
          title: answer?.episode_title || null,
        };
      });
  }, [weeklyPicks, netAnswers, survivors]);

  // ---- Render ----
  if (loading && !selectedManagerId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4 animate-pulse">🏕️</div>
        <p className="text-white/30 text-sm">Loading team...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Commissioner Manager Selector */}
      {isCommissioner && (
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/[0.06] overflow-x-auto">
          <span className="text-[9px] font-bold text-white/25 tracking-wider flex-shrink-0">VIEW AS:</span>
          {managers.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedManagerId(m.id)}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-md flex-shrink-0 transition-all cursor-pointer border-none"
              style={{
                background: selectedManagerId === m.id ? 'rgba(255,107,53,0.15)' : 'rgba(255,255,255,0.03)',
                color: selectedManagerId === m.id ? '#FF6B35' : 'rgba(255,255,255,0.35)',
                border: selectedManagerId === m.id ? '1px solid rgba(255,107,53,0.3)' : '1px solid transparent',
              }}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="mb-1">
        <h1 className="text-xl font-extrabold text-white">My Team</h1>
        <p className="text-white/30 text-xs mt-1">
          Season 50 · {selectedManager?.name || '...'} {partner ? `· Partner: ${partner}` : ''}
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-4">
        {[
          { label: 'Fantasy Pts', value: teamTotal, color: '#FF6B35' },
          { label: 'Active Players', value: `${activePlayers}/5`, color: '#1ABC9C' },
          { label: 'Captain', value: currentCaptain?.survivor.name?.replace(/"/g, '') || '—', color: '#FFD54F' },
          { label: 'NET Points', value: netTotal, color: '#E67E22' },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
            <div className="text-[10px] font-bold tracking-wider text-white/25 uppercase">{s.label}</div>
            <div className="text-xl font-extrabold mt-1 leading-none" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1 mb-4 w-fit">
        {[
          { k: 'roster' as const, l: 'Roster' },
          { k: 'scoring' as const, l: 'Scoring' },
          { k: 'chips' as const, l: 'Chips' },
          { k: 'pool' as const, l: 'Pool & NET' },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => setActiveTab(t.k)}
            className="px-4 py-2 rounded-md text-[11px] font-semibold tracking-wider uppercase cursor-pointer border-none transition-all"
            style={{
              background: activeTab === t.k ? 'rgba(255,107,53,0.15)' : 'transparent',
              color: activeTab === t.k ? '#FF6B35' : 'rgba(255,255,255,0.35)',
            }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4 animate-pulse">🏕️</div>
          <p className="text-white/30 text-sm">Loading team data...</p>
        </div>
      ) : team.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🏕️</div>
          <p className="text-white/30 text-sm">No team data yet. Team will populate after the draft.</p>
        </div>
      ) : (
        <>
          {/* ======== ROSTER TAB ======== */}
          {activeTab === 'roster' && (
            <div className="flex flex-col gap-2">
              {teamWithScores.map(s => {
                const isExpanded = expandedSurvivor === s.survivor_id;
                const isCaptain = currentCaptainPick?.captain_id === s.survivor_id;
                const tColor = TRIBE_COLORS[s.survivor.tribe] || '#fff';

                return (
                  <div
                    key={s.survivor_id}
                    onClick={() => setExpandedSurvivor(isExpanded ? null : s.survivor_id)}
                    className="rounded-xl p-4 cursor-pointer transition-all"
                    style={{
                      background: isExpanded ? `${tColor}08` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isExpanded ? tColor + '40' : 'rgba(255,255,255,0.05)'}`,
                      opacity: s.survivor.is_active ? 1 : 0.5,
                    }}
                  >
                    <div className="flex items-center gap-3.5">
                      {/* Avatar */}
                      <div className="relative">
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-base font-extrabold text-white"
                          style={{
                            background: `linear-gradient(135deg, ${tColor}44, ${tColor}77)`,
                            border: `2px solid ${tColor}`,
                          }}
                        >
                          {s.survivor.name.startsWith('"') ? 'Q' : s.survivor.name[0]}
                        </div>
                        {isCaptain && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-yellow-300 to-orange-500 flex items-center justify-center border-2 border-[#0a0a0f]">
                            <span className="text-[10px]">👑</span>
                          </div>
                        )}
                        {!s.survivor.is_active && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-red-500 flex items-center justify-center border-2 border-[#0a0a0f]">
                            <span className="text-[7px] text-white font-extrabold">✗</span>
                          </div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[15px] font-bold text-white">{s.survivor.name}</span>
                          {isCaptain && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-300 tracking-wider">CAPTAIN</span>
                          )}
                          {!s.survivor.is_active && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/10 text-red-400">
                              ELIMINATED Ep.{s.survivor.eliminated_episode}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[11px] font-bold tracking-wider" style={{ color: tColor }}>{s.survivor.tribe.toUpperCase()}</span>
                          <span className="text-[11px] text-white/20">
                            {s.acquired_via === 'draft' ? `R${s.acquired_round}` : s.acquired_via}
                          </span>
                        </div>
                      </div>
                      {/* Points */}
                      <div className="text-right">
                        <div className="text-2xl font-extrabold text-white leading-none">{s.total}</div>
                        <div className="text-[9px] text-white/20 mt-0.5">total pts</div>
                      </div>
                    </div>

                    {/* Expanded: Episode bars */}
                    {isExpanded && episodes.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/[0.05]">
                        <div className="text-[10px] font-bold tracking-wider text-white/20 uppercase mb-3">Episode Breakdown</div>
                        <div className="flex gap-1.5 items-end">
                          {episodes.map(ep => {
                            const pts = s.scores[ep];
                            const isCaptEp = s.captainEps.includes(ep);
                            const maxPts = Math.max(...Object.values(s.scores), 1);
                            const barH = pts ? Math.max((pts / maxPts) * 60, 6) : 4;
                            const displayPts = isCaptEp ? (pts || 0) * 2 : (pts || 0);

                            return (
                              <div key={ep} className="flex-1 text-center">
                                <div className="h-[70px] flex items-end justify-center">
                                  <div
                                    className="w-full max-w-[36px] rounded-t"
                                    style={{
                                      height: `${barH}px`,
                                      background: pts
                                        ? isCaptEp
                                          ? 'linear-gradient(180deg, #FFD54F, #FF8F00)'
                                          : `linear-gradient(180deg, ${tColor}88, ${tColor}44)`
                                        : 'rgba(255,255,255,0.03)',
                                    }}
                                  />
                                </div>
                                {pts ? (
                                  <div className={`text-[10px] font-bold mt-1 ${isCaptEp ? 'text-yellow-300' : 'text-white/50'}`}>
                                    {isCaptEp && <span className="text-[7px]">👑</span>}
                                    {displayPts}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-white/10 mt-1">—</div>
                                )}
                                <div className="text-[8px] text-white/15 mt-0.5">E{ep}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ======== SCORING TAB ======== */}
          {activeTab === 'scoring' && episodes.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-white/[0.03]">
                    <th className="text-left p-2.5 text-white/35 font-bold text-[10px] tracking-wider sticky left-0 bg-[#0d0d15] z-10 min-w-[110px]">SURVIVOR</th>
                    {episodes.map(ep => (
                      <th key={ep} className="text-center p-2 text-white/25 font-bold text-[9px] min-w-[44px]">E{ep}</th>
                    ))}
                    <th className="text-center p-2.5 text-white/50 font-extrabold text-[10px] w-16">TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {teamWithScores.map(s => (
                    <tr key={s.survivor_id} className="border-t border-white/[0.03]">
                      <td className="p-2.5 sticky left-0 bg-[#0d0d15] z-10">
                        <span className={`font-semibold ${s.survivor.is_active ? 'text-white/70' : 'text-white/30 line-through'}`}>
                          {s.survivor.name}
                        </span>
                      </td>
                      {episodes.map(ep => {
                        const pts = s.scores[ep];
                        const isCaptEp = s.captainEps.includes(ep);
                        const displayPts = isCaptEp ? (pts || 0) * 2 : (pts || 0);
                        return (
                          <td key={ep} className="p-1.5 text-center">
                            {pts !== undefined ? (
                              <span
                                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${isCaptEp ? 'font-extrabold text-yellow-300 bg-yellow-500/10' : 'text-white/50'}`}
                              >
                                {isCaptEp && <span className="text-[7px] mr-0.5">👑</span>}
                                {displayPts}
                              </span>
                            ) : (
                              <span className="text-white/[0.06]">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2.5 text-center">
                        <span className="font-extrabold text-white">{s.total}</span>
                      </td>
                    </tr>
                  ))}
                  {/* Team total row */}
                  <tr className="border-t border-orange-500/15 bg-orange-500/[0.04]">
                    <td className="p-2.5 sticky left-0 bg-[#0d0d15] z-10">
                      <span className="text-xs font-extrabold text-orange-400 tracking-wider">TEAM TOTAL</span>
                    </td>
                    {episodes.map(ep => {
                      const epTotal = teamWithScores.reduce((sum, s) => {
                        const pts = s.scores[ep] || 0;
                        const isCaptEp = s.captainEps.includes(ep);
                        return sum + (isCaptEp ? pts * 2 : pts);
                      }, 0);
                      return (
                        <td key={ep} className="p-1.5 text-center">
                          <span className="text-[11px] font-bold text-orange-400">{epTotal || '—'}</span>
                        </td>
                      );
                    })}
                    <td className="p-2.5 text-center">
                      <span className="text-[15px] font-extrabold text-orange-400">{teamTotal}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {activeTab === 'scoring' && episodes.length === 0 && (
            <div className="text-center py-12 text-white/25 text-sm">No scores yet.</div>
          )}

          {/* ======== CHIPS TAB ======== */}
          {activeTab === 'chips' && (
            <div className="flex flex-col gap-2">
              {chipStatus.map((chip: any) => {
                const statusColors: Record<string, { bg: string; color: string; label: string }> = {
                  used: { bg: 'rgba(255,255,255,0.04)', color: '#95a5a6', label: 'USED' },
                  available: { bg: 'rgba(26,188,156,0.08)', color: '#1ABC9C', label: 'AVAILABLE' },
                  upcoming: { bg: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.2)', label: 'UPCOMING' },
                  expired: { bg: 'rgba(231,76,60,0.05)', color: '#E74C3C', label: 'EXPIRED' },
                };
                const sc = statusColors[chip.status] || statusColors.upcoming;

                return (
                  <div
                    key={chip.id}
                    className="flex items-center gap-3 rounded-xl p-4"
                    style={{ background: sc.bg, border: `1px solid ${sc.color}22` }}
                  >
                    <span className="text-2xl">{chip.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-white">{chip.name}</span>
                        <span className="text-[10px] font-semibold text-yellow-300">{chip.window}</span>
                      </div>
                      {chip.status === 'used' && (
                        <div className="text-[11px] text-white/30 mt-0.5">
                          Used Episode {chip.usedEpisode} {chip.usedTarget ? `· Target: ${chip.usedTarget}` : ''}
                        </div>
                      )}
                    </div>
                    <span
                      className="text-[9px] font-bold px-2.5 py-1 rounded-full tracking-wider"
                      style={{ background: `${sc.color}15`, color: sc.color }}
                    >
                      {sc.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ======== POOL & NET TAB ======== */}
          {activeTab === 'pool' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pool History */}
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white">🌊 Pool History</h3>
                  {poolStatus && (
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded"
                      style={{
                        background: poolStatus.status === 'active' ? 'rgba(26,188,156,0.1)' : poolStatus.status === 'drowned' ? 'rgba(231,76,60,0.1)' : 'rgba(255,255,255,0.05)',
                        color: poolStatus.status === 'active' ? '#1ABC9C' : poolStatus.status === 'drowned' ? '#E74C3C' : '#95a5a6',
                      }}
                    >
                      {poolStatus.status.toUpperCase()}
                    </span>
                  )}
                </div>
                {poolHistory.length === 0 ? (
                  <p className="text-white/25 text-xs">No pool picks yet.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {poolHistory.map(p => (
                      <div key={p.episode} className="flex items-center gap-2 text-xs">
                        <span className="text-white/20 font-semibold w-8">E{p.episode}</span>
                        {p.pick && (
                          <>
                            <span className="text-white/60">{p.pick}</span>
                            <span className="text-emerald-400 text-[10px]">✓</span>
                          </>
                        )}
                        {p.backdoor && (
                          <>
                            <span className="text-red-400/60">🚪 {p.backdoor}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* NET History */}
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white">💬 NET History</h3>
                  <span className="text-[11px] font-bold text-purple-400">{netTotal} pts</span>
                </div>
                {netHistory.length === 0 ? (
                  <p className="text-white/25 text-xs">No NET picks yet.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {netHistory.map(n => (
                      <div key={n.episode} className="flex items-center gap-2 text-xs">
                        <span className="text-white/20 font-semibold w-8">E{n.episode}</span>
                        <span className={n.correct ? 'text-emerald-400 font-semibold' : 'text-white/40'}>{n.guess}</span>
                        {n.correct === true && <span className="text-emerald-400 text-[10px]">✓ +3</span>}
                        {n.correct === false && (
                          <span className="text-white/20 text-[10px]">✗ (was {n.answer})</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
