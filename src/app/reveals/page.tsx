'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import AuthGuard from '@/components/auth/AuthGuard';
import { SEASON_ID, TRIBE_COLORS } from '@/lib/constants';

// ============================================================
// Types
// ============================================================
interface Manager { id: string; name: string; draft_position: number; }

interface Survivor {
  id: string;
  name: string;
  tribe: string;
  is_active: boolean;
  eliminated_episode: number | null;
}

interface WeeklyPick {
  manager_id: string;
  episode: number;
  captain_id: string | null;
  pool_pick_id: string | null;
  pool_backdoor_id: string | null;
  net_pick_id: string | null;
  chip_played: number | null;
  chip_target: string | null;
  swap_out_ids: string[] | null;
  swap_in_ids: string[] | null;
  player_add_id: string | null;
}

interface ManagerScore {
  manager_id: string;
  episode: number;
  fantasy_points: number;
  net_correct: boolean;
  captain_lost: boolean;
  chip_bonus: number;
}

interface NetAnswer {
  episode: number;
  correct_survivor_id: string;
}

interface QuinfectaPrediction {
  manager_id: string;
  place_20_id: string | null;
  place_21_id: string | null;
  place_22_id: string | null;
  place_23_id: string | null;
  place_24_id: string | null;
}

// ============================================================
// Helpers
// ============================================================
const TC = TRIBE_COLORS as Record<string, string>;

const CHIP_NAMES: Record<number, string> = {
  1: 'Assistant Manager',
  2: 'Team Boost',
  3: 'Super Captain',
  4: 'Swap Out',
  5: 'Player Add',
};

const CHIP_ICONS: Record<number, string> = {
  1: '🤝',
  2: '⚡',
  3: '👑',
  4: '🔄',
  5: '➕',
};

const QUINFECTA_PLACES = [
  { idx: 0, place: 20, label: '20th',     points: 5,  color: '#1ABC9C' },
  { idx: 1, place: 21, label: '21st',     points: 10, color: '#1ABC9C' },
  { idx: 2, place: 22, label: '22nd',     points: 25, color: '#FFD54F' },
  { idx: 3, place: 23, label: '23rd',     points: 50, color: '#FF6B35' },
  { idx: 4, place: 24, label: '👑 Sole',  points: 50, color: '#FF6B35' },
];

