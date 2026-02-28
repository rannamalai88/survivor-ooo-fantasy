'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, TRIBE_COLORS, COUPLES } from '@/lib/constants';
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

interface TeamSurvivorRow {
  survivor_id: string;
  survivors: { name: string; tribe: string; is_active: boolean };
}

interface ActivityRow {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

interface WeeklyPickRow {
  captain_id: string | null;
}

// ============================================================
// Component
// ============================================================
export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [totals, setTotals] = useState<ManagerTotalRow[]>([]);
  const [myTeam, setMyTeam] = useState<{ name: string; tribe: string; is_active: boolean; isCaptain: boolean }[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState(2);
  const [myManagerId, setMyManagerId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [seasonRes, managersRes, totalsRes, activityRes] = await Promise.all([
        supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
        supabase.from('managers').select('id, name, is_commissioner').eq('season_id', SEASON_ID).order('draft_position'),
        supabase.from('manager_totals').select('*').eq('season_id', SEASON_ID),
        supabase.from('activity_log').select('id, type, message, created_at').eq('season_id', SEASON_ID).order('created_at', { ascending: false }).limit(8),
      ]);

      setCurrentEpisode(seasonRes.data?.current_episode || 2);
      setManagers(managersRes.data || []);
      setTotals(totalsRes.data || []);
      setActivities(activityRes.data || []);

      // Default to commissioner
      const mgrs = managersRes.data || [];
      const commissioner = mgrs.find((m: Manager) => m.is_commissioner);
      const myId = commissioner?.id || mgrs[0]?.id;
      setMyManagerId(myId);

      // Load my team
      if (myId) {
        const [teamRes, pickRes] = await Promise.all([
          supabase.from('teams').select('survivor_id, survivors(name, tribe, is_active)').eq('season_id', SEASON_ID).eq('manager_id', myId).eq('is_active', true),
          supabase.from('weekly_picks').select('captain_id').eq('season_id', SEASON_ID).eq('manager_id', myId).eq('episode', seasonRes.data?.current_episode || 2).single(),
        ]);

        const captainId = pickRes.data?.captain_id || null;
        const team = (teamRes.data || []).map((t: any) => ({
          name: t.survivors?.name || '?',
          tribe: t.survivors?.tribe || 'Vatu',
          is_active: t.survivors?.is_active ?? true,
          isCaptain: t.survivor_id === captainId,
        }));
        setMyTeam(team);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  // ---- Computed ----
  const myManager = managers.find(m => m.id === myManagerId);
  const myTotals = totals.find(t => t.manager_id === myManagerId);

  const standings = useMemo(() => {
    return [...totals]
      .sort((a, b) => b.grand_total - a.grand_total)
      .map((t, i) => {
        const mgr = managers.find(m => m.id === t.manager_id);
        return { ...t, name: mgr?.name || '?', rank: i + 1 };
      });
  }, [totals, managers]);

  const myRank = standings.find(s => s.manager_id === myManagerId)?.rank || 0;

  const coupleStandings = useMemo(() => {
    return COUPLES.map(c => {
      const m1 = totals.find(t => {
        const mgr = managers.find(m => m.id === t.manager_id);
        return mgr?.name === c.members[0];
      });
      const m2 = totals.find(t => {
        const mgr = managers.find(m => m.id === t.manager_id);
        return mgr?.name === c.members[1];
      });
      return {
        label: c.label,
        total: (m1?.grand_total || 0) + (m2?.grand_total || 0),
        isMe: myManager ? c.members.includes(myManager.name) : false,
      };
    }).sort((a, b) => b.total - a.total);
  }, [totals, managers, myManager]);

  function timeAgo(dateStr: string): string {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  }

  const ACTIVITY_ICONS: Record<string, string> = {
    score: '📊', pool: '🌊', chip: '🎰', draft: '📋', pick: '✅', trade: '🔄', net: '💬', default: '🔥',
  };

  // ---- Render ----
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4 animate-pulse">🔥</div>
        <p className="text-white/30 text-sm">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-orange-600/10 via-red-600/5 to-yellow-600/10 border border-orange-500/15 rounded-2xl p-6 mb-6 text-center">
        <div className="text-3xl mb-2">🔥</div>
        <h1 className="text-2xl font-extrabold text-white tracking-wider">SURVIVOR OOO FANTASY</h1>
        <p className="text-white/30 text-sm mt-1">Season 50 · Episode {currentEpisode}</p>
        {myManager && myTotals && (
          <div className="mt-4 flex justify-center gap-6">
            <div>
              <div className="text-2xl font-extrabold text-orange-400">{myRank ? `#${myRank}` : '—'}</div>
              <div className="text-[10px] text-white/25 tracking-wider">YOUR RANK</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">{Math.round(myTotals.grand_total)}</div>
              <div className="text-[10px] text-white/25 tracking-wider">TOTAL POINTS</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-yellow-300">{myTotals.fantasy_total}</div>
              <div className="text-[10px] text-white/25 tracking-wider">FANTASY</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* My Team Snapshot */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">🏕️ My Team</h2>
            <Link href="/my-team" className="text-[10px] font-semibold text-orange-400 hover:text-orange-300">
              View Full →
            </Link>
          </div>
          {myTeam.length === 0 ? (
            <p className="text-white/25 text-xs">Team will appear after the draft.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {myTeam.map(s => {
                const tColor = TRIBE_COLORS[s.tribe] || '#fff';
                return (
                  <div
                    key={s.name}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                    style={{
                      background: s.isCaptain ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.01)',
                      border: s.isCaptain ? '1px solid rgba(255,215,0,0.15)' : '1px solid transparent',
                      opacity: s.is_active ? 1 : 0.4,
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-extrabold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${tColor}44, ${tColor}77)`,
                        border: `1.5px solid ${tColor}`,
                      }}
                    >
                      {s.name.startsWith('"') ? 'Q' : s.name[0]}
                    </div>
                    <span className={`text-xs font-semibold flex-1 ${s.is_active ? 'text-white/70' : 'text-white/30 line-through'}`}>
                      {s.name}
                    </span>
                    {s.isCaptain && <span className="text-[9px]">👑</span>}
                    <span className="text-[10px] font-bold tracking-wider" style={{ color: tColor }}>
                      {s.tribe.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Standings */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">🏆 Standings</h2>
            <Link href="/leaderboard" className="text-[10px] font-semibold text-orange-400 hover:text-orange-300">
              Full Leaderboard →
            </Link>
          </div>
          {standings.length === 0 ? (
            <p className="text-white/25 text-xs">Standings will appear after scores are entered.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {standings.slice(0, 6).map(s => {
                const isMe = s.manager_id === myManagerId;
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div
                    key={s.manager_id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md"
                    style={{
                      background: isMe ? 'rgba(255,107,53,0.08)' : 'transparent',
                      border: isMe ? '1px solid rgba(255,107,53,0.15)' : '1px solid transparent',
                    }}
                  >
                    <span className="w-5 text-center text-[11px]">
                      {s.rank <= 3 ? medals[s.rank - 1] : <span className="text-white/25 font-bold">{s.rank}</span>}
                    </span>
                    <span className={`text-xs flex-1 font-semibold ${isMe ? 'text-orange-400' : 'text-white/60'}`}>
                      {s.name} {isMe && '(you)'}
                    </span>
                    <span className="text-xs font-bold text-white">{Math.round(s.grand_total)}</span>
                  </div>
                );
              })}
              {standings.length > 6 && (
                <div className="text-[10px] text-white/15 text-center mt-1">
                  + {standings.length - 6} more
                </div>
              )}
            </div>
          )}
        </div>

        {/* Couples Standings */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
          <h2 className="text-sm font-bold text-white mb-3">💑 Couple Standings</h2>
          {coupleStandings.every(c => c.total === 0) ? (
            <p className="text-white/25 text-xs">Will populate after scores are entered.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {coupleStandings.map((c, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <div
                    key={c.label}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md"
                    style={{
                      background: c.isMe ? 'rgba(255,107,53,0.08)' : 'transparent',
                      border: c.isMe ? '1px solid rgba(255,107,53,0.15)' : '1px solid transparent',
                    }}
                  >
                    <span className="w-5 text-center text-[11px]">
                      {i < 3 ? medals[i] : <span className="text-white/25 font-bold">{i + 1}</span>}
                    </span>
                    <span className={`text-xs flex-1 font-semibold ${c.isMe ? 'text-orange-400' : 'text-white/60'}`}>
                      {c.label}
                    </span>
                    <span className="text-xs font-bold text-white">{Math.round(c.total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Feed */}
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

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
        {[
          { href: '/picks', icon: '✅', label: 'Submit Picks' },
          { href: '/leaderboard', icon: '🏆', label: 'Leaderboard' },
          { href: '/scoreboard', icon: '📊', label: 'Scoreboard' },
          { href: '/pool', icon: '🌊', label: 'Pool Board' },
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
