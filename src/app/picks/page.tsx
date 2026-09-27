'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/auth/AuthGuard';
import { supabase } from '@/lib/supabase/client';
import { Page, PageSkeleton, Card, Badge, Button, Callout, EmptyState, Segmented, SurvivorAvatar, ManagerAvatar, TribeTag, cn } from '@/components/ui';
import { IconCheck, IconClock, IconLock } from '@/components/ui/icons';
import {
  SEASON_ID, ROSTER_SLOTS, PICK_CHIPS, CHIP_FIRST_EP, CHIP_LAST_EP,
  SLOT_BONUS_GOING_HOME, SLOT_BONUS_TITLE, PENALTY,
  type RosterSlot, type PickChip,
} from '@/lib/constants';

// ============================================================
// Types
// ============================================================
interface Survivor {
  id: string; name: string; tribe: string; photo_url: string | null; cast_id: number;
  is_active: boolean; is_playable: boolean;
}
interface Season { id: string; name: string; current_episode: number; total_episodes: number; next_episode_title: string | null; }
interface EpisodeRow {
  number: number; lock_at: string; h2h_round: number | null;
  is_finale: boolean; is_couples_week: boolean; is_rivalry_week: boolean;
}
interface PickRow {
  id: string; episode: number;
  reward_pick_id: string | null; immunity_pick_id: string | null;
  going_home_pick_id: string | null; mop_pick_id: string | null; title_pick_id: string | null;
  chip: PickChip | null; chip_slot: RosterSlot | null; hedge_alt_id: string | null;
  pool_pick_id: string | null; pool_backdoor_id: string | null;
  submitted_at: string | null; is_locked: boolean | null;
}
interface Fixture { id: string; round: number; manager_a: string; manager_b: string; }

type Slots = Record<RosterSlot, string | null>;
type PickerKey = RosterSlot | 'title' | 'pool' | 'backdoor' | 'hedge' | 'q0' | 'q1' | 'q2' | 'q3' | 'q4';

// Quinfecta (finale only): index i = predicted FSG place i+1 (1st = Sole Survivor)
const QUIN_PLACES = ['1st — Sole Survivor 👑', '2nd', '3rd', '4th', '5th'];

const EMPTY_SLOTS: Slots = { reward: null, immunity: null, going_home: null, mop: null };
const SLOT_LABEL: Record<RosterSlot, string> = Object.fromEntries(ROSTER_SLOTS.map(s => [s.key, s.label])) as Record<RosterSlot, string>;
const SLOT_SCORING: Record<RosterSlot, string> = {
  reward:     `Hit: their points ×2 · If they go home: ${PENALTY.reward}`,
  immunity:   `Hit: their points ×2 · If they go home: ${PENALTY.immunity}`,
  going_home: `Hit: their points ×2, plus +${SLOT_BONUS_GOING_HOME}`,
  mop:        `Hit: their points ×2 · If they go home: ${PENALTY.mop}`,
};

function formatLock(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' CT';
}