function Avatar({ name, tribe, sz = 22 }: { name: string; tribe: string; sz?: number }) {
  const color = TC[tribe] || '#888';
  const ini = name.startsWith('"') ? 'Q' : name[0];
  return (
    <div style={{
      width: sz, height: sz, borderRadius: '50%',
      background: `linear-gradient(135deg,${color}44,${color}77)`,
      border: `1.5px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: sz * 0.42, fontWeight: 800, color: '#fff' }}>{ini}</span>
    </div>
  );
}

// ============================================================
// Manager Reveal Card
// ============================================================
function ManagerRevealCard({
  manager, pick, score, netAnswer, episode, currentEpisode, survivorMap, managerMap, rank,
}: {
  manager: Manager;
  pick: WeeklyPick | undefined;
  score: ManagerScore | undefined;
  netAnswer: NetAnswer | undefined;
  episode: number;
  currentEpisode: number;
  survivorMap: Map<string, Survivor>;
  managerMap: Map<string, Manager>;
  rank: number;
}) {
  if (!pick) {
    return (
      <div className="rounded-xl p-4 border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-bold text-white/40">{manager.name}</span>
          <span className="text-[10px] text-white/20">No picks submitted</span>
        </div>
      </div>
    );
  }

  const captain = pick.captain_id ? survivorMap.get(pick.captain_id) : null;
  const poolPick = pick.pool_pick_id ? survivorMap.get(pick.pool_pick_id) : null;
  const backdoor = pick.pool_backdoor_id ? survivorMap.get(pick.pool_backdoor_id) : null;
  const netPick = pick.net_pick_id ? survivorMap.get(pick.net_pick_id) : null;
  const correctNet = netAnswer ? survivorMap.get(netAnswer.correct_survivor_id) : null;

  // Outcome resolution — only meaningful for fully-scored episodes.
  // For an episode being revealed at picks-lock time (before airing),
  // survivors may not yet have eliminated_episode set; the UI treats
  // those as "pending" rather than survived/eliminated.
  const isEpisodeScored = episode < currentEpisode;

  const captainEliminatedThisEp = captain?.eliminated_episode === episode;
  const captainLostFlag = score?.captain_lost || false;

  // Pool outcome
  let poolOutcome: 'survived' | 'drowned' | 'pending' = 'pending';
  if (isEpisodeScored && poolPick) {
    const elim = poolPick.eliminated_episode;
    poolOutcome = (elim !== null && elim <= episode) ? 'drowned' : 'survived';
  }

  // Backdoor outcome — correct if the named survivor was eliminated this episode
  let backdoorOutcome: 'correct' | 'wrong' | 'pending' = 'pending';
  if (isEpisodeScored && backdoor) {
    backdoorOutcome = (backdoor.eliminated_episode === episode) ? 'correct' : 'wrong';
  }

  // NET outcome
  let netOutcome: 'correct' | 'wrong' | 'pending' = 'pending';
  if (netAnswer && netPick) {
    netOutcome = (pick.net_pick_id === netAnswer.correct_survivor_id) ? 'correct' : 'wrong';
  } else if (isEpisodeScored && score) {
    netOutcome = score.net_correct ? 'correct' : 'wrong';
  }

  const totalPts = score?.fantasy_points;

  // Chip details
  let chipDetail: React.ReactNode = null;
  if (pick.chip_played) {
    const chipName = CHIP_NAMES[pick.chip_played] || `Chip ${pick.chip_played}`;
    const chipIcon = CHIP_ICONS[pick.chip_played] || '🎰';

    if (pick.chip_played === 1 && pick.chip_target) {
      // Assistant Manager — target is a manager name
      chipDetail = (
        <span className="text-[11px] text-white/70">
          Copied <b className="text-yellow-300">{pick.chip_target}</b>
        </span>
      );
    } else if (pick.chip_played === 4 && pick.swap_out_ids?.length && pick.swap_in_ids?.length) {
      // Swap Out
      const outs = pick.swap_out_ids.map(id => survivorMap.get(id)?.name || '?');
      const ins  = pick.swap_in_ids.map(id => survivorMap.get(id)?.name || '?');
      chipDetail = (
        <div className="flex flex-col gap-0.5">
          {outs.map((o, i) => (
            <div key={i} className="flex items-center gap-1 text-[11px]">
              <span className="text-white/30 line-through">{o}</span>
              <span className="text-white/30">→</span>
              <span className="text-blue-300 font-semibold">{ins[i] || '?'}</span>
            </div>
          ))}
        </div>
      );
    } else if (pick.chip_played === 5 && pick.player_add_id) {
      const added = survivorMap.get(pick.player_add_id);
      chipDetail = (
        <span className="text-[11px]">
          Added <b style={{ color: '#9B59B6' }}>{added?.name || '?'}</b>
          {added && <span className="text-white/40 ml-1">({added.tribe})</span>}
        </span>
      );
    } else {
      chipDetail = <span className="text-[11px] text-white/50">{chipName}</span>;
    }

    chipDetail = (
      <div className="flex items-start gap-2 pt-2 mt-1 border-t border-white/[0.04]">
        <span className="text-[14px] flex-shrink-0">{chipIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold tracking-widest text-white/30 uppercase">{chipName}</div>
          <div className="mt-0.5">{chipDetail}</div>
          {score?.chip_bonus !== undefined && score.chip_bonus !== 0 && (
            <div className="text-[10px] font-bold mt-0.5" style={{ color: score.chip_bonus > 0 ? '#1ABC9C' : '#E74C3C' }}>
              {score.chip_bonus > 0 ? '+' : ''}{score.chip_bonus} pts
            </div>
          )}
        </div>
      </div>
    );
  }

  const rankBadge = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

  return (
    <div className="rounded-xl p-3 border" style={{
      background: 'rgba(255,255,255,0.02)',
      borderColor: rank <= 3 ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-white/[0.05]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold w-4 text-center" style={{ color: rank <= 3 ? '#FFD54F' : 'rgba(255,255,255,0.3)' }}>
            {rankBadge}
          </span>
          <span className="text-[13px] font-extrabold text-white">{manager.name}</span>
        </div>
        <div className="text-right">
          {totalPts !== undefined ? (
            <span className="text-[15px] font-extrabold" style={{ color: totalPts >= 30 ? '#1ABC9C' : totalPts >= 15 ? '#FFD54F' : totalPts > 0 ? 'rgba(255,255,255,0.6)' : '#E74C3C' }}>
              {totalPts > 0 ? '+' : ''}{totalPts}
            </span>
          ) : (
            <span className="text-[10px] text-white/30 font-bold">TBD</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* Captain */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] flex-shrink-0">👑</span>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {captain ? (
              <>
                <Avatar name={captain.name} tribe={captain.tribe} sz={18} />
                <span className="text-[12px] font-semibold text-white truncate">{captain.name}</span>
                <span className="text-[9px] font-bold" style={{ color: TC[captain.tribe] }}>{captain.tribe.toUpperCase()}</span>
                {captainLostFlag && <span className="text-[10px]" title="Captain privilege lost this episode">💀</span>}
                {captainEliminatedThisEp && !captainLostFlag && <span className="text-[10px]">💀</span>}
              </>
            ) : (
              <span className="text-[11px] text-white/30 italic">No captain (privilege lost)</span>
            )}
          </div>
        </div>

        {/* Pool */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] flex-shrink-0">🌊</span>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {poolPick ? (
              <>
                <Avatar name={poolPick.name} tribe={poolPick.tribe} sz={18} />
                <span className="text-[12px] font-semibold truncate" style={{
                  color: poolOutcome === 'drowned' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)',
                  textDecoration: poolOutcome === 'drowned' ? 'line-through' : 'none',
                }}>
                  {poolPick.name}
                </span>
                {poolOutcome === 'survived' && <span className="text-[10px]" style={{ color: '#1ABC9C' }}>✓</span>}
                {poolOutcome === 'drowned' && <span className="text-[10px]" style={{ color: '#E74C3C' }}>✗ drowned</span>}
              </>
            ) : backdoor ? (
              <>
                <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,107,53,0.15)', color: '#FF6B35' }}>BACKDOOR</span>
                <Avatar name={backdoor.name} tribe={backdoor.tribe} sz={18} />
                <span className="text-[12px] font-semibold text-white/85 truncate">{backdoor.name}</span>
                {backdoorOutcome === 'correct' && <span className="text-[10px]" style={{ color: '#1ABC9C' }}>↩ reactivated</span>}
                {backdoorOutcome === 'wrong' && <span className="text-[10px]" style={{ color: '#E74C3C' }}>✗ wrong</span>}
              </>
            ) : (
              <span className="text-[11px] text-white/30 italic">No pool pick</span>
            )}
          </div>
        </div>

        {/* NET */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] flex-shrink-0">💬</span>
          <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
            {netPick ? (
              <>
                <Avatar name={netPick.name} tribe={netPick.tribe} sz={18} />
                <span className="text-[12px] font-semibold truncate" style={{
                  color: netOutcome === 'wrong' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.85)',
                }}>
                  {netPick.name}
                </span>
                {netOutcome === 'correct' && <span className="text-[10px] font-bold" style={{ color: '#1ABC9C' }}>✓ +3</span>}
                {netOutcome === 'wrong' && correctNet && (
                  <span className="text-[10px] text-white/40">(was {correctNet.name})</span>
                )}
              </>
            ) : (
              <span className="text-[11px] text-white/30 italic">No NET pick</span>
            )}
          </div>
        </div>

        {/* Chip */}
        {chipDetail}
      </div>
    </div>
  );
}

// ============================================================
// Quinfecta Card (one per manager)
// ============================================================
function QuinfectaCard({
  manager, pred, survivorMap, rank,
}: {
  manager: Manager;
  pred: QuinfectaPrediction | undefined;
  survivorMap: Map<string, Survivor>;
  rank: number;
}) {
  if (!pred) {
    return (
      <div className="rounded-xl p-4 border" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-bold text-white/40">{manager.name}</span>
          <span className="text-[10px] text-white/20 italic">No prediction submitted</span>
        </div>
      </div>
    );
  }

  const slots = [
    { ...QUINFECTA_PLACES[0], id: pred.place_20_id },
    { ...QUINFECTA_PLACES[1], id: pred.place_21_id },
    { ...QUINFECTA_PLACES[2], id: pred.place_22_id },
    { ...QUINFECTA_PLACES[3], id: pred.place_23_id },
    { ...QUINFECTA_PLACES[4], id: pred.place_24_id },
  ];

  return (
    <div className="rounded-xl p-3 border" style={{
      background: 'rgba(155,89,182,0.04)',
      borderColor: 'rgba(155,89,182,0.2)',
    }}>
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold w-4 text-center text-white/30">#{rank}</span>
          <span className="text-[13px] font-extrabold text-white">{manager.name}</span>
        </div>
        <span className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded" style={{ background: 'rgba(155,89,182,0.15)', color: '#9B59B6' }}>
          🎯 QUINFECTA
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {slots.map(slot => {
          const s = slot.id ? survivorMap.get(slot.id) : null;
          return (
            <div key={slot.idx} className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="text-[10px] font-bold tracking-wider text-white/40" style={{ minWidth: '52px' }}>{slot.label}</span>
                {s ? (
                  <>
                    <Avatar name={s.name} tribe={s.tribe} sz={18} />
                    <span className="text-[12px] font-semibold text-white truncate">{s.name}</span>
                  </>
                ) : (
                  <span className="text-[11px] text-white/30 italic">—</span>
                )}
              </div>
              <span className="text-[10px] font-bold flex-shrink-0" style={{ color: slot.color }}>+{slot.points}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================
function RevealsContent() {
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState<any>(null);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [picks, setPicks] = useState<WeeklyPick[]>([]);
  const [scores, setScores] = useState<ManagerScore[]>([]);
  const [netAnswers, setNetAnswers] = useState<NetAnswer[]>([]);
  const [quinfectaPreds, setQuinfectaPreds] = useState<QuinfectaPrediction[]>([]);
  const [selectedTab, setSelectedTab] = useState<number | 'quinfecta' | null>(null);
  const [isPastDeadline, setIsPastDeadline] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [seasonRes, managersRes, survivorsRes, picksRes, scoresRes, netRes, qRes] = await Promise.all([
        supabase.from('seasons').select('*').eq('id', SEASON_ID).single(),
        supabase.from('managers').select('id, name, draft_position').eq('season_id', SEASON_ID).order('draft_position'),
        supabase.from('survivors').select('id, name, tribe, is_active, eliminated_episode').eq('season_id', SEASON_ID),
        supabase.from('weekly_picks').select('manager_id, episode, captain_id, pool_pick_id, pool_backdoor_id, net_pick_id, chip_played, chip_target, swap_out_ids, swap_in_ids, player_add_id').eq('season_id', SEASON_ID).order('episode'),
        supabase.from('manager_scores').select('manager_id, episode, fantasy_points, net_correct, captain_lost, chip_bonus').eq('season_id', SEASON_ID),
        supabase.from('net_answers').select('episode, correct_survivor_id').eq('season_id', SEASON_ID),
        supabase.from('quinfecta_predictions').select('manager_id, place_20_id, place_21_id, place_22_id, place_23_id, place_24_id').eq('season_id', SEASON_ID),
      ]);

      setSeason(seasonRes.data);
      setManagers(managersRes.data || []);
      setSurvivors(survivorsRes.data || []);
      setPicks((picksRes.data || []) as WeeklyPick[]);
      setScores((scoresRes.data || []) as ManagerScore[]);
      setNetAnswers(netRes.data || []);
      setQuinfectaPreds((qRes.data || []) as QuinfectaPrediction[]);
    } catch (err) {
      console.error('Failed to load reveals:', err);
    } finally {
      setLoading(false);
    }
  }

// Lock check — picks for current_episode lock at Wed 7pm CT (= Thu 00:00 UTC)
  // and stay locked until current_episode advances (Calculate runs after the
  // episode airs and scores). The original deadline check was scoped to the
  // upcoming Wed and incorrectly flipped back to "not locked" once Thursday
  // started, hiding the just-locked episode from reveals all week.
  //
  // Simpler rule: it's "locked" any UTC day except Wednesday itself
  // (Wed UTC = Tue 7pm CT through Wed 6:59pm CT — the picks-open window).
  useEffect(() => {
    if (!season) return;
    const check = () => {
      setIsPastDeadline(new Date().getUTCDay() !== 3);
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [season]);

  const currentEp = season?.current_episode || 1;
  const totalEps = season?.total_episodes || 13;
  const isFinaleRevealed = (currentEp > totalEps) || (currentEp === totalEps && isPastDeadline);

  const allEpisodes = useMemo(() => {
    return Array.from(new Set(picks.map(p => p.episode))).sort((a, b) => a - b);
  }, [picks]);

  // An episode is "revealed" when its picks lock has passed.
  // - Past episodes (ep < currentEp): always revealed
  // - Current episode: revealed only after Wed 7pm CT
  const revealedEpisodes = useMemo(() => {
    return allEpisodes.filter(ep => {
      if (ep < currentEp) return true;
      if (ep === currentEp) return isPastDeadline;
      return false;
    });
  }, [allEpisodes, currentEp, isPastDeadline]);

  // Default to the latest revealed episode
  useEffect(() => {
    if (selectedTab === null && revealedEpisodes.length > 0) {
      setSelectedTab(revealedEpisodes[revealedEpisodes.length - 1]);
    }
  }, [revealedEpisodes, selectedTab]);

  const survivorMap = useMemo(() => {
    const m = new Map<string, Survivor>();
    survivors.forEach(s => m.set(s.id, s));
    return m;
  }, [survivors]);

  const managerMap = useMemo(() => {
    const m = new Map<string, Manager>();
    managers.forEach(mgr => m.set(mgr.id, mgr));
    return m;
  }, [managers]);

  // Sort cards by fantasy points for the selected episode (high to low)
  function sortedManagerCards(ep: number) {
    const epPicks = picks.filter(p => p.episode === ep);
    return managers.map(mgr => {
      const pick = epPicks.find(p => p.manager_id === mgr.id);
      const score = scores.find(s => s.manager_id === mgr.id && s.episode === ep);
      return { mgr, pick, score };
    }).sort((a, b) => {
      const aPts = a.score?.fantasy_points ?? -9999;
      const bPts = b.score?.fantasy_points ?? -9999;
      return bPts - aPts;
    });
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4 animate-pulse">🔓</div>
        <p className="text-white/30 text-sm">Loading reveals...</p>
      </div>
    );
  }

  if (revealedEpisodes.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-2xl font-extrabold text-white mb-2">Pick Reveals</h1>
        <p className="text-white/30 text-sm">No picks have locked yet. Check back after Wednesday 7pm CT.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-extrabold text-white tracking-wider">🔓 Pick Reveals</h1>
        <p className="text-white/25 text-xs mt-1">
          Once Wednesday&apos;s deadline passes, every manager&apos;s picks become visible. See how the league bet each week.
        </p>
      </div>

      {/* Episode Selector */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {revealedEpisodes.map(ep => {
          const isSelected = selectedTab === ep;
          const isLatest = ep === revealedEpisodes[revealedEpisodes.length - 1];
          return (
            <button
              key={ep}
              onClick={() => setSelectedTab(ep)}
              className="px-3 py-1.5 text-[11px] font-bold rounded-md tracking-wider cursor-pointer border-none transition-all"
              style={{
                background: isSelected ? 'rgba(255,107,53,0.15)' : 'rgba(255,255,255,0.03)',
                color: isSelected ? '#FF6B35' : isLatest ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)',
              }}
            >
              E{ep}
            </button>
          );
        })}
        {isFinaleRevealed && quinfectaPreds.length > 0 && (
          <button
            onClick={() => setSelectedTab('quinfecta')}
            className="px-3 py-1.5 text-[11px] font-bold rounded-md tracking-wider cursor-pointer border-none transition-all"
            style={{
              background: selectedTab === 'quinfecta' ? 'rgba(155,89,182,0.15)' : 'rgba(155,89,182,0.05)',
              color: selectedTab === 'quinfecta' ? '#9B59B6' : 'rgba(155,89,182,0.5)',
            }}
          >
            🎯 QUINFECTA
          </button>
        )}
      </div>

      {/* Status indicator for current ep if it just unlocked */}
      {typeof selectedTab === 'number' && selectedTab === currentEp && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)' }}>
          <span className="text-[11px] font-bold tracking-wider" style={{ color: '#FFD54F' }}>
            🔓 PICKS LOCKED — Episode {selectedTab}
          </span>
          <p className="text-[11px] text-white/40 mt-0.5">
            Outcomes will update as the episode airs and scoring runs.
          </p>
        </div>
      )}

      {/* Reveal content */}
      {selectedTab === 'quinfecta' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {managers.map((mgr, i) => {
            const pred = quinfectaPreds.find(q => q.manager_id === mgr.id);
            return (
              <QuinfectaCard
                key={mgr.id}
                manager={mgr}
                pred={pred}
                survivorMap={survivorMap}
                rank={i + 1}
              />
            );
          })}
        </div>
      ) : typeof selectedTab === 'number' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedManagerCards(selectedTab).map(({ mgr, pick, score }, i) => (
            <ManagerRevealCard
              key={mgr.id}
              manager={mgr}
              pick={pick}
              score={score}
              netAnswer={netAnswers.find(a => a.episode === selectedTab)}
              episode={selectedTab}
              currentEpisode={currentEp}
              survivorMap={survivorMap}
              managerMap={managerMap}
              rank={i + 1}
            />
          ))}
        </div>
      ) : null}

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-white/[0.05] flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/30">
        <span>👑 Captain (2× pts)</span>
        <span>🌊 Pool pick</span>
        <span>💬 NET pick</span>
        <span>🎰 Chip played</span>
        <span style={{ color: '#1ABC9C' }}>✓ Correct / survived</span>
        <span style={{ color: '#E74C3C' }}>✗ Wrong / drowned</span>
        <span>💀 Captain eliminated</span>
        <span>↩ Backdoor reactivation</span>
      </div>
    </div>
  );
}

// ============================================================
// Page
// ============================================================
export default function RevealsPage() {
  return (
    <AuthGuard>
      <RevealsContent />
    </AuthGuard>
  );
}
