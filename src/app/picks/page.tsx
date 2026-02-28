'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID, TRIBE_COLORS, CHIPS } from '@/lib/constants';

// ============================================================
// Types
// ============================================================
interface Survivor {
  id: string;
  name: string;
  full_name: string;
  tribe: string;
  is_active: boolean;
  photo_url: string;
}

interface Manager {
  id: string;
  name: string;
  is_commissioner: boolean;
}

interface TeamMember {
  survivor_id: string;
  survivors: Survivor;
}

interface PoolStatus {
  status: string;
  has_immunity_idol: boolean;
  idol_used: boolean;
}

interface WeeklyPick {
  id: string;
  captain_id: string | null;
  pool_pick_id: string | null;
  pool_backdoor_id: string | null;
  net_pick_id: string | null;
  chip_played: number | null;
  chip_target: string | null;
  is_locked: boolean;
}

// ============================================================
// Helper Components
// ============================================================
function Avatar({ name, tribe, size = 32 }: { name: string; tribe: string; size?: number }) {
  const initial = name.startsWith('"') ? 'Q' : name[0];
  const color = TRIBE_COLORS[tribe] || '#666';
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}44, ${color}77)`,
        border: `1.5px solid ${color}`,
      }}
    >
      <span className="font-extrabold text-white" style={{ fontSize: size * 0.42 }}>
        {initial}
      </span>
    </div>
  );
}

function Section({
  title,
  icon,
  badge,
  badgeColor,
  children,
}: {
  title: string;
  icon: string;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}) {
  const color = badgeColor || '#FF6B35';
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 mb-3.5">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="m-0 text-sm font-bold tracking-wider text-white/50 uppercase">{title}</h3>
        </div>
        {badge && (
          <span
            className="text-[10px] font-bold px-2.5 py-0.5 rounded-full tracking-wider"
            style={{
              background: `${color}15`,
              color: color,
              border: `1px solid ${color}30`,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function SurvivorOption({
  survivor,
  selected,
  onClick,
  disabled,
}: {
  survivor: Survivor;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const color = TRIBE_COLORS[survivor.tribe] || '#666';
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all cursor-pointer"
      style={{
        background: selected ? `${color}12` : 'rgba(255,255,255,0.02)',
        border: selected ? `1px solid ${color}50` : '1px solid rgba(255,255,255,0.04)',
        opacity: disabled && !selected ? 0.3 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <Avatar name={survivor.name} tribe={survivor.tribe} size={28} />
      <div className="flex-1">
        <div className={`text-[13px] font-semibold ${selected ? 'text-white' : 'text-white/70'}`}>
          {survivor.name}
        </div>
        <div className="text-[10px] font-bold tracking-wider" style={{ color }}>
          {survivor.tribe.toUpperCase()}
        </div>
      </div>
      {selected && (
        <div
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center"
          style={{ background: color }}
        >
          <span className="text-white text-[11px] font-extrabold">✓</span>
        </div>
      )}
    </div>
  );
}

function TribeFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-0.5 mb-2.5 bg-white/[0.03] rounded-md p-0.5 w-fit">
      {['All', 'Vatu', 'Kalo', 'Cila'].map((t) => {
        const active = value === t;
        const color = t === 'All' ? '#fff' : TRIBE_COLORS[t];
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className="px-2.5 py-1 text-[10px] font-semibold border-none rounded cursor-pointer transition-all"
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
  );
}

// ============================================================
// Main Component
// ============================================================
export default function WeeklyPicksPage() {
  // ---- State ----
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Data from Supabase
  const [currentEpisode, setCurrentEpisode] = useState(2);
  const [myManager, setMyManager] = useState<Manager | null>(null);
  const [allManagers, setAllManagers] = useState<Manager[]>([]);
  const [myTeam, setMyTeam] = useState<Survivor[]>([]);
  const [allSurvivors, setAllSurvivors] = useState<Survivor[]>([]);
  const [poolStatus, setPoolStatus] = useState<PoolStatus | null>(null);
  const [usedPoolPicks, setUsedPoolPicks] = useState<string[]>([]);
  const [usedChips, setUsedChips] = useState<number[]>([]);
  const [existingPick, setExistingPick] = useState<WeeklyPick | null>(null);

  // Pick selections
  const [captain, setCaptain] = useState<string | null>(null);
  const [poolPick, setPoolPick] = useState<string | null>(null);
  const [backdoorPick, setBackdoorPick] = useState<string | null>(null);
  const [netPick, setNetPick] = useState<string | null>(null);
  const [chipPlay, setChipPlay] = useState<number | null>(null);
  const [chipTarget, setChipTarget] = useState<string | null>(null);

  // Filters
  const [poolFilter, setPoolFilter] = useState('All');
  const [netFilter, setNetFilter] = useState('All');

  // Commissioner mode: pick on behalf of managers
  const [selectedManager, setSelectedManager] = useState<string | null>(null);

  // ---- Computed: which manager are we editing picks for ----
  const activeManagerId = selectedManager || myManager?.id || null;

  // ---- Load Data ----
  useEffect(() => {
    loadData();
  }, []);

  // Reload picks when activeManagerId changes (commissioner switching managers)
  useEffect(() => {
    if (activeManagerId && currentEpisode) {
      loadPicksForManager(activeManagerId, currentEpisode);
    }
  }, [activeManagerId, currentEpisode]);

  async function loadData() {
    try {
      setLoading(true);

      // Fetch season info
      const { data: season } = await supabase
        .from('seasons')
        .select('current_episode')
        .eq('id', SEASON_ID)
        .single();
      
      const episode = season?.current_episode || 2;
      setCurrentEpisode(episode);

      // Fetch all survivors
      const { data: survivors } = await supabase
        .from('survivors')
        .select('*')
        .eq('season_id', SEASON_ID)
        .order('name');
      
      setAllSurvivors(survivors || []);

      // Fetch all managers
      const { data: managers } = await supabase
        .from('managers')
        .select('id, name, is_commissioner')
        .eq('season_id', SEASON_ID)
        .order('draft_position');
      
      setAllManagers(managers || []);

      // For now, default to Ramu (commissioner) — will use auth later
      const me = managers?.find((m) => m.is_commissioner) || managers?.[0];
      setMyManager(me || null);

      if (me) {
        // Fetch my team
        const { data: team } = await supabase
          .from('teams')
          .select('survivor_id, survivors(*)')
          .eq('season_id', SEASON_ID)
          .eq('manager_id', me.id)
          .eq('is_active', true);
        
        const teamSurvivors = (team || []).map((t: any) => t.survivors).filter(Boolean);
        setMyTeam(teamSurvivors);

        await loadPicksForManager(me.id, episode);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function loadPicksForManager(managerId: string, episode: number) {
    // Fetch pool status
    const { data: ps } = await supabase
      .from('pool_status')
      .select('status, has_immunity_idol, idol_used')
      .eq('season_id', SEASON_ID)
      .eq('manager_id', managerId)
      .single();
    
    setPoolStatus(ps || { status: 'active', has_immunity_idol: false, idol_used: false });

    // Fetch previously used pool picks (from all prior episodes)
    const { data: priorPicks } = await supabase
      .from('weekly_picks')
      .select('pool_pick_id')
      .eq('season_id', SEASON_ID)
      .eq('manager_id', managerId)
      .lt('episode', episode)
      .not('pool_pick_id', 'is', null);
    
    setUsedPoolPicks((priorPicks || []).map((p: any) => p.pool_pick_id));

    // Fetch used chips
    const { data: chips } = await supabase
      .from('chips_used')
      .select('chip_id')
      .eq('season_id', SEASON_ID)
      .eq('manager_id', managerId);
    
    setUsedChips((chips || []).map((c: any) => c.chip_id));

    // Fetch existing picks for this episode
    const { data: existing } = await supabase
      .from('weekly_picks')
      .select('*')
      .eq('season_id', SEASON_ID)
      .eq('manager_id', managerId)
      .eq('episode', episode)
      .single();
    
    if (existing) {
      setExistingPick(existing);
      setCaptain(existing.captain_id);
      setPoolPick(existing.pool_pick_id);
      setBackdoorPick(existing.pool_backdoor_id);
      setNetPick(existing.net_pick_id);
      setChipPlay(existing.chip_played);
      setChipTarget(existing.chip_target);
      if (existing.is_locked) {
        setSubmitted(true);
      }
    } else {
      // Reset picks
      setExistingPick(null);
      setCaptain(null);
      setPoolPick(null);
      setBackdoorPick(null);
      setNetPick(null);
      setChipPlay(null);
      setChipTarget(null);
      setSubmitted(false);
    }

    // If commissioner switches manager, load that manager's team
    if (managerId !== myManager?.id) {
      const { data: team } = await supabase
        .from('teams')
        .select('survivor_id, survivors(*)')
        .eq('season_id', SEASON_ID)
        .eq('manager_id', managerId)
        .eq('is_active', true);
      
      setMyTeam((team || []).map((t: any) => t.survivors).filter(Boolean));
    }
  }

  // ---- Computed values ----
  const activeSurvivors = useMemo(
    () => allSurvivors.filter((s) => s.is_active),
    [allSurvivors]
  );

  const poolSurvivors = useMemo(() => {
    let available = activeSurvivors.filter((s) => !usedPoolPicks.includes(s.id));
    if (poolFilter !== 'All') available = available.filter((s) => s.tribe === poolFilter);
    return available;
  }, [activeSurvivors, usedPoolPicks, poolFilter]);

  const netSurvivors = useMemo(() => {
    if (netFilter === 'All') return activeSurvivors;
    return activeSurvivors.filter((s) => s.tribe === netFilter);
  }, [activeSurvivors, netFilter]);

  // Determine which chip window is active
  const currentWeek = currentEpisode; // episode ~= week for chip purposes
  const availableChips = CHIPS.filter((c) => {
    if (usedChips.includes(c.id)) return false;
    const [lo, hi] = c.window.replace('Week ', '').split('-').map(Number);
    return currentWeek >= lo && currentWeek <= hi;
  });

  const isPoolActive = poolStatus?.status === 'active';
  const isDrowned = poolStatus?.status === 'drowned';
  const isBurnt = poolStatus?.status === 'burnt';

  // Required picks check
  const picksComplete = captain !== null && ((!isPoolActive && !isDrowned) || isPoolActive ? poolPick !== null : isDrowned ? backdoorPick !== null : true);

  // ---- Submit Picks ----
  async function handleSubmit() {
    if (!activeManagerId || saving) return;
    
    try {
      setSaving(true);
      setError(null);

      const pickData = {
        season_id: SEASON_ID,
        manager_id: activeManagerId,
        episode: currentEpisode,
        captain_id: captain,
        pool_pick_id: isPoolActive ? poolPick : null,
        pool_backdoor_id: isDrowned ? backdoorPick : null,
        net_pick_id: netPick,
        chip_played: chipPlay,
        chip_target: chipPlay === 1 ? chipTarget : null,
        submitted_at: new Date().toISOString(),
        is_locked: false,
      };

      let result;
      if (existingPick) {
        // Update existing
        result = await supabase
          .from('weekly_picks')
          .update(pickData)
          .eq('id', existingPick.id);
      } else {
        // Insert new
        result = await supabase
          .from('weekly_picks')
          .insert(pickData);
      }

      if (result.error) throw result.error;

      // If a chip was played, record it in chips_used (if not already there)
      if (chipPlay && !usedChips.includes(chipPlay)) {
        await supabase.from('chips_used').insert({
          season_id: SEASON_ID,
          manager_id: activeManagerId,
          chip_id: chipPlay,
          episode: currentEpisode,
          target: chipTarget,
        });
      }

      // Log activity
      const managerName = allManagers.find((m) => m.id === activeManagerId)?.name || 'Unknown';
      await supabase.from('activity_log').insert({
        season_id: SEASON_ID,
        type: 'chip',
        message: `${managerName} submitted picks for Episode ${currentEpisode}`,
        manager_id: activeManagerId,
        metadata: { episode: currentEpisode },
      });

      setSubmitted(true);
      setSuccessMsg('Picks submitted successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit picks');
    } finally {
      setSaving(false);
    }
  }

  // ---- Edit mode (after submission) ----
  function handleEdit() {
    setSubmitted(false);
  }

  // ---- Deadline display ----
  const deadlineStr = `Wed · 7:00 PM CT`;

  // ---- Render ----
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="text-4xl mb-4 animate-pulse">🔥</div>
        <p className="text-white/30 text-sm">Loading picks...</p>
      </div>
    );
  }

  // Submitted confirmation view
  if (submitted) {
    const captainSurvivor = myTeam.find((s) => s.id === captain);
    const poolSurvivor = allSurvivors.find((s) => s.id === poolPick);
    const backdoorSurvivor = allSurvivors.find((s) => s.id === backdoorPick);
    const netSurvivor = allSurvivors.find((s) => s.id === netPick);
    const chipInfo = chipPlay ? CHIPS.find((c) => c.id === chipPlay) : null;

    return (
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔥</div>
          <h1 className="text-2xl font-extrabold text-white tracking-wider mb-2">Picks Submitted!</h1>
          <p className="text-white/40 text-sm">
            Episode {currentEpisode} picks are in. You can edit them until the deadline.
          </p>
        </div>

        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06] mb-6">
          {/* Captain */}
          <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
            <span className="text-xs text-white/35">👑 Captain</span>
            <span className="text-xs font-bold" style={{ color: TRIBE_COLORS[captainSurvivor?.tribe || ''] }}>
              {captainSurvivor?.name || '—'}
            </span>
          </div>
          {/* Pool */}
          {isPoolActive && (
            <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
              <span className="text-xs text-white/35">🌊 Pool Pick</span>
              <span className="text-xs font-bold" style={{ color: TRIBE_COLORS[poolSurvivor?.tribe || ''] }}>
                {poolSurvivor?.name || '—'}
              </span>
            </div>
          )}
          {isDrowned && (
            <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
              <span className="text-xs text-white/35">🚪 Backdoor Guess</span>
              <span className="text-xs font-bold text-red-400">
                {backdoorSurvivor?.name || '—'}
              </span>
            </div>
          )}
          {/* NET */}
          <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
            <span className="text-xs text-white/35">💬 NET Guess</span>
            <span className="text-xs font-bold" style={{ color: TRIBE_COLORS[netSurvivor?.tribe || ''] }}>
              {netSurvivor?.name || '—'}
            </span>
          </div>
          {/* Chip */}
          <div className="flex justify-between py-1.5">
            <span className="text-xs text-white/35">🎰 Chip</span>
            <span className={`text-xs font-bold ${chipInfo ? 'text-yellow-300' : 'text-white/20'}`}>
              {chipInfo ? `${chipInfo.icon} ${chipInfo.name}${chipTarget ? ` → ${allManagers.find(m => m.id === chipTarget)?.name || chipTarget}` : ''}` : 'None'}
            </span>
          </div>
        </div>

        <button
          onClick={handleEdit}
          className="w-full py-3 rounded-lg border border-white/10 bg-white/[0.03] text-white/60 font-bold text-sm tracking-wider hover:bg-white/[0.06] transition-all cursor-pointer"
        >
          ✏️ Edit Picks
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-xl font-extrabold text-white tracking-wider mb-1">
          Episode {currentEpisode} Picks
        </h1>
        <p className="text-white/25 text-xs">
          Due {deadlineStr} · {myManager?.is_commissioner ? 'Commissioner Mode' : (allManagers.find(m => m.id === activeManagerId)?.name || '')}
        </p>
      </div>

      {/* Commissioner: manager selector */}
      {myManager?.is_commissioner && (
        <div className="bg-orange-500/[0.06] border border-orange-500/20 rounded-xl p-4 mb-4">
          <div className="text-[10px] font-bold tracking-widest text-orange-400/60 uppercase mb-2">
            Commissioner — Submit picks for:
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
            {allManagers.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setSelectedManager(m.id === myManager?.id ? null : m.id);
                  setSubmitted(false);
                }}
                className="px-2 py-1.5 rounded-md text-xs font-semibold border transition-all cursor-pointer"
                style={{
                  background: (activeManagerId === m.id) ? 'rgba(255,107,53,0.15)' : 'rgba(255,255,255,0.02)',
                  borderColor: (activeManagerId === m.id) ? 'rgba(255,107,53,0.4)' : 'rgba(255,255,255,0.06)',
                  color: (activeManagerId === m.id) ? '#FF6B35' : 'rgba(255,255,255,0.4)',
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error / Success messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-red-400 text-xs">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4 text-green-400 text-xs">
          {successMsg}
        </div>
      )}

      {/* Captain */}
      <Section
        title="Captain Designation"
        icon="👑"
        badge={captain ? 'SELECTED' : 'REQUIRED'}
        badgeColor={captain ? '#FFD54F' : '#FF6B35'}
      >
        <p className="text-xs text-white/30 mb-3 leading-relaxed">
          Select one survivor from your team to earn <strong className="text-yellow-300">2× points</strong> this episode.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {myTeam
            .filter((s) => s.is_active)
            .map((s) => (
              <SurvivorOption
                key={s.id}
                survivor={s}
                selected={captain === s.id}
                onClick={() => setCaptain(captain === s.id ? null : s.id)}
              />
            ))}
        </div>
        {myTeam.filter((s) => s.is_active).length === 0 && (
          <p className="text-xs text-white/20 italic">No active survivors on your team.</p>
        )}
      </Section>

      {/* Pool */}
      <Section
        title="Survivor Pool"
        icon="🌊"
        badge={
          isBurnt ? 'BURNT' :
          isDrowned ? 'BACKDOOR MODE' :
          poolPick ? 'SELECTED' : 'REQUIRED'
        }
        badgeColor={
          isBurnt ? '#95a5a6' :
          isDrowned ? '#E74C3C' :
          poolPick ? '#1ABC9C' : '#FF6B35'
        }
      >
        {isPoolActive ? (
          <>
            <p className="text-xs text-white/30 mb-3 leading-relaxed">
              Pick one survivor who you think will <strong className="text-emerald-400">NOT be eliminated</strong>.
              Previously used picks are excluded.
              {poolStatus?.has_immunity_idol && !poolStatus?.idol_used && (
                <span className="text-yellow-300"> 🛡️ Immunity Idol active.</span>
              )}
            </p>
            <TribeFilter value={poolFilter} onChange={setPoolFilter} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
              {poolSurvivors.map((s) => (
                <SurvivorOption
                  key={s.id}
                  survivor={s}
                  selected={poolPick === s.id}
                  onClick={() => setPoolPick(poolPick === s.id ? null : s.id)}
                />
              ))}
            </div>
            {poolSurvivors.length === 0 && (
              <p className="text-xs text-white/20 italic">
                No available survivors for this filter.
              </p>
            )}
          </>
        ) : isDrowned ? (
          <>
            <p className="text-xs text-white/30 mb-3 leading-relaxed">
              You&apos;ve been <strong className="text-red-400">Drowned</strong>. Guess who{' '}
              <strong className="text-red-400">WILL be eliminated</strong> to get back in.
            </p>
            <TribeFilter value={poolFilter} onChange={setPoolFilter} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
              {(poolFilter === 'All' ? activeSurvivors : activeSurvivors.filter(s => s.tribe === poolFilter)).map((s) => (
                <SurvivorOption
                  key={s.id}
                  survivor={s}
                  selected={backdoorPick === s.id}
                  onClick={() => setBackdoorPick(backdoorPick === s.id ? null : s.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-white/25 italic">
            You have no valid picks remaining this season.
          </p>
        )}
      </Section>

      {/* NET */}
      <Section
        title="Next Episode Title (NET)"
        icon="💬"
        badge={netPick ? 'SELECTED' : 'OPTIONAL'}
        badgeColor={netPick ? '#1ABC9C' : 'rgba(255,255,255,0.2)'}
      >
        <p className="text-xs text-white/30 mb-3 leading-relaxed">
          Guess which survivor says the quote that becomes the episode title.{' '}
          <strong className="text-yellow-300">3 points</strong> if correct.
        </p>
        <TribeFilter value={netFilter} onChange={setNetFilter} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
          {netSurvivors.map((s) => (
            <SurvivorOption
              key={s.id}
              survivor={s}
              selected={netPick === s.id}
              onClick={() => setNetPick(netPick === s.id ? null : s.id)}
            />
          ))}
        </div>
      </Section>

      {/* Chips */}
      <Section
        title="Game Chip"
        icon="🎰"
        badge={
          chipPlay
            ? CHIPS.find((c) => c.id === chipPlay)?.name
            : availableChips.length > 0
            ? `${availableChips.length} available`
            : 'No chip this week'
        }
        badgeColor={chipPlay ? '#FFD54F' : availableChips.length > 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)'}
      >
        {availableChips.length > 0 ? (
          <>
            <p className="text-xs text-white/30 mb-3 leading-relaxed">
              Playing a chip is optional and <strong className="text-white/50">cannot be undone</strong> after the deadline.
            </p>
            {availableChips.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  setChipPlay(chipPlay === c.id ? null : c.id);
                  if (chipPlay === c.id) setChipTarget(null);
                }}
                className="flex items-center gap-3 p-3.5 rounded-lg cursor-pointer transition-all mb-1.5"
                style={{
                  background: chipPlay === c.id ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.02)',
                  border: chipPlay === c.id ? '1px solid rgba(255,215,0,0.25)' : '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <span className="text-2xl">{c.icon}</span>
                <div className="flex-1">
                  <div className={`text-sm font-bold ${chipPlay === c.id ? 'text-yellow-300' : 'text-white'}`}>
                    {c.name}
                  </div>
                  <div className="text-[11px] text-white/30 mt-0.5">{c.desc}</div>
                </div>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{
                    border: chipPlay === c.id ? '2px solid #FFD54F' : '2px solid rgba(255,255,255,0.1)',
                    background: chipPlay === c.id ? '#FFD54F' : 'transparent',
                  }}
                >
                  {chipPlay === c.id && <span className="text-xs font-extrabold text-[#0a0a0f]">✓</span>}
                </div>
              </div>
            ))}

            {/* Assistant Manager target picker */}
            {chipPlay === 1 && (
              <div className="bg-yellow-300/[0.04] border border-yellow-300/15 rounded-lg p-3.5 mt-2">
                <p className="text-xs text-white/40 mb-2.5">Select which manager&apos;s team to copy:</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {allManagers
                    .filter((m) => m.id !== activeManagerId)
                    .map((m) => (
                      <div
                        key={m.id}
                        onClick={() => setChipTarget(m.id)}
                        className="p-2 text-center rounded-md cursor-pointer transition-all"
                        style={{
                          background: chipTarget === m.id ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.02)',
                          border: chipTarget === m.id ? '1px solid rgba(255,215,0,0.3)' : '1px solid rgba(255,255,255,0.04)',
                        }}
                      >
                        <div
                          className={`text-[13px] ${chipTarget === m.id ? 'font-bold text-yellow-300' : 'font-medium text-white/50'}`}
                        >
                          {m.name}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-white/20 mb-2.5">No chip is available to play this week.</p>
          </>
        )}

        {/* Chip schedule timeline */}
        <div className="mt-3.5">
          <div className="text-[10px] font-bold text-white/15 tracking-wider mb-2">CHIP SCHEDULE</div>
          <div className="flex gap-1 flex-wrap">
            {CHIPS.map((c) => {
              const [lo, hi] = c.window.replace('Week ', '').split('-').map(Number);
              const isCurrent = currentWeek >= lo && currentWeek <= hi;
              const isUsed = usedChips.includes(c.id);
              const isPast = currentWeek > hi;
              return (
                <div
                  key={c.id}
                  className="text-[10px] px-2 py-1 rounded"
                  style={{
                    background: isCurrent && !isUsed ? 'rgba(255,215,0,0.08)' : isUsed ? 'rgba(255,80,80,0.05)' : 'rgba(255,255,255,0.02)',
                    color: isCurrent && !isUsed ? '#FFD54F' : isUsed ? 'rgba(255,80,80,0.4)' : isPast ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
                    border: isCurrent && !isUsed ? '1px solid rgba(255,215,0,0.2)' : '1px solid rgba(255,255,255,0.03)',
                    textDecoration: isUsed ? 'line-through' : 'none',
                  }}
                >
                  {c.icon} W{lo}-{hi}
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Submit Button */}
      <div className="sticky bottom-0 pt-5 pb-2.5 mt-2" style={{ background: 'linear-gradient(transparent, #0a0a0f 20%)' }}>
        <button
          onClick={handleSubmit}
          disabled={!picksComplete || saving}
          className="w-full py-3.5 rounded-lg border-none font-extrabold text-[15px] tracking-wider transition-all"
          style={{
            cursor: picksComplete && !saving ? 'pointer' : 'default',
            background: picksComplete ? 'linear-gradient(135deg, #FF6B35, #FF8F00)' : 'rgba(255,255,255,0.04)',
            color: picksComplete ? '#fff' : 'rgba(255,255,255,0.15)',
            boxShadow: picksComplete ? '0 4px 20px rgba(255,107,53,0.3)' : 'none',
          }}
        >
          {saving ? '⏳ Submitting...' : picksComplete ? '🔥 SUBMIT PICKS' : 'Complete required picks to submit'}
        </button>
        {!picksComplete && (
          <div className="flex gap-3 justify-center mt-2">
            {!captain && <span className="text-[10px] text-orange-500/50">⚠ Captain</span>}
            {isPoolActive && !poolPick && <span className="text-[10px] text-orange-500/50">⚠ Pool</span>}
            {isDrowned && !backdoorPick && <span className="text-[10px] text-orange-500/50">⚠ Backdoor</span>}
            {!netPick && <span className="text-[10px] text-white/15">NET (optional)</span>}
          </div>
        )}
      </div>
    </div>
  );
}
