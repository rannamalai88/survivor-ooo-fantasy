'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, TRIBE_COLORS, COUPLES } from '@/lib/constants';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

// ============================================================
// Types
// ============================================================
interface Manager { id: string; name: string; is_commissioner: boolean; }

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
  base_team_points: number;
  captain_bonus: number;
  voted_out_bonus: number;
  chip_bonus: number;
}

interface PoolStatusRow { manager_id: string; status: string; weeks_survived: number; }
interface NetAnswerRow { episode: number; correct_survivor_id: string; episode_title: string | null; }
interface WeeklyPickRow { manager_id: string; episode: number; captain_id: string | null; net_pick_id: string | null; }

// ============================================================
// Helpers
// ============================================================
function rankBadge(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

function rankColor(rank: number, total: number) {
  if (rank <= 3)  return '#FFD54F';
  if (rank <= Math.ceil(total / 2)) return 'rgba(255,255,255,0.6)';
  return 'rgba(255,255,255,0.25)';
}

const NAV_TILES = [
  { href: '/picks',       label: 'Picks',          icon: '✅', color: '#FF6B35' },
  { href: '/leaderboard', label: 'Leaderboard',     icon: '🏆', color: '#FFD54F' },
  { href: '/my-team',     label: 'My Team',         icon: '👥', color: '#1ABC9C' },
  { href: '/scoreboard',  label: 'Fantasy Scoring', icon: '📊', color: '#E67E22' },
  { href: '/chips',       label: 'Chips',           icon: '🎰', color: '#9B59B6' },
  { href: '/pool',        label: 'Pool',            icon: '🌊', color: '#3498DB' },
  { href: '/net',         label: 'NET',             icon: '💬', color: '#1ABC9C' },
  { href: '/rules',       label: 'Rules',           icon: '📖', color: 'rgba(255,255,255,0.3)' },
  { href: '/draft',       label: 'Draft',           icon: '📋', color: 'rgba(255,255,255,0.3)' },
  { href: '/dynasty',     label: 'Dynasty',         icon: '👑', color: 'rgba(255,255,255,0.3)' },
];

// ============================================================
// Shared chart layout constants
// ============================================================
const W          = 680;
const PAD_LEFT   = 34;
const PAD_RIGHT  = 88;   // space for right-edge name labels
const PAD_TOP    = 12;
const PAD_BOT    = 22;
const PLOT_W     = W - PAD_LEFT - PAD_RIGHT;

function xOf(ep: number, episodes: number[]) {
  if (episodes.length <= 1) return PAD_LEFT + PLOT_W / 2;
  const idx = episodes.indexOf(ep);
  return PAD_LEFT + (idx / (episodes.length - 1)) * PLOT_W;
}

function buildPath(
  pts: { episode: number; value: number }[],
  episodes: number[],
  yOf: (v: number) => number,
) {
  const sorted = [...pts].sort((a, b) => a.episode - b.episode);
  return sorted
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.episode, episodes).toFixed(1)},${yOf(p.value).toFixed(1)}`)
    .join(' ');
}

/**
 * Spread overlapping right-edge labels so they don't pile up.
 * Works top-to-bottom then bottom-to-top to keep labels in bounds.
 */
function spreadLabels(
  items: { id: string; rawY: number }[],
  plotH: number,
  lineH = 13,
): Record<string, number> {
  const sorted = [...items].sort((a, b) => a.rawY - b.rawY);
  const out: Record<string, number> = {};
  sorted.forEach(x => { out[x.id] = x.rawY; });

  // Push down
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[sorted[i - 1].id];
    if (out[sorted[i].id] - prev < lineH) out[sorted[i].id] = prev + lineH;
  }

  // Pull up from bottom
  const maxY = PAD_TOP + plotH + 4;
  for (let i = sorted.length - 1; i >= 1; i--) {
    if (out[sorted[i].id] > maxY) out[sorted[i].id] = maxY;
    if (out[sorted[i - 1].id] > out[sorted[i].id] - lineH)
      out[sorted[i - 1].id] = out[sorted[i].id] - lineH;
  }

  return out;
}

// ============================================================
// Rank Tracking Chart
// ============================================================
interface RankPoint { episode: number; rank: number; }

function RankTrackingChart({
  rankHistory, managers, myManagerId,
}: {
  rankHistory: Record<string, RankPoint[]>;
  managers: Manager[];
  myManagerId: string | null;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const episodes = useMemo(() => {
    const eps = new Set<number>();
    Object.values(rankHistory).forEach(pts => pts.forEach(p => eps.add(p.episode)));
    return Array.from(eps).sort((a, b) => a - b);
  }, [rankHistory]);

  if (episodes.length < 2) {
    return (
      <div style={{ textAlign: 'center', padding: '32px', color: 'rgba(255,255,255,0.15)', fontSize: '12px' }}>
        Rankings will appear after at least 2 scored episodes.
      </div>
    );
  }

  const totalManagers = managers.length || 12;
  const H      = 224;
  const plotH  = H - PAD_TOP - PAD_BOT;

  function yOf(rank: number) {
    return PAD_TOP + ((rank - 1) / (totalManagers - 1)) * plotH;
  }

  const lastEp = episodes[episodes.length - 1];

  const labelInputs = managers.map(m => {
    const lp = rankHistory[m.id]?.find(p => p.episode === lastEp);
    return { id: m.id, rawY: lp ? yOf(lp.rank) : yOf(totalManagers) };
  });
  const labelY = spreadLabels(labelInputs, plotH);

  const gridRanks = [1, 3, 6, 9, 12].filter(r => r <= totalManagers);

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: '320px', display: 'block' }}
        onMouseLeave={() => setHoveredId(null)}>

        {/* Dashed gridlines — visually distinct from solid player lines */}
        {gridRanks.map(r => (
          <line key={r} x1={PAD_LEFT} y1={yOf(r)} x2={PAD_LEFT + PLOT_W} y2={yOf(r)}
            stroke="rgba(255,255,255,0.09)" strokeWidth="1" strokeDasharray="3 6" />
        ))}

        {/* Y-axis labels */}
        {gridRanks.map(r => (
          <text key={r} x={PAD_LEFT - 6} y={yOf(r) + 4} textAnchor="end"
            fontSize="9" fill="rgba(255,255,255,0.28)" fontFamily="-apple-system,sans-serif" fontWeight="600">
            {r === 1 ? '1st' : `#${r}`}
          </text>
        ))}

        {/* Dashed vertical ticks */}
        {episodes.map(ep => (
          <line key={ep} x1={xOf(ep, episodes)} y1={PAD_TOP}
            x2={xOf(ep, episodes)} y2={PAD_TOP + plotH}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="2 7" />
        ))}

        {/* X-axis labels */}
        {episodes.map(ep => (
          <text key={ep} x={xOf(ep, episodes)} y={H - 4} textAnchor="middle"
            fontSize="9" fill="rgba(255,255,255,0.25)" fontFamily="-apple-system,sans-serif" fontWeight="600">
            E{ep}
          </text>
        ))}

        {/* Render dim lines first, highlighted lines on top */}
        {([false, true] as const).map(isTop =>
          managers.map(m => {
            const isMe      = m.id === myManagerId;
            const isHovered = m.id === hoveredId;
            const onTop     = isMe || isHovered;
            if (isTop !== onTop) return null;

            const pts = (rankHistory[m.id] || []).sort((a, b) => a.episode - b.episode);
            if (pts.length === 0) return null;

            const lastPt    = pts[pts.length - 1];
            const lineColor = isMe ? '#FF6B35' : isHovered ? '#FFD54F' : 'rgba(255,255,255,0.13)';
            const strokeW   = isMe ? 2.5 : isHovered ? 2 : 1;
            const dotR      = isMe ? 3.5 : isHovered ? 3 : 2;
            const dispY     = labelY[m.id] ?? yOf(lastPt.rank);
            const nudged    = Math.abs(dispY - yOf(lastPt.rank)) > 4;

            return (
              <g key={m.id} onMouseEnter={() => setHoveredId(m.id)} style={{ cursor: 'default' }}>
                <path
                  d={buildPath(pts.map(p => ({ episode: p.episode, value: p.rank })), episodes, yOf)}
                  fill="none" stroke={lineColor} strokeWidth={strokeW}
                  strokeLinejoin="round" strokeLinecap="round"
                />
                {pts.map(p => (
                  <circle key={p.episode} cx={xOf(p.episode, episodes)} cy={yOf(p.rank)}
                    r={dotR} fill={lineColor} stroke="#0a0a0f" strokeWidth="1.5" />
                ))}
                {/* Label at spread position */}
                <text
                  x={xOf(lastPt.episode, episodes) + 10} y={dispY + 4}
                  fontSize="10"
                  fill={isMe ? '#FF6B35' : isHovered ? '#FFD54F' : 'rgba(255,255,255,0.28)'}
                  fontFamily="-apple-system,sans-serif"
                  fontWeight={isMe ? '800' : isHovered ? '700' : '500'}
                >
                  {m.name}
                </text>
                {/* Faint connector if label was nudged away from line end */}
                {nudged && (
                  <line
                    x1={xOf(lastPt.episode, episodes) + 7} y1={dispY + 1}
                    x2={xOf(lastPt.episode, episodes) + 5} y2={yOf(lastPt.rank)}
                    stroke={lineColor} strokeWidth="0.8" opacity="0.35"
                  />
                )}
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}

// ============================================================
// Score Tracking Chart
// ============================================================
interface ScorePoint { episode: number; cumScore: number; }

function ScoreTrackingChart({
  scoreHistory, managers, myManagerId,
}: {
  scoreHistory: Record<string, ScorePoint[]>;
  managers: Manager[];
  myManagerId: string | null;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const episodes = useMemo(() => {
    const eps = new Set<number>();
    Object.values(scoreHistory).forEach(pts => pts.forEach(p => eps.add(p.episode)));
    return Array.from(eps).sort((a, b) => a - b);
  }, [scoreHistory]);

  if (episodes.length < 2) {
    return (
      <div style={{ textAlign: 'center', padding: '32px', color: 'rgba(255,255,255,0.15)', fontSize: '12px' }}>
        Score trends will appear after at least 2 scored episodes.
      </div>
    );
  }

  const H     = 224;
  const plotH = H - PAD_TOP - PAD_BOT;

  const allScores = Object.values(scoreHistory).flatMap(pts => pts.map(p => p.cumScore));
  const maxScore  = Math.max(...allScores, 1);

  function yOf(score: number) {
    // Higher score → top of chart
    return PAD_TOP + (1 - score / maxScore) * plotH;
  }

  const lastEp = episodes[episodes.length - 1];

  const labelInputs = managers.map(m => {
    const lp = scoreHistory[m.id]?.find(p => p.episode === lastEp);
    return { id: m.id, rawY: lp ? yOf(lp.cumScore) : PAD_TOP + plotH };
  });
  const labelY = spreadLabels(labelInputs, plotH);

  // Pick ~5 evenly spaced Y gridlines
  const gridValues = [0, 0.25, 0.5, 0.75, 1.0].map(f => Math.round(maxScore * f));

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: '320px', display: 'block' }}
        onMouseLeave={() => setHoveredId(null)}>

        {gridValues.map(v => (
          <line key={v} x1={PAD_LEFT} y1={yOf(v)} x2={PAD_LEFT + PLOT_W} y2={yOf(v)}
            stroke="rgba(255,255,255,0.09)" strokeWidth="1" strokeDasharray="3 6" />
        ))}

        {gridValues.map(v => (
          <text key={v} x={PAD_LEFT - 6} y={yOf(v) + 4} textAnchor="end"
            fontSize="9" fill="rgba(255,255,255,0.28)" fontFamily="-apple-system,sans-serif" fontWeight="600">
            {v}
          </text>
        ))}

        {episodes.map(ep => (
          <line key={ep} x1={xOf(ep, episodes)} y1={PAD_TOP}
            x2={xOf(ep, episodes)} y2={PAD_TOP + plotH}
            stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="2 7" />
        ))}

        {episodes.map(ep => (
          <text key={ep} x={xOf(ep, episodes)} y={H - 4} textAnchor="middle"
            fontSize="9" fill="rgba(255,255,255,0.25)" fontFamily="-apple-system,sans-serif" fontWeight="600">
            E{ep}
          </text>
        ))}

        {([false, true] as const).map(isTop =>
          managers.map(m => {
            const isMe      = m.id === myManagerId;
            const isHovered = m.id === hoveredId;
            const onTop     = isMe || isHovered;
            if (isTop !== onTop) return null;

            const pts = (scoreHistory[m.id] || []).sort((a, b) => a.episode - b.episode);
            if (pts.length === 0) return null;

            const lastPt    = pts[pts.length - 1];
            const lineColor = isMe ? '#FF6B35' : isHovered ? '#FFD54F' : 'rgba(255,255,255,0.13)';
            const strokeW   = isMe ? 2.5 : isHovered ? 2 : 1;
            const dotR      = isMe ? 3.5 : isHovered ? 3 : 2;
            const dispY     = labelY[m.id] ?? yOf(lastPt.cumScore);
            const nudged    = Math.abs(dispY - yOf(lastPt.cumScore)) > 4;

            return (
              <g key={m.id} onMouseEnter={() => setHoveredId(m.id)} style={{ cursor: 'default' }}>
                <path
                  d={buildPath(pts.map(p => ({ episode: p.episode, value: p.cumScore })), episodes, yOf)}
                  fill="none" stroke={lineColor} strokeWidth={strokeW}
                  strokeLinejoin="round" strokeLinecap="round"
                />
                {pts.map(p => (
                  <circle key={p.episode} cx={xOf(p.episode, episodes)} cy={yOf(p.cumScore)}
                    r={dotR} fill={lineColor} stroke="#0a0a0f" strokeWidth="1.5" />
                ))}
                <text
                  x={xOf(lastPt.episode, episodes) + 10} y={dispY + 4}
                  fontSize="10"
                  fill={isMe ? '#FF6B35' : isHovered ? '#FFD54F' : 'rgba(255,255,255,0.28)'}
                  fontFamily="-apple-system,sans-serif"
                  fontWeight={isMe ? '800' : isHovered ? '700' : '500'}
                >
                  {m.name}
                </text>
                {nudged && (
                  <line
                    x1={xOf(lastPt.episode, episodes) + 7} y1={dispY + 1}
                    x2={xOf(lastPt.episode, episodes) + 5} y2={yOf(lastPt.cumScore)}
                    stroke={lineColor} strokeWidth="0.8" opacity="0.35"
                  />
                )}
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================
export default function HomePage() {
  const { manager: authManager, isLoading: authLoading } = useAuth();

  const [loading, setLoading]         = useState(true);
  const [managers, setManagers]       = useState<Manager[]>([]);
  const [totals, setTotals]           = useState<ManagerTotalRow[]>([]);
  const [managerScores, setManagerScores] = useState<ManagerScoreRow[]>([]);
  const [poolStatuses, setPoolStatuses]   = useState<PoolStatusRow[]>([]);
  const [netAnswers, setNetAnswers]   = useState<NetAnswerRow[]>([]);
  const [weeklyPicks, setWeeklyPicks] = useState<WeeklyPickRow[]>([]);
  const [myTeam, setMyTeam]           = useState<{
    survivorId: string; name: string; tribe: string;
    is_active: boolean; isCaptain: boolean; totalPts: number;
  }[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);

  const myManagerId   = authManager?.id   ?? null;
  const myManagerName = authManager?.name ?? null;

  useEffect(() => {
    if (!authLoading) loadData(myManagerId);
  }, [authLoading, myManagerId]);

  async function loadData(managerId: string | null) {
    try {
      setLoading(true);
      const [seasonRes, managersRes, totalsRes, mScoresRes, poolRes, netRes, picksRes] = await Promise.all([
        supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
        supabase.from('managers').select('id, name, is_commissioner').eq('season_id', SEASON_ID).order('draft_position'),
        supabase.from('manager_totals').select('*').eq('season_id', SEASON_ID),
        supabase.from('manager_scores').select('manager_id, episode, fantasy_points, base_team_points, captain_bonus, voted_out_bonus, chip_bonus').eq('season_id', SEASON_ID).order('episode'),
        supabase.from('pool_status').select('manager_id, status, weeks_survived').eq('season_id', SEASON_ID),
        supabase.from('net_answers').select('episode, correct_survivor_id, episode_title').eq('season_id', SEASON_ID).order('episode'),
        supabase.from('weekly_picks').select('manager_id, episode, captain_id, net_pick_id').eq('season_id', SEASON_ID).order('episode', { ascending: false }),
      ]);

      const ep = seasonRes.data?.current_episode || 2;
      setCurrentEpisode(ep);
      setManagers(managersRes.data || []);
      setTotals(totalsRes.data || []);
      setManagerScores((mScoresRes.data || []) as ManagerScoreRow[]);
      setPoolStatuses(poolRes.data || []);
      setNetAnswers(netRes.data || []);
      setWeeklyPicks(picksRes.data || []);

      if (managerId) {
        const [teamRes, sScoresRes] = await Promise.all([
          supabase.from('teams').select('survivor_id, survivors(name, tribe, is_active)').eq('season_id', SEASON_ID).eq('manager_id', managerId).eq('is_active', true),
          supabase.from('survivor_scores').select('survivor_id, final_points').eq('season_id', SEASON_ID),
        ]);
        const captainId = (picksRes.data || []).find((p: any) => p.manager_id === managerId)?.captain_id ?? null;
        const sScores   = sScoresRes.data || [];
        const team = (teamRes.data || []).map((t: any) => {
          const sid     = t.survivor_id;
          const totalPts = sScores.filter((ss: any) => ss.survivor_id === sid).reduce((sum: number, ss: any) => sum + ss.final_points, 0);
          return { survivorId: sid, name: t.survivors?.name || '?', tribe: t.survivors?.tribe || 'Vatu', is_active: t.survivors?.is_active ?? true, isCaptain: sid === captainId, totalPts };
        });
        team.sort((a: any, b: any) => b.totalPts - a.totalPts);
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

  const myTotal = useMemo(() => totals.find(t => t.manager_id === myManagerId), [totals, myManagerId]);

  const categoryRanks = useMemo(() => {
    if (!myManagerId) return { fantasy: 0, pool: 0, net: 0, quinfecta: 0, total: 0 };
    const rank = (sorted: { manager_id: string }[]) => sorted.findIndex(t => t.manager_id === myManagerId) + 1 || 0;
    return {
      fantasy:   rank([...totals].sort((a, b) => b.fantasy_total    - a.fantasy_total)),
      pool:      rank([...totals].sort((a, b) => b.pool_score        - a.pool_score)),
      net:       rank([...totals].sort((a, b) => b.net_total         - a.net_total)),
      quinfecta: rank([...totals].sort((a, b) => b.quinfecta_score   - a.quinfecta_score)),
      total:     rank([...totals].sort((a, b) => b.grand_total       - a.grand_total)),
    };
  }, [totals, myManagerId]);

  const myScoringTotals = useMemo(() => {
    const myScores = managerScores.filter(ms => ms.manager_id === myManagerId);
    return {
      team:     myScores.reduce((s, ms) => s + (ms.base_team_points || 0), 0),
      captain:  myScores.reduce((s, ms) => s + (ms.captain_bonus    || 0), 0),
      votedOut: myScores.reduce((s, ms) => s + (ms.voted_out_bonus  || 0), 0),
      chips:    myScores.reduce((s, ms) => s + (ms.chip_bonus       || 0), 0),
    };
  }, [managerScores, myManagerId]);

  const standings = useMemo(() =>
    [...totals].sort((a, b) => b.grand_total - a.grand_total).map((t, i) => ({
      ...t, rank: i + 1, name: managers.find(m => m.id === t.manager_id)?.name || '?',
    })),
  [totals, managers]);

  const coupleStandings = useMemo(() =>
    COUPLES.map(c => {
      const m1 = totals.find(t => managers.find(m => m.id === t.manager_id)?.name === c.members[0]);
      const m2 = totals.find(t => managers.find(m => m.id === t.manager_id)?.name === c.members[1]);
      return {
        label: c.label, members: c.members,
        total: (m1?.grand_total || 0) + (m2?.grand_total || 0),
        isMe:  myManagerName ? c.members.includes(myManagerName) : false,
      };
    }).sort((a, b) => b.total - a.total),
  [totals, managers, myManagerName]);

  // ---- Rank history ----
  const rankHistory = useMemo(() => {
    const episodes = Array.from(new Set(managerScores.map(ms => ms.episode))).sort((a, b) => a - b);
    const history: Record<string, RankPoint[]> = {};
    managers.forEach(m => { history[m.id] = []; });

    episodes.forEach(ep => {
      const cumulative: Record<string, number> = {};
      managers.forEach(m => {
        cumulative[m.id] = managerScores
          .filter(ms => ms.manager_id === m.id && ms.episode <= ep)
          .reduce((s, ms) => s + (ms.fantasy_points || 0), 0);
      });
      const sorted = Object.entries(cumulative).sort((a, b) => b[1] - a[1]);
      let currentRank = 1;
      sorted.forEach(([managerId, pts], idx) => {
        if (idx > 0 && pts < sorted[idx - 1][1]) currentRank = idx + 1;
        if (history[managerId]) history[managerId].push({ episode: ep, rank: currentRank });
      });
    });
    return history;
  }, [managerScores, managers]);

  // ---- Score history ----
  const scoreHistory = useMemo(() => {
    const episodes = Array.from(new Set(managerScores.map(ms => ms.episode))).sort((a, b) => a - b);
    const history: Record<string, ScorePoint[]> = {};
    managers.forEach(m => { history[m.id] = []; });

    episodes.forEach(ep => {
      managers.forEach(m => {
        const cumScore = managerScores
          .filter(ms => ms.manager_id === m.id && ms.episode <= ep)
          .reduce((s, ms) => s + (ms.fantasy_points || 0), 0);
        if (history[m.id]) history[m.id].push({ episode: ep, cumScore });
      });
    });
    return history;
  }, [managerScores, managers]);

  const myPool = useMemo(() => poolStatuses.find(p => p.manager_id === myManagerId), [poolStatuses, myManagerId]);

  const myNetRecord = useMemo(() => {
    if (!myManagerId) return { correct: 0, total: 0 };
    const myPicks = weeklyPicks.filter(p => p.manager_id === myManagerId && p.net_pick_id);
    let correct = 0;
    myPicks.forEach(p => {
      const answer = netAnswers.find(a => a.episode === p.episode);
      if (answer && answer.correct_survivor_id === p.net_pick_id) correct++;
    });
    return { correct, total: myPicks.length };
  }, [weeklyPicks, netAnswers, myManagerId]);

  const POOL_CFG: Record<string, { color: string; label: string }> = {
    active:   { color: '#1ABC9C', label: 'Active'    },
    finished: { color: '#FFD54F', label: 'Finished!' },
    drowned:  { color: '#E74C3C', label: 'Drowned'   },
    burnt:    { color: '#95a5a6', label: 'Burnt'     },
  };

  const TC = TRIBE_COLORS as Record<string, string>;

  if (loading || authLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}>
      <div className="text-center">
        <div className="text-4xl mb-3 animate-pulse">🔥</div>
        <p className="text-white/20 text-sm tracking-wider">Loading...</p>
      </div>
    </div>
  );

  const chartLegend = (
    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', marginTop: '4px' }}>
      <span style={{ color: '#FF6B35', fontWeight: 700 }}>— You</span>
      <span style={{ marginLeft: '12px' }}>— Others (hover to highlight)</span>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e8e8', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 16px 60px' }}>

        {/* ── 1. TOP SUMMARY CARD ── */}
        <div style={{ background: 'linear-gradient(135deg, rgba(255,107,53,0.12), rgba(255,143,0,0.06))', border: '1px solid rgba(255,107,53,0.2)', borderRadius: '18px', padding: '24px', marginBottom: '20px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px' }}>
            <Link href="/picks">
              <div style={{ background: 'linear-gradient(135deg,#FF6B35,#FF8F00)', borderRadius: '10px', padding: '10px 18px', fontSize: '12px', fontWeight: 800, color: '#fff', letterSpacing: '1px', cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,107,53,0.35)' }}>
                🔥 SUBMIT PICKS
              </div>
            </Link>
          </div>
          <div style={{ textAlign: 'center', marginBottom: '18px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '3px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: '4px' }}>Survivor OOO Fantasy</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>Season 50 · Episode {currentEpisode}</div>
          </div>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '56px', fontWeight: 900, color: '#FF6B35', lineHeight: 1 }}>{Math.round(myTotal?.grand_total || 0)}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: 'rgba(255,255,255,0.25)', marginTop: '4px', textTransform: 'uppercase' }}>Total Points</div>
            {categoryRanks.total > 0 && (
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFD54F', marginTop: '4px' }}>{rankBadge(categoryRanks.total)} of {managers.length}</div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
            {[
              { label: 'Fantasy',  val: myTotal?.fantasy_total        || 0, rank: categoryRanks.fantasy,   color: '#FF6B35' },
              { label: 'Pool Pts', val: Math.round(myTotal?.pool_score || 0), rank: categoryRanks.pool,    color: '#1ABC9C' },
              { label: 'NET',      val: myTotal?.net_total            || 0, rank: categoryRanks.net,       color: '#9B59B6' },
              { label: 'Quin',     val: myTotal?.quinfecta_score      || 0, rank: categoryRanks.quinfecta, color: 'rgba(255,255,255,0.3)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: s.val > 0 ? s.color : 'rgba(255,255,255,0.15)' }}>{s.val || '—'}</div>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginTop: '2px' }}>{s.label}</div>
                {s.rank > 0 && <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '1px' }}>#{s.rank}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* ── 2. STANDINGS ROW ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#fff' }}>🏆 Individual Standings</h2>
              <Link href="/leaderboard" style={{ fontSize: '10px', color: '#FF6B35', fontWeight: 700, textDecoration: 'none' }}>Full Leaderboard →</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {standings.map(s => {
                const isMe = s.manager_id === myManagerId;
                return (
                  <div key={s.manager_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '8px', background: isMe ? 'rgba(255,107,53,0.08)' : 'transparent', border: isMe ? '1px solid rgba(255,107,53,0.2)' : '1px solid transparent' }}>
                    <span style={{ fontSize: s.rank <= 3 ? '14px' : '10px', fontWeight: 700, color: rankColor(s.rank, standings.length), width: '20px', textAlign: 'center', flexShrink: 0 }}>{rankBadge(s.rank)}</span>
                    <span style={{ flex: 1, fontSize: '12px', fontWeight: isMe ? 800 : 600, color: isMe ? '#fff' : 'rgba(255,255,255,0.6)' }}>{s.name}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: isMe ? '#FF6B35' : 'rgba(255,255,255,0.5)' }}>{Math.round(s.grand_total)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#fff' }}>💑 Couple Standings</h2>
              <Link href="/leaderboard" style={{ fontSize: '10px', color: '#FF6B35', fontWeight: 700, textDecoration: 'none' }}>Full →</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {coupleStandings.map((c, i) => {
                const rank = i + 1;
                return (
                  <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '8px', background: c.isMe ? 'rgba(255,107,53,0.08)' : 'transparent', border: c.isMe ? '1px solid rgba(255,107,53,0.2)' : '1px solid transparent' }}>
                    <span style={{ fontSize: rank <= 3 ? '14px' : '10px', fontWeight: 700, color: rankColor(rank, coupleStandings.length), width: '20px', textAlign: 'center', flexShrink: 0 }}>{rankBadge(rank)}</span>
                    <span style={{ flex: 1, fontSize: '12px', fontWeight: c.isMe ? 800 : 600, color: c.isMe ? '#fff' : 'rgba(255,255,255,0.6)' }}>{c.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: c.isMe ? '#FF6B35' : 'rgba(255,255,255,0.5)' }}>{Math.round(c.total)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 2b. RANKING HISTORY CHART ── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '16px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
            <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#fff' }}>📈 Ranking History</h2>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>Cumulative fantasy pts · hover a line</span>
          </div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', marginBottom: '8px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700 }}>↑ Better rank</div>
          <RankTrackingChart rankHistory={rankHistory} managers={managers} myManagerId={myManagerId} />
          {chartLegend}
        </div>

        {/* ── 2c. SCORE HISTORY CHART ── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
            <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#fff' }}>📊 Score History</h2>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', fontWeight: 600 }}>Cumulative fantasy pts · hover a line</span>
          </div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.15)', marginBottom: '8px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 700 }}>↑ Higher score</div>
          <ScoreTrackingChart scoreHistory={scoreHistory} managers={managers} myManagerId={myManagerId} />
          {chartLegend}
        </div>

        {/* ── 3. FANTASY SCORING CARD ── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '16px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#fff' }}>📊 Fantasy Scoring</h2>
            <Link href="/my-team" style={{ fontSize: '10px', color: '#FF6B35', fontWeight: 700, textDecoration: 'none' }}>My Team →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '8px', marginBottom: '14px' }}>
            {[
              { label: 'Total',    val: myTotal?.fantasy_total  || 0, color: '#FF6B35' },
              { label: 'Team',     val: myScoringTotals.team,         color: '#FF6B35' },
              { label: 'Captain',  val: myScoringTotals.captain,      color: '#FFD54F' },
              { label: 'Vote Out', val: myScoringTotals.votedOut,     color: '#1ABC9C' },
              { label: 'Chips',    val: myScoringTotals.chips,        color: '#9B59B6' },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: '4px' }}>{s.label}</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: s.val > 0 ? s.color : 'rgba(255,255,255,0.15)' }}>{s.val || '—'}</div>
              </div>
            ))}
          </div>
          {myTeam.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${myTeam.length},1fr)`, gap: '8px' }}>
              {myTeam.map(s => (
                <div key={s.survivorId} style={{ background: s.isCaptain ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${s.isCaptain ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)'}`, borderRadius: '10px', padding: '10px', textAlign: 'center', opacity: s.is_active ? 1 : 0.45 }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `linear-gradient(135deg,${TC[s.tribe]}44,${TC[s.tribe]}77)`, border: `2px solid ${TC[s.tribe]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px', fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                    {s.name.startsWith('"') ? 'Q' : s.name[0]}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: s.is_active ? '#fff' : 'rgba(255,255,255,0.35)', textDecoration: s.is_active ? 'none' : 'line-through', marginBottom: '2px' }}>{s.name}</div>
                  <div style={{ fontSize: '9px', fontWeight: 700, color: TC[s.tribe], letterSpacing: '1px', marginBottom: '4px' }}>{s.tribe.toUpperCase()}</div>
                  {s.isCaptain && <div style={{ fontSize: '8px', fontWeight: 700, color: '#FFD54F', marginBottom: '2px' }}>👑 CAPTAIN</div>}
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>{s.totalPts}</div>
                  <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.2)' }}>pts</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 4. POOL ROW CARD ── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '14px 18px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '20px' }}>🌊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff', marginBottom: '2px' }}>Survivor Pool</div>
            {myPool ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: `${(POOL_CFG[myPool.status] || POOL_CFG.active).color}15`, color: (POOL_CFG[myPool.status] || POOL_CFG.active).color }}>
                  {(POOL_CFG[myPool.status] || POOL_CFG.active).label}
                </span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{myPool.weeks_survived} weeks survived</span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>· Pool Pts: <span style={{ color: '#1ABC9C', fontWeight: 700 }}>{Math.round(totals.find(t => t.manager_id === myManagerId)?.pool_score || 0)}</span></span>
              </div>
            ) : (
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>No data yet</span>
            )}
          </div>
          <Link href="/pool" style={{ fontSize: '10px', color: '#FF6B35', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>Pool Board →</Link>
        </div>

        {/* ── 5. NET ROW CARD ── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '14px 18px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '20px' }}>💬</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff', marginBottom: '2px' }}>Name Episode Title (NET)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>Record: <span style={{ color: '#9B59B6', fontWeight: 700 }}>{myNetRecord.correct}/{myNetRecord.total}</span></span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>· Points: <span style={{ color: '#9B59B6', fontWeight: 700 }}>{myNetRecord.correct * 3}</span></span>
            </div>
          </div>
          <Link href="/net" style={{ fontSize: '10px', color: '#FF6B35', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>NET Board →</Link>
        </div>

        {/* ── 6. QUINFECTA ROW CARD ── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '20px' }}>🏝️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#fff', marginBottom: '2px' }}>Quinfecta</div>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>Finale predictions — opens at Final 5</span>
          </div>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)', fontWeight: 700, flexShrink: 0 }}>Coming Soon</span>
        </div>

        {/* ── 7. NAV TILES ── */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2px', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: '10px' }}>Quick Navigation</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '8px' }}>
            {NAV_TILES.map(tile => (
              <Link key={tile.href} href={tile.href} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '14px 8px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${tile.color}10`; (e.currentTarget as HTMLElement).style.borderColor = `${tile.color}30`; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.05)'; }}>
                  <div style={{ fontSize: '20px', marginBottom: '6px' }}>{tile.icon}</div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.5px' }}>{tile.label}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── 8. FOOTER QUOTE ── */}
        <div style={{ textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '24px' }}>
          <p style={{ fontSize: '12px', fontStyle: 'italic', color: 'rgba(255,255,255,0.2)', lineHeight: 1.7, maxWidth: '500px', margin: '0 auto' }}>
            &ldquo;Every person has three hearts—one for the world, one for friends, and a secret one to survive.&rdquo;
          </p>
        </div>

      </div>
    </div>
  );
}