function formatCountdown(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec}s`;
}

// ============================================================
// Presentational pieces (theme tokens; logic lives in PicksContent)
// ============================================================
type Tone = 'positive' | 'accent' | 'neutral' | 'warn' | 'negative';
const toneOf = (hex?: string): Tone => hex === '#4ade80' ? 'positive' : hex === '#3fc0f0' ? 'accent' : hex === '#9aa0a8' ? 'neutral' : hex === '#f87171' ? 'negative' : 'warn';

const Section = ({ title, icon, children, badge, badgeColor, error }: { title: string; icon: string; children: React.ReactNode; badge?: string; badgeColor?: string; error?: boolean; }) => (
  <section className={cn('rounded-2xl bg-surface border shadow-card p-4 mb-3', error ? 'border-negative/50' : 'border-line')}>
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      </div>
      {badge && <Badge tone={toneOf(badgeColor)}>{badge.charAt(0) + badge.slice(1).toLowerCase()}</Badge>}
    </div>
    {children}
  </section>
);

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[13px] text-muted leading-relaxed mb-3">{children}</p>
);

const ErrorLine = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-2.5 rounded-xl border border-negative/30 bg-negative/10 px-3 py-2 text-[13px] text-negative">⚠ {children}</div>
);

// The currently chosen survivor for a slot, with a Change / Choose button.
function Chosen({ s, placeholder, onOpen, open, locked }: { s: Survivor | null; placeholder: string; onOpen: () => void; open: boolean; locked: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5', s ? 'bg-raised/60 border border-line' : 'border border-dashed border-line')}>
      {s ? <>
        <SurvivorAvatar name={s.name} tribe={s.tribe} photoUrl={s.photo_url} size={36} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate">{s.name}</div>
          <TribeTag tribe={s.tribe} />
        </div>
      </> : <div className="flex-1 text-sm text-muted">{locked ? 'No pick' : placeholder}</div>}
      {!locked && (
        <Button size="sm" variant={s ? 'secondary' : 'primary'} onClick={onOpen}>{open ? 'Close' : s ? 'Change' : 'Choose'}</Button>
      )}
    </div>
  );
}

// Grid of survivors to choose from. `tags` labels survivors already used elsewhere
// on the card; they stay clickable so validation can explain the conflict.
function PickerGrid({ options, selectedId, onSelect, tribes, tags, pinned }: {
  options: Survivor[]; selectedId: string | null; onSelect: (id: string) => void;
  tribes: string[]; tags?: Record<string, string>; pinned?: Survivor[];
}) {
  const [filter, setFilter] = useState('All');
  const filtered = filter === 'All' ? options : options.filter(s => s.tribe === filter);
  const list = [...(pinned || []), ...filtered];
  return (
    <div className="mt-3">
      <Segmented value={filter} onChange={setFilter} className="mb-2.5" options={['All', ...tribes].map(t => ({ value: t, label: t }))} />
      <div className="grid gap-1.5 max-h-[320px] overflow-y-auto p-0.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(128px,1fr))' }}>
        {list.length === 0 && <div className="col-span-full py-4 text-center text-sm text-muted">No survivors available</div>}
        {list.map(s => {
          const sel = selectedId === s.id;
          const tag = tags?.[s.id];
          return (
            <button key={s.id} type="button" onClick={() => onSelect(s.id)}
              className={cn('flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors',
                sel ? 'border-accent bg-accent/10' : 'border-line bg-raised/40 hover:bg-raised')}>
              <SurvivorAvatar name={s.name} tribe={s.tribe} photoUrl={s.photo_url} size={28} />
              <div className="flex-1 min-w-0">
                <div className={cn('text-[13px] truncate', sel ? 'font-semibold text-ink' : 'font-medium text-ink')}>{s.name}</div>
                {tag
                  ? <div className="text-[10px] font-semibold text-warn truncate">{tag}</div>
                  : <div className="text-[10px] text-muted">{s.tribe}</div>}
              </div>
              {sel && <span className="h-5 w-5 rounded-full bg-accent text-on-accent inline-flex items-center justify-center shrink-0"><IconCheck size={12} /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================
function PicksContent() {
  const { manager, managers } = useAuth();

  const [season, setSeason] = useState<Season | null>(null);
  const [episode, setEpisode] = useState<EpisodeRow | null>(null);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [existingPick, setExistingPick] = useState<PickRow | null>(null);
  const [usedPoolPicks, setUsedPoolPicks] = useState<string[]>([]);
  const [usedChips, setUsedChips] = useState<{ chip: PickChip; episode: number }[]>([]);
  const [poolStatus, setPoolStatus] = useState<string>('active');
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Card state
  const [slots, setSlots] = useState<Slots>(EMPTY_SLOTS);
  const [titlePick, setTitlePick] = useState<string | null>(null);
  const [poolPick, setPoolPick] = useState<string | null>(null);
  const [backdoorPick, setBackdoorPick] = useState<string | null>(null);
  const [chip, setChip] = useState<PickChip | null>(null);
  const [chipSlot, setChipSlot] = useState<RosterSlot | null>(null);
  const [hedgeAlt, setHedgeAlt] = useState<string | null>(null);
  const [quinfecta, setQuinfecta] = useState<(string | null)[]>([null, null, null, null, null]);

  const [openPicker, setOpenPicker] = useState<PickerKey | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { if (manager) loadData(); }, [manager]);
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, []);

  async function loadData() {
    if (!manager) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data: seasonData, error: seasonErr } = await supabase
        .from('seasons').select('id, name, current_episode, total_episodes, next_episode_title')
        .eq('id', SEASON_ID).maybeSingle();
      if (seasonErr) throw seasonErr;
      if (!seasonData) { setSeason(null); setLoading(false); return; }
      setSeason(seasonData);
      const ep: number = seasonData.current_episode;

      const [epRes, survRes, picksRes, poolRes] = await Promise.all([
        supabase.from('episodes').select('number, lock_at, h2h_round, is_finale, is_couples_week, is_rivalry_week').eq('season_id', SEASON_ID).eq('number', ep).maybeSingle(),
        supabase.from('survivors').select('id, name, tribe, photo_url, cast_id, is_active, is_playable').eq('season_id', SEASON_ID).order('cast_id'),
        supabase.from('weekly_picks').select('*').eq('season_id', SEASON_ID).eq('manager_id', manager.id),
        supabase.from('pool_status').select('status').eq('season_id', SEASON_ID).eq('manager_id', manager.id).maybeSingle(),
      ]);
      for (const r of [epRes, survRes, picksRes, poolRes]) if (r.error) throw r.error;

      const epRow = epRes.data as EpisodeRow | null;
      setEpisode(epRow);
      setSurvivors((survRes.data || []) as Survivor[]);
      setPoolStatus(poolRes.data?.status || 'active');

      const myPicks = (picksRes.data || []) as PickRow[];
      const current = myPicks.find(p => p.episode === ep) || null;
      setUsedPoolPicks(myPicks.filter(p => p.episode < ep && p.pool_pick_id).map(p => p.pool_pick_id as string));
      setUsedChips(myPicks.filter(p => p.episode !== ep && p.chip).map(p => ({ chip: p.chip as PickChip, episode: p.episode })));

      setExistingPick(current);
      setSlots(current ? {
        reward: current.reward_pick_id, immunity: current.immunity_pick_id,
        going_home: current.going_home_pick_id, mop: current.mop_pick_id,
      } : EMPTY_SLOTS);
      setTitlePick(current?.title_pick_id ?? null);
      setPoolPick(current?.pool_pick_id ?? null);
      setBackdoorPick(current?.pool_backdoor_id ?? null);
      setChip(current?.chip ?? null);
      setChipSlot(current?.chip_slot ?? null);
      setHedgeAlt(current?.hedge_alt_id ?? null);

      if (epRow?.is_finale) {
        const { data: q, error: qErr } = await supabase.from('quinfecta_predictions')
          .select('place_1_id, place_2_id, place_3_id, place_4_id, place_5_id')
          .eq('season_id', SEASON_ID).eq('manager_id', manager.id).maybeSingle();
        if (qErr) throw qErr;
        setQuinfecta(q ? [q.place_1_id, q.place_2_id, q.place_3_id, q.place_4_id, q.place_5_id] : [null, null, null, null, null]);
      }

      if (epRow?.h2h_round) {
        const { data: fx, error: fxErr } = await supabase
          .from('fixtures').select('id, round, manager_a, manager_b')
          .eq('season_id', SEASON_ID).eq('round', epRow.h2h_round)
          .or(`manager_a.eq.${manager.id},manager_b.eq.${manager.id}`)
          .maybeSingle();
        if (fxErr) throw fxErr;
        setFixture(fx as Fixture | null);
      } else {
        setFixture(null);
      }
    } catch (err: any) {
      console.error('Error loading picks:', err);
      setLoadError(err?.message || 'Could not load your pick card');
    }
    setLoading(false);
  }

  // ── Derived ────────────────────────────────────────────────
  const currentEp = season?.current_episode ?? 1;
  const byId = useMemo(() => new Map(survivors.map(s => [s.id, s])), [survivors]);
  const rosterEligible = useMemo(() => survivors.filter(s => s.is_active && s.is_playable), [survivors]);
  const eligibleIds = useMemo(() => new Set(rosterEligible.map(s => s.id)), [rosterEligible]);
  const titleOnly = useMemo(() => survivors.filter(s => !s.is_playable), [survivors]); // Jeff
  const tribes = useMemo(() => [...new Set(rosterEligible.map(s => s.tribe))].sort(), [rosterEligible]);
  const poolOptions = rosterEligible.filter(s => !usedPoolPicks.includes(s.id));

  const lockAtMs = episode ? new Date(episode.lock_at).getTime() : null;
  const isPastDeadline = lockAtMs === null || now >= lockAtMs;
  const isLocked = isPastDeadline || !!existingPick?.is_locked;

  const chipsAllowed = currentEp >= CHIP_FIRST_EP && currentEp <= CHIP_LAST_EP;
  const usedChipIds = new Set(usedChips.map(u => u.chip));
  const availableChips = PICK_CHIPS.filter(c => !usedChipIds.has(c.id));
  const chipDef = chip ? PICK_CHIPS.find(c => c.id === chip) || null : null;

  const opponentId = fixture ? (fixture.manager_a === manager?.id ? fixture.manager_b : fixture.manager_a) : null;
  const opponentName = opponentId ? managers.find(m => m.id === opponentId)?.name || 'Unknown manager' : null;

  // Survivor id → the roster slot(s) it currently fills
  const slotsBySurvivor = useMemo(() => {
    const m: Record<string, RosterSlot[]> = {};
    for (const { key } of ROSTER_SLOTS) {
      const id = slots[key];
      if (id) (m[id] ||= []).push(key);
    }
    return m;
  }, [slots]);

  // Inline per-slot errors (shown immediately — these are conflicts, not omissions)
  const slotErrors = useMemo(() => {
    const e: Partial<Record<RosterSlot, string>> = {};
    for (const { key } of ROSTER_SLOTS) {
      const id = slots[key];
      if (!id) continue;
      const name = byId.get(id)?.name || 'This survivor';
      const others = slotsBySurvivor[id].filter(k => k !== key);
      if (others.length) {
        e[key] = `${name} is also your ${others.map(k => SLOT_LABEL[k]).join(' and ')} pick. Each of the four roster slots needs a different survivor.`;
      } else if (!eligibleIds.has(id)) {
        e[key] = `${name} is no longer in the game. Pick someone else.`;
      }
    }
    return e;
  }, [slots, slotsBySurvivor, byId, eligibleIds]);

  const hedgeError = useMemo(() => {
    if (chip !== 'hedge' || !hedgeAlt) return null;
    const name = byId.get(hedgeAlt)?.name || 'That survivor';
    const inSlots = slotsBySurvivor[hedgeAlt];
    if (inSlots?.length) return `${name} is already your ${inSlots.map(k => SLOT_LABEL[k]).join(' and ')} pick. Your Hedge backup has to be someone not on your card.`;
    if (!eligibleIds.has(hedgeAlt)) return `${name} is no longer in the game. Pick a different backup.`;
    return null;
  }, [chip, hedgeAlt, slotsBySurvivor, byId, eligibleIds]);

  // Everything that blocks submission, in card order
  const issues = useMemo(() => {
    const list: string[] = [];
    for (const { key, label } of ROSTER_SLOTS) {
      if (!slots[key]) list.push(`Pick your ${label}.`);
    }
    const dupes = Object.entries(slotsBySurvivor).filter(([, ks]) => ks.length > 1);
    for (const [id, ks] of dupes) {
      list.push(`${byId.get(id)?.name || 'A survivor'} is picked for ${ks.map(k => SLOT_LABEL[k]).join(' and ')}. The four roster picks must be four different survivors.`);
    }
    for (const { key } of ROSTER_SLOTS) {
      const id = slots[key];
      if (id && !eligibleIds.has(id) && !(slotsBySurvivor[id].length > 1)) list.push(slotErrors[key]!);
    }
    if (!titlePick) list.push('Pick who says the episode title.');
    else if (!byId.get(titlePick) || (byId.get(titlePick)!.is_playable && !eligibleIds.has(titlePick))) list.push('Your Title pick is no longer in the game. Pick someone else.');
    if (poolStatus === 'active' && !poolPick) list.push('Make your Survivor Pool pick.');
    // Outside E2–E12 no chip is written at all (see savePicks), so nothing to validate.
    if (chip && chipsAllowed) {
      if (usedChipIds.has(chip)) list.push(`You've already used ${chipDef?.name} this season.`);
      if (chipDef?.needsSlot && !chipSlot) list.push(`Choose which slot your ${chipDef.name} applies to.`);
      if (chip === 'hedge' && chipSlot && !hedgeAlt) list.push(`Choose your Hedge backup for ${SLOT_LABEL[chipSlot]}.`);
      if (hedgeError) list.push(hedgeError);
    }
    if (episode?.is_finale) {
      quinfecta.forEach((id, i) => {
        if (!id) list.push(`Pick your Quinfecta ${QUIN_PLACES[i].split(' ')[0]} place.`);
        else if (!eligibleIds.has(id)) list.push(`Your Quinfecta ${QUIN_PLACES[i].split(' ')[0]} pick is no longer in the game.`);
      });
      const seen = new Map<string, number[]>();
      quinfecta.forEach((id, i) => { if (id) seen.set(id, [...(seen.get(id) || []), i + 1]); });
      for (const [id, places] of seen) if (places.length > 1) list.push(`${byId.get(id)?.name || 'A survivor'} is in your Quinfecta twice (places ${places.join(' and ')}). Each place needs a different survivor.`);
    }
    return list;
  }, [slots, slotsBySurvivor, slotErrors, byId, eligibleIds, titlePick, poolStatus, poolPick, chip, chipDef, chipSlot, hedgeAlt, hedgeError, chipsAllowed, usedChipIds, episode, quinfecta]);

  // Tags shown in pickers so managers can see where a survivor is already used
  const rosterTags = useMemo(() => {
    const t: Record<string, string> = {};
    for (const [id, ks] of Object.entries(slotsBySurvivor)) t[id] = ks.map(k => SLOT_LABEL[k]).join(' · ');
    if (chip === 'hedge' && hedgeAlt && !t[hedgeAlt]) t[hedgeAlt] = 'Hedge backup';
    return t;
  }, [slotsBySurvivor, chip, hedgeAlt]);

  // ── Handlers ───────────────────────────────────────────────
  function togglePicker(k: PickerKey) { setOpenPicker(prev => (prev === k ? null : k)); }
  function pickSlot(key: RosterSlot, id: string) {
    setSlots(prev => ({ ...prev, [key]: id }));
    setOpenPicker(null);
    setSaveMessage(null);
  }
  function selectChip(id: PickChip) {
    if (isLocked) return;
    if (chip === id) { setChip(null); setChipSlot(null); setHedgeAlt(null); }
    else { setChip(id); setChipSlot(null); setHedgeAlt(null); }
    setSaveMessage(null);
  }

  async function savePicks() {
    if (!manager || !season || !episode) return;
    setSubmitAttempted(true);
    setSaveMessage(null);
    if (isLocked || Date.now() >= new Date(episode.lock_at).getTime()) {
      setNow(Date.now());
      setSaveMessage({ ok: false, text: `Picks locked at ${formatLock(episode.lock_at)}. Your card was not changed.` });
      return;
    }
    if (issues.length) {
      setSaveMessage({ ok: false, text: 'Your card isn’t ready yet — fix the items listed below.' });
      return;
    }

    setSaving(true);
    const row = {
      season_id: SEASON_ID,
      manager_id: manager.id,
      episode: currentEp,
      reward_pick_id: slots.reward,
      immunity_pick_id: slots.immunity,
      going_home_pick_id: slots.going_home,
      mop_pick_id: slots.mop,
      title_pick_id: titlePick,
      chip: chipsAllowed ? chip : null,
      chip_slot: chipsAllowed && chipDef?.needsSlot ? chipSlot : null,
      hedge_alt_id: chipsAllowed && chip === 'hedge' ? hedgeAlt : null,
      pool_pick_id: poolStatus === 'active' ? poolPick : null,
      pool_backdoor_id: poolStatus === 'drowned' ? backdoorPick : null,
      submitted_at: new Date().toISOString(),
    };
    try {
      const { error } = existingPick
        ? await supabase.from('weekly_picks').update(row).eq('id', existingPick.id)
        : await supabase.from('weekly_picks').insert(row);
      if (error) throw error;
      if (episode.is_finale) {
        const now = new Date().toISOString();
        const { error: qErr } = await supabase.from('quinfecta_predictions').upsert({
          season_id: SEASON_ID, manager_id: manager.id,
          place_1_id: quinfecta[0], place_2_id: quinfecta[1], place_3_id: quinfecta[2], place_4_id: quinfecta[3], place_5_id: quinfecta[4],
          submitted_at: now, updated_at: now,
        }, { onConflict: 'season_id,manager_id' });
        if (qErr) throw qErr;
      }
      setSaveMessage({ ok: true, text: `Picks saved. You can change them until ${formatLock(episode.lock_at)}.` });
      setSubmitAttempted(false);
      await loadData();
    } catch (err: any) {
      const msg: string = err?.message || '';
      let text = `Could not save: ${msg || 'unknown error'}`;
      if (err?.code === '23505' && msg.includes('one_chip')) text = `You've already used ${chipDef?.name || 'that chip'} this season. Pick a different chip or none.`;
      else if (err?.code === '23505') text = 'A card for this episode already exists (maybe saved from another tab). Refresh the page and try again.';
      setSaveMessage({ ok: false, text });
    }
    setSaving(false);
  }

  // ── Render ─────────────────────────────────────────────────
  if (loading) return <PageSkeleton />;
  if (loadError) return <Page><EmptyState icon="⚠️" title="Couldn't load your pick card" action={<Button onClick={loadData}>Try again</Button>}>{loadError}</EmptyState></Page>;
  if (!season) return <Page><EmptyState icon="🏝" title="No active season found" /></Page>;

  const titleSurvivor = titlePick ? byId.get(titlePick) || null : null;
  const requiredDone = [
    ...ROSTER_SLOTS.map(s => !!slots[s.key]), !!titlePick,
    ...(poolStatus === 'active' ? [!!poolPick] : []),
    ...(episode?.is_finale ? [quinfecta.every(Boolean)] : []),
  ];
  const doneCount = requiredDone.filter(Boolean).length;

  return (
    <Page className="pb-4">
      {/* ── HEADER ── */}
      <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-xs font-semibold text-muted mb-1">{season.name} · Episode {currentEp}{episode?.is_finale ? ' · Finale' : ''}</div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Pick card</h1>
          <div className="text-sm text-muted mt-1">Locks {episode ? formatLock(episode.lock_at) : '—'}</div>
        </div>
        <div className="flex items-center gap-2">
          {!isLocked && <Badge tone={doneCount === requiredDone.length ? 'positive' : 'neutral'}>{doneCount} of {requiredDone.length} done</Badge>}
          <Badge tone={isLocked ? 'negative' : 'accent'}>{isLocked ? <><IconLock size={12} />Locked</> : <><IconClock size={12} />{formatCountdown(lockAtMs! - now)}</>}</Badge>
        </div>
      </div>

      {!episode && <ErrorLine>No schedule found for episode {currentEp}. The card is locked until the commissioner fixes the episodes table.</ErrorLine>}

      {/* ── H2H FIXTURE ── */}
      <Card className="mb-3 bg-gradient-to-br from-accent/10 via-surface to-surface">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs font-semibold text-muted">{episode?.h2h_round ? `Head to head · Round ${episode.h2h_round}` : 'Head to head'}</span>
          {episode?.is_couples_week && <Badge tone="accent">💞 Couples Week</Badge>}
          {episode?.is_rivalry_week && <Badge tone="negative">⚔️ Rivalry Week</Badge>}
        </div>
        {fixture && opponentName ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 min-w-0"><ManagerAvatar name={manager?.name || '?'} size={36} me /><span className="text-lg font-bold text-ink truncate">You</span></div>
              <span className="text-xs font-bold tracking-widest text-faint">VS</span>
              <div className="flex-1 flex items-center gap-2 justify-end min-w-0"><span className="text-lg font-bold text-ink truncate">{opponentName}</span><ManagerAvatar name={opponentName} size={36} /></div>
            </div>
            <div className="text-xs text-muted mt-3">Higher card total wins · Win 3 · Draw 1 · Loss 0</div>
          </>
        ) : episode?.h2h_round ? (
          <div className="text-sm text-negative">No fixture found for you in round {episode.h2h_round}. Tell the commissioner.</div>
        ) : (
          <div className="text-[15px] font-semibold text-ink">No fixture this week{episode?.is_finale ? ' — it’s the finale.' : '.'}</div>
        )}
      </Card>

      {saveMessage && <Callout tone={saveMessage.ok ? 'positive' : 'negative'} className="mb-3">{saveMessage.text}</Callout>}
      {existingPick && !saveMessage && (
        <Callout tone="positive" className="mb-3">{isLocked ? '✅ Your card is in. It’s locked for this episode.' : '✅ Card submitted — you can change it until the deadline.'}</Callout>
      )}
      {!existingPick && isLocked && episode && <Callout tone="negative" className="mb-3">You didn’t submit a card for episode {currentEp}.</Callout>}

      {/* ── ROSTER SLOTS ── */}
      {ROSTER_SLOTS.map(({ key, label, icon, desc }) => {
        const id = slots[key];
        const s = id ? byId.get(id) || null : null;
        const err = slotErrors[key];
        const chipHere = chip && chipSlot === key ? chipDef : null;
        return (
          <Section key={key} title={label} icon={icon} error={!!err || (submitAttempted && !id)}
            badge={chipHere ? `${chipHere.icon} ${chipHere.name.toUpperCase()}` : id ? 'PICKED' : isLocked ? 'NO PICK' : 'REQUIRED'}
            badgeColor={chipHere ? '#3fc0f0' : id ? '#4ade80' : isLocked ? '#9aa0a8' : '#FF6B35'}>
            <Hint>{desc} <span className="text-faint">{SLOT_SCORING[key]}</span></Hint>
            <Chosen s={s} placeholder="Choose a survivor" open={openPicker === key} onOpen={() => togglePicker(key)} locked={isLocked} />
            {openPicker === key && !isLocked && (
              <PickerGrid options={rosterEligible} selectedId={id} onSelect={(sid) => pickSlot(key, sid)} tribes={tribes}
                tags={Object.fromEntries(Object.entries(rosterTags).filter(([sid]) => !(slotsBySurvivor[sid]?.length === 1 && slotsBySurvivor[sid][0] === key)))} />
            )}
            {err && <ErrorLine>{err}</ErrorLine>}
          </Section>
        );
      })}

      {/* ── TITLE ── */}
      <Section title="Title" icon="💬" error={submitAttempted && !titlePick}
        badge={titlePick ? 'PICKED' : isLocked ? 'NO PICK' : 'REQUIRED'} badgeColor={titlePick ? '#4ade80' : isLocked ? '#9aa0a8' : '#FF6B35'}>
        {season.next_episode_title && (
          <div className="mb-3 rounded-xl border border-accent/25 bg-accent/10 px-3 py-2.5">
            <div className="text-[11px] font-semibold text-accent mb-0.5">This week’s episode title</div>
            <div className="text-[15px] font-semibold text-ink">&ldquo;{season.next_episode_title}&rdquo;</div>
          </div>
        )}
        <Hint>Who says the episode title? Anyone still in the game, or Jeff. This pick can repeat one of your roster picks. <span className="text-faint">Correct: +{SLOT_BONUS_TITLE}</span></Hint>
        <Chosen s={titleSurvivor} placeholder="Choose who says it" open={openPicker === 'title'} onOpen={() => togglePicker('title')} locked={isLocked} />
        {openPicker === 'title' && !isLocked && (
          <PickerGrid options={rosterEligible} pinned={titleOnly} selectedId={titlePick} tribes={tribes}
            onSelect={(sid) => { setTitlePick(sid); setOpenPicker(null); setSaveMessage(null); }} />
        )}
      </Section>

      {/* ── POOL ── */}
      <Section title="Survivor Pool" icon="🌊" error={submitAttempted && poolStatus === 'active' && !poolPick}
        badge={poolStatus === 'active' ? 'ACTIVE' : poolStatus === 'drowned' ? 'DROWNED' : poolStatus === 'burnt' ? 'BURNT' : poolStatus.toUpperCase()}
        badgeColor={poolStatus === 'active' ? '#4ade80' : poolStatus === 'drowned' ? '#FF6B35' : '#f87171'}>
        {poolStatus === 'active' ? (<>
          <Hint>Pick one survivor you think <b className="text-ink">will NOT be eliminated</b>. You can’t reuse a previous pool pick.</Hint>
          <Chosen s={poolPick ? byId.get(poolPick) || null : null} placeholder="Choose a survivor" open={openPicker === 'pool'} onOpen={() => togglePicker('pool')} locked={isLocked} />
          {openPicker === 'pool' && !isLocked && (
            <PickerGrid options={poolOptions} selectedId={poolPick} tribes={tribes}
              onSelect={(sid) => { setPoolPick(sid); setOpenPicker(null); setSaveMessage(null); }} />
          )}
        </>) : poolStatus === 'drowned' ? (<>
          <Hint>You’ve been <b className="text-negative">Drowned</b>. Pick who <b className="text-ink">WILL be eliminated</b> for a Backdoor attempt (optional).</Hint>
          <Chosen s={backdoorPick ? byId.get(backdoorPick) || null : null} placeholder="Choose a Backdoor pick" open={openPicker === 'backdoor'} onOpen={() => togglePicker('backdoor')} locked={isLocked} />
          {openPicker === 'backdoor' && !isLocked && (
            <PickerGrid options={rosterEligible} selectedId={backdoorPick} tribes={tribes}
              onSelect={(sid) => { setBackdoorPick(sid); setOpenPicker(null); setSaveMessage(null); }} />
          )}
        </>) : (
          <p className="text-sm text-negative">You’ve been <b>Burnt</b> — no more pool picks this season.</p>
        )}
      </Section>

      {/* ── QUINFECTA (finale only) ── */}
      {episode?.is_finale && (
        <Section title="Quinfecta" icon="🎯" error={submitAttempted && quinfecta.some(q => !q)}
          badge={quinfecta.every(Boolean) ? 'PICKED' : isLocked ? 'NO PICK' : 'REQUIRED'} badgeColor={quinfecta.every(Boolean) ? '#4ade80' : isLocked ? '#9aa0a8' : '#FF6B35'}>
          <Hint>Predict the final five in finishing order. Exact place +5, one place off +2, all five exact +10 bonus. Five different survivors.</Hint>
          {QUIN_PLACES.map((label, i) => {
            const key = `q${i}` as PickerKey;
            const id = quinfecta[i];
            const dupe = !!id && quinfecta.some((x, j) => j !== i && x === id);
            return (
              <div key={label} className="mb-3">
                <div className="text-xs font-semibold text-muted mb-1.5">{label}</div>
                <Chosen s={id ? byId.get(id) || null : null} placeholder="Choose a survivor" open={openPicker === key} onOpen={() => togglePicker(key)} locked={isLocked} />
                {openPicker === key && !isLocked && (
                  <PickerGrid options={rosterEligible} selectedId={id} tribes={tribes}
                    tags={Object.fromEntries(quinfecta.map((x, j) => [x, `Quinfecta ${QUIN_PLACES[j].split(' ')[0]}`]).filter(([x], j) => x && j !== i))}
                    onSelect={(sid) => { setQuinfecta(prev => prev.map((v, j) => (j === i ? sid : v))); setOpenPicker(null); setSaveMessage(null); }} />
                )}
                {dupe && <ErrorLine>{byId.get(id!)?.name} is in another Quinfecta place too. Each place needs a different survivor.</ErrorLine>}
              </div>
            );
          })}
        </Section>
      )}

      {/* ── CHIP ── */}
      <Section title="Chip (optional)" icon="🎰"
        badge={!chipsAllowed ? 'NOT THIS WEEK' : chip ? 'PLAYING' : 'NONE'}
        badgeColor={!chipsAllowed ? '#9aa0a8' : chip ? '#3fc0f0' : '#9aa0a8'}>
        {!chipsAllowed ? (
          <Hint>Chips can be played in episodes {CHIP_FIRST_EP}–{CHIP_LAST_EP} only.</Hint>
        ) : (<>
          <Hint>One chip per episode, and each chip once per season. Tap a chip again to take it back.</Hint>
          {usedChips.length > 0 && (
            <div className="text-xs text-muted mb-2.5">
              Already used: {[...usedChips].sort((a, b) => a.episode - b.episode).map(u => `${PICK_CHIPS.find(c => c.id === u.chip)?.name || u.chip} (E${u.episode})`).join(', ')}
            </div>
          )}
          {availableChips.length === 0 && <div className="text-sm text-muted">You’ve used all four chips.</div>}
          <div className="space-y-2">
            {availableChips.map(c => {
              const on = chip === c.id;
              if (isLocked && !on) return null;
              return (
                <button key={c.id} type="button" onClick={() => selectChip(c.id)} disabled={isLocked}
                  className={cn('w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors', on ? 'border-accent bg-accent/10' : 'border-line bg-raised/40 hover:bg-raised')}>
                  <span className="text-2xl">{c.icon}</span>
                  <div className="flex-1">
                    <div className={cn('font-semibold', on ? 'text-accent' : 'text-ink')}>{c.name}</div>
                    <div className="text-xs text-muted mt-0.5">{c.desc}</div>
                  </div>
                  <span className={cn('h-5 w-5 rounded-full border-2 inline-flex items-center justify-center shrink-0', on ? 'border-accent bg-accent text-on-accent' : 'border-line')}>{on && <IconCheck size={12} />}</span>
                </button>
              );
            })}
          </div>
          {isLocked && !chip && <div className="text-sm text-muted">No chip played this episode.</div>}

          {chipDef?.needsSlot && (
            <div className="mt-3 rounded-xl border border-accent/25 bg-accent/5 p-3">
              <div className="text-xs font-semibold text-muted mb-2">{chipDef.name} applies to</div>
              <div className="grid grid-cols-2 gap-1.5">
                {ROSTER_SLOTS.map(({ key, label }) => {
                  const on = chipSlot === key;
                  const pickName = slots[key] ? byId.get(slots[key]!)?.name : null;
                  return (
                    <button key={key} type="button" disabled={isLocked} onClick={() => { setChipSlot(key); setSaveMessage(null); }}
                      className={cn('rounded-lg border px-2.5 py-2 text-left', on ? 'border-accent bg-accent/15' : 'border-line bg-surface hover:bg-raised')}>
                      <div className={cn('text-[13px] font-semibold', on ? 'text-accent' : 'text-ink')}>{label}</div>
                      <div className="text-[11px] text-muted">{pickName || 'no pick yet'}</div>
                    </button>
                  );
                })}
              </div>
              {submitAttempted && !chipSlot && <ErrorLine>Choose which slot your {chipDef.name} applies to.</ErrorLine>}

              {chip === 'hedge' && chipSlot && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-muted mb-2">Hedge backup for {SLOT_LABEL[chipSlot]}</div>
                  <Chosen s={hedgeAlt ? byId.get(hedgeAlt) || null : null} placeholder="Choose a backup survivor" open={openPicker === 'hedge'} onOpen={() => togglePicker('hedge')} locked={isLocked} />
                  {openPicker === 'hedge' && !isLocked && (
                    <PickerGrid options={rosterEligible} selectedId={hedgeAlt} tribes={tribes}
                      tags={Object.fromEntries(Object.entries(rosterTags).filter(([, t]) => t !== 'Hedge backup'))}
                      onSelect={(sid) => { setHedgeAlt(sid); setOpenPicker(null); setSaveMessage(null); }} />
                  )}
                  {hedgeError && <ErrorLine>{hedgeError}</ErrorLine>}
                  {submitAttempted && !hedgeAlt && <ErrorLine>Choose your Hedge backup for {SLOT_LABEL[chipSlot]}.</ErrorLine>}
                </div>
              )}
            </div>
          )}
        </>)}
      </Section>

      {/* ── SUBMIT (sticks above the phone tab bar) ── */}
      <div className="sticky z-30 -mx-4 px-4 pt-3 pb-3 mt-2 bg-gradient-to-t from-canvas via-canvas to-canvas/0" style={{ bottom: 'var(--tabbar-h)' }}>
        {submitAttempted && issues.length > 0 && !isLocked && (
          <div className="mb-2.5 rounded-xl border border-negative/35 bg-surface px-3.5 py-3 shadow-pop">
            <div className="text-xs font-bold text-negative mb-1.5">Before you can submit</div>
            <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-ink">
              {issues.map((i, n) => <li key={n}>{i}</li>)}
            </ul>
          </div>
        )}
        <Button onClick={savePicks} disabled={isLocked || saving} size="lg" className="w-full">
          {isLocked ? <><IconLock size={16} />Picks locked</> : saving ? 'Saving…' : existingPick ? 'Update picks' : 'Submit picks'}
        </Button>
        {!isLocked && !submitAttempted && issues.length > 0 && (
          <div className="text-center mt-2 text-xs text-muted">{issues.length} thing{issues.length > 1 ? 's' : ''} left to do on your card</div>
        )}
      </div>
    </Page>
  );
}

export default function WeeklyPicksPage() {
  return <AuthGuard><PicksContent /></AuthGuard>;
}
