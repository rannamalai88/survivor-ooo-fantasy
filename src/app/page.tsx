'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, TRIBE_COLORS, COUPLES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

// ============================================================
// Types
// ============================================================
interface Manager {
  id: string;
  name: string;
  is_commissioner: boolean;
}

interface ManagerTotalRow {
  manager_id: string;
  fantasy_total: number;
  pool_score: number;
  quinfecta_score: number;
  net_total: number;
  grand_total: number;
  rank: number;
}

interface ManagerScoreRow {
  manager_id: string;
  episode: number;
  fantasy_points: number;
}

interface SurvivorScoreRow {
  survivor_id: string;
  episode: number;
  final_points: number;
}

interface ActivityRow {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

// ============================================================
// Constants
// ============================================================
const MANAGER_COLORS: Record<string, string> = {
  Alan: '#4FC3F7', Hari: '#81C784', Veena: '#BA68C8', Ramu: '#FF8A65',
  Stephanie: '#FFD54F', Alli: '#F06292', Amy: '#90A4AE', Alec: '#AED581',
  Cassie: '#4DD0E1', Michael: '#DCE775', Gisele: '#FFB74D', Samin: '#A1887F',
};

const ACTIVITY_ICONS: Record<string, string> = {
  score: '📊', pool: '🌊', chip: '🎰', draft: '📋', pick: '✅',
  trade: '🔄', net: '💬', quinfecta: '🏝️', default: '🔥',
};

// ============================================================
// Component
// ============================================================
export default function HomePage() {
  const { manager: authManager, isLoading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [totals, setTotals] = useState<ManagerTotalRow[]>([]);
  const [managerScores, setManagerScores] = useState<ManagerScoreRow[]>([]);
  const [survivorScores, setSurvivorScores] = useState<SurvivorScoreRow[]>([]);
  const [myTeam, setMyTeam] = useState<{
    survivorId: string; name: string; tribe: string;
    is_active: boolean; isCaptain: boolean; totalPts: number;
  }[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);
  const [hoveredManager, setHoveredManager] = useState<string | null>(null);

  const myManagerId = authManager?.id ?? null;
  const myManagerName = authManager?.name ?? null;

  // Re-load whenever auth resolves or the logged-in user changes
  useEffect(() => {
    if (!authLoading) loadData(myManagerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, myManagerId]);

  async function loadData(managerId: string | null) {
    try {
      setLoading(true);

      const [seasonRes, managersRes, totalsRes, mScoresRes, sScoresRes, activityRes] = await Promise.all([
        supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
        supabase.from('managers').select('id, name, is_commissioner').eq('season_id', SEASON_ID).order('draft_position'),
        supabase.from('manager_totals').select('*').eq('season_id', SEASON_ID),
        supabase.from('manager_scores').select('manager_id, episode, fantasy_points').eq('season_id', SEASON_ID).order('episode'),
        supabase.from('survivor_scores').select('survivor_id, episode, final_points').eq('season_id', SEASON_ID),
        supabase.from('activity_log').select('id, type, message, created_at').eq('season_id', SEASON_ID).order('created_at', { ascending: false }).limit(8),
      ]);

      const ep = seasonRes.data?.current_episode || 2;
      setCurrentEpisode(ep);
      setManagers(managersRes.data || []);
      setTotals(totalsRes.data || []);
      setManagerScores(mScoresRes.data || []);
      setSurvivorScores(sScoresRes.data || []);
      setActivities(activityRes.data || []);

      // Only load "My Team" if someone is actually logged in
      if (managerId) {
        const [teamRes, pickRes] = await Promise.all([
          supabase
            .from('teams')
            .select('survivor_id, survivors(name, tribe, is_active)')
            .eq('season_id', SEASON_ID)
            .eq('manager_id', managerId)
            .eq('is_active', true),
          supabase
            .from('weekly_picks')
            .select('captain_id')
            .eq('season_id', SEASON_ID)
            .eq('manager_id', managerId)
            .eq('episode', ep)
            .maybeSingle(),
        ]);

        const captainId = pickRes.data?.captain_id ?? null;
        const sScores: SurvivorScoreRow[] = sScoresRes.data || [];

        const team = (teamRes.data || []).map((t: any) => {
          const sid: string = t.survivor_id;
          const totalPts = sScores
            .filter(ss => ss.survivor_id === sid)
            .reduce((sum, ss) => sum + ss.final_points, 0);
          return {
            survivorId: sid,
            name: t.survivors?.name || '?',
            tribe: t.survivors?.tribe || 'Vatu',
            is_active: t.survivors?.is_active ?? true,
            isCaptain: sid === captainId,
            totalPts,
          };
        });
        // Sort by points descending
        team.sort((a: typeof team[0], b: typeof team[0]) => b.totalPts - a.totalPts);
        setMyTeam(team);
      } else {
        setMyTeam([]);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  // ---- Computed: category ranks ----
  const categoryRanks = useMemo(() => {
    if (!myManagerId) return { fantasy: 0, pool: 0, net: 0, quinfecta: 0, total: 0 };
    const rank = (sorted: { manager_id: string }[]) =>
      sorted.findIndex(t => t.manager_id === myManagerId) + 1 || 0;
    return {
      fantasy:    rank([...totals].sort((a, b) => b.fantasy_total - a.fantasy_total)),
      pool:       rank([...totals].sort((a, b) => b.pool_score - a.pool_score)),
      net:        rank([...totals].sort((a, b) => b.net_total - a.net_total)),
      quinfecta:  rank([...totals].sort((a, b) => b.quinfecta_score - a.quinfecta_score)),
      total:      rank([...totals].sort((a, b) => b.grand_total - a.grand_total)),
    };
  }, [totals, myManagerId]);

  const standings = useMemo(() => {
    return [...totals]
      .sort((a, b) => b.grand_total - a.grand_total)
      .map((t, i) => ({
        ...t,
        name: managers.find(m => m.id === t.manager_id)?.name || '?',
        rank: i + 1,
      }));
  }, [totals, managers]);

  const coupleStandings = useMemo(() => {
    return COUPLES.map(c => {
      const m1 = totals.find(t => managers.find(m => m.id === t.manager_id)?.name === c.members[0]);
      const m2 = totals.find(t => managers.find(m => m.id === t.manager_id)?.name === c.members[1]);
      return {
        label: c.label,
        total: (m1?.grand_total || 0) + (m2?.grand_total || 0),
        isMe: myManagerName ? c.members.includes(myManagerName) : false,
      };
    }).sort((a, b) => b.total - a.total);
  }, [totals, managers, myManagerName]);

  // Chart data: cumulative fantasy points per episode per manager
  const chartEpisodes = useMemo(() =>
    [...new Set(managerScores.map(s => s.episode))].sort((a, b) => a - b),
    [managerScores]
  );

  const chartLines = useMemo(() => {
    return managers.map(m => {
      let cumulative = 0;
      const points = chartEpisodes.map(ep => {
        const row = managerScores.find(s => s.manager_id === m.id && s.episode === ep);
        cumulative += row?.fantasy_points || 0;
        return { ep, value: cumulative };
      });
      return { ...m, points };
    });
  }, [managers, managerScores, chartEpisodes]);

  function timeAgo(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return days < 7 ? `${days}d ago` : `${Math.floor(days / 7)}w ago`;
  }

  // ---- Loading state ----
  if (authLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4 animate-pulse">🔥</div>
        <p className="text-white/30 text-sm">Loading dashboard...</p>
      </div>
    );
  }

  // ---- Chart geometry ----
  const CW = 560, CH = 220;
  const PL = 35, PR = 20, PT = 12, PB = 24;
  const plotW = CW - PL - PR;
  const plotH = CH - PT - PB;

  const allVals = chartLines.flatMap(l => l.points.map(p => p.value));
  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 40;
  const getX = (i: number) =>
    PL + (chartEpisodes.length > 1 ? (i / (chartEpisodes.length - 1)) * plotW : plotW / 2);
  const getY = (v: number) => PT + plotH - (v / (maxVal || 1)) * plotH;

  const myTotals = totals.find(t => t.manager_id === myManagerId);
  const statItems = myTotals ? [
    { label: 'FANTASY',   value: myTotals.fantasy_total,                       rank: categoryRanks.fantasy,   color: '#FFD54F' },
    { label: 'POOL',      value: +(myTotals.pool_score.toFixed(1)),             rank: categoryRanks.pool,      color: '#4FC3F7' },
    { label: 'NET',       value: myTotals.net_total,                            rank: categoryRanks.net,       color: '#81C784' },
    { label: 'QUIN',      value: myTotals.quinfecta_score,                      rank: categoryRanks.quinfecta, color: '#BA68C8' },
    { label: 'TOTAL',     value: Math.round(myTotals.grand_total),              rank: categoryRanks.total,     color: '#FF6B35' },
  ] : [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">

      {/* ── Hero Banner ─────────────────────────────── */}
      <div className="bg-gradient-to-r from-orange-600/10 via-red-600/5 to-yellow-600/10 border border-orange-500/15 rounded-2xl p-6 mb-5 text-center">
        <div className="text-3xl mb-2">🔥</div>
        <h1 className="text-2xl font-extrabold text-white tracking-wider">SURVIVOR OOO FANTASY</h1>
        <p className="text-white/30 text-sm mt-1">Season 50 · Episode {currentEpisode}</p>

        {authManager && myTotals ? (
          <div className="mt-5">
            {/* Score row */}
            <div className="flex justify-center gap-5 flex-wrap">
              {statItems.map(s => (
                <div key={s.label} className="flex flex-col items-center">
                  <div className="text-[22px] font-extrabold leading-none" style={{ color: s.color }}>
                    {s.value}
                  </div>
                  <div className="text-[9px] text-white/25 tracking-widest mt-1">{s.label}</div>
                  <div
                    className="text-[10px] font-bold mt-0.5"
                    style={{ color: s.rank <= 3 ? '#1ABC9C' : s.rank <= 6 ? 'rgba(255,255,255,0.4)' : '#E74C3C' }}
                  >
                    #{s.rank}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-white/20 text-xs mt-3 italic">Log in to see your personal stats</p>
        )}
      </div>

      {/* ── My Team (horizontal) ─────────────────────── */}
      {authManager && myTeam.length > 0 && (
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">🏕️ My Team</h2>
            <Link href="/my-team" className="text-[10px] font-semibold text-orange-400 hover:text-orange-300">
              View Full →
            </Link>
          </div>
          <div className="flex gap-2 flex-wrap">
            {myTeam.map(s => {
              const tColor = TRIBE_COLORS[s.tribe] || '#fff';
              return (
                <div
                  key={s.survivorId}
                  className="flex flex-col items-center gap-1.5 px-3 pt-3 pb-2.5 rounded-xl"
                  style={{
                    background: s.isCaptain ? 'rgba(255,215,0,0.07)' : 'rgba(255,255,255,0.03)',
                    border: s.isCaptain ? '1px solid rgba(255,215,0,0.22)' : `1px solid ${tColor}22`,
                    opacity: s.is_active ? 1 : 0.4,
                    minWidth: '72px',
                  }}
                >
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-extrabold text-white flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${tColor}44, ${tColor}77)`,
                      border: `1.5px solid ${tColor}`,
                    }}
                  >
                    {s.name.startsWith('"') ? 'Q' : s.name[0]}
                  </div>
                  {/* Name */}
                  <div className="text-center leading-tight">
                    <div
                      className="text-[11px] font-semibold"
                      style={{ color: s.is_active ? '#e8e8e8' : 'rgba(255,255,255,0.3)', textDecoration: s.is_active ? 'none' : 'line-through' }}
                    >
                      {s.name}
                      {s.isCaptain && <span className="ml-0.5">👑</span>}
                    </div>
                    <div className="text-[8px] font-bold tracking-wider" style={{ color: tColor }}>
                      {s.tribe.toUpperCase()}
                    </div>
                  </div>
                  {/* Points */}
                  <div className="text-[15px] font-extrabold text-white leading-none">{s.totalPts}</div>
                  <div className="text-[8px] text-white/20 -mt-1">pts</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Standings Line Chart ──────────────────────── */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white">🏆 Standings</h2>
          <Link href="/leaderboard" className="text-[10px] font-semibold text-orange-400 hover:text-orange-300">
            Full Leaderboard →
          </Link>
        </div>

        {chartEpisodes.length === 0 ? (
          <p className="text-white/25 text-xs">Standings will appear after scores are entered.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`} className="block mx-auto">
                {/* Y gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                  const y = PT + plotH - pct * plotH;
                  const val = Math.round(pct * maxVal);
                  return (
                    <g key={pct}>
                      <line x1={PL} y1={y} x2={CW - PR} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                      <text x={PL - 6} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.18)" fontSize={8}>{val}</text>
                    </g>
                  );
                })}

                {/* X labels */}
                {chartEpisodes.map((ep, i) => (
                  <text key={ep} x={getX(i)} y={CH - 6} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={9} fontWeight={700}>
                    E{ep}
                  </text>
                ))}

                {/* One line per manager */}
                {chartLines.map(m => {
                  const color = MANAGER_COLORS[m.name] || '#888';
                  const isMe = m.id === myManagerId;
                  const isHov = hoveredManager === m.name;
                  const opacity = hoveredManager
                    ? (isHov ? 1 : 0.1)
                    : isMe ? 1 : 0.45;
                  const sw = isMe || isHov ? 2.5 : 1.5;
                  if (m.points.length === 0) return null;
                  const pathD = m.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.value)}`).join(' ');

                  return (
                    <g
                      key={m.id}
                      onMouseEnter={() => setHoveredManager(m.name)}
                      onMouseLeave={() => setHoveredManager(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      {m.points.length > 1 && (
                        <path d={pathD} fill="none" stroke={color} strokeWidth={sw} opacity={opacity}
                          strokeLinejoin="round" strokeLinecap="round" />
                      )}
                      {m.points.map((p, i) => (
                        <circle key={i} cx={getX(i)} cy={getY(p.value)}
                          r={isMe || isHov ? 4.5 : 3}
                          fill={color} opacity={opacity}
                          stroke="#0a0a0f" strokeWidth={1.5}
                        />
                      ))}
                      {/* Label at end of line */}
                      {(isMe || isHov) && m.points.length > 0 && (
                        <text
                          x={getX(m.points.length - 1) + 7}
                          y={getY(m.points[m.points.length - 1].value) + 4}
                          fill={color} fontSize={10} fontWeight={700}
                        >
                          {m.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Legend / mini-standings */}
            <div className="flex flex-wrap gap-1.5 mt-2 justify-center">
              {standings.map(s => {
                const color = MANAGER_COLORS[s.name] || '#888';
                const isMe = s.manager_id === myManagerId;
                const isHov = hoveredManager === s.name;
                return (
                  <span
                    key={s.manager_id}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded cursor-pointer transition-all"
                    style={{
                      background: isHov ? `${color}22` : isMe ? `${color}15` : 'transparent',
                      color,
                      opacity: hoveredManager ? (isHov ? 1 : 0.25) : isMe ? 1 : 0.65,
                      border: isMe ? `1px solid ${color}40` : '1px solid transparent',
                    }}
                    onMouseEnter={() => setHoveredManager(s.name)}
                    onMouseLeave={() => setHoveredManager(null)}
                  >
                    #{s.rank} {s.name} · {Math.round(s.grand_total)}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* ── Couple Standings ───────────────────────── */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
          <h2 className="text-sm font-bold text-white mb-3">💑 Couple Standings</h2>
          {coupleStandings.every(c => c.total === 0) ? (
            <p className="text-white/25 text-xs">Will populate after scores are entered.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {coupleStandings.map((c, i) => (
                <div
                  key={c.label}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md"
                  style={{
                    background: c.isMe ? 'rgba(255,107,53,0.08)' : 'transparent',
                    border: c.isMe ? '1px solid rgba(255,107,53,0.15)' : '1px solid transparent',
                  }}
                >
                  <span className="w-5 text-center text-[11px]">
                    {i < 3 ? ['🥇', '🥈', '🥉'][i] : <span className="text-white/25 font-bold">{i + 1}</span>}
                  </span>
                  <span className={`text-xs flex-1 font-semibold ${c.isMe ? 'text-orange-400' : 'text-white/60'}`}>
                    {c.label}
                  </span>
                  <span className="text-xs font-bold text-white">{Math.round(c.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Recent Activity ────────────────────────── */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
          <h2 className="text-sm font-bold text-white mb-3">📰 Recent Activity</h2>
          {activities.length === 0 ? (
            <p className="text-white/25 text-xs">No activity yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {activities.map(a => (
                <div key={a.id} className="flex items-start gap-2">
                  <span className="text-sm flex-shrink-0 mt-0.5">
                    {ACTIVITY_ICONS[a.type] || ACTIVITY_ICONS.default}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/50 leading-tight">{a.message}</p>
                    <span className="text-[10px] text-white/15">{timeAgo(a.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Links ──────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
        {[
          { href: '/picks',       icon: '✅', label: 'Submit Picks'  },
          { href: '/leaderboard', icon: '🏆', label: 'Leaderboard'   },
          { href: '/scoreboard',  icon: '📊', label: 'Scoreboard'    },
          { href: '/pool',        icon: '🌊', label: 'Pool Board'    },
        ].map(link => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.05] rounded-lg px-4 py-3 hover:bg-white/[0.04] transition-all no-underline"
          >
            <span className="text-lg">{link.icon}</span>
            <span className="text-xs font-semibold text-white/50">{link.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
