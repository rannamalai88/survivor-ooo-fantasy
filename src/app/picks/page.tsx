'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import AuthGuard from '@/components/auth/AuthGuard';
import { supabase } from '@/lib/supabase/client';
import {
  SEASON_ID, TRIBE_COLORS, ROSTER_SLOTS, PICK_CHIPS, CHIP_FIRST_EP, CHIP_LAST_EP,
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

const tc = (tribe: string) => TRIBE_COLORS[tribe] || '#9aa0a8';
// Text colour on a solid tribe fill — Toka yellow needs dark text.
const tcOn = (tribe: string) => (tribe === 'Toka' ? '#16161a' : '#fff');

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
// Presentational pieces
// ============================================================
const Av = ({ s, sz = 28 }: { s: Pick<Survivor, 'name' | 'tribe' | 'photo_url'>; sz?: number }) => {
  const color = tc(s.tribe);
  return (
    <div style={{ width: sz, height: sz, borderRadius: '50%', background: `linear-gradient(135deg,${color}44,${color}77)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color}`, overflow: 'hidden' }}>
      {s.photo_url ? (
        <img src={s.photo_url} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <span style={{ fontSize: sz * 0.42, fontWeight: 800, color: '#fff' }}>{s.name[0]}</span>
      )}
    </div>
  );
};

const Section = ({ title, icon, children, badge, badgeColor, error }: { title: string; icon: string; children: React.ReactNode; badge?: string; badgeColor?: string; error?: boolean; }) => (
  <div style={{ background: 'rgba(255,255,255,0.02)', border: error ? '1px solid rgba(248,113,113,0.45)' : '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '18px', marginBottom: '12px' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' as const }}>{title}</h3>
      </div>
      {badge && <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: `${badgeColor || '#FF6B35'}15`, color: badgeColor || '#FF6B35', border: `1px solid ${badgeColor || '#FF6B35'}30`, letterSpacing: '1px', whiteSpace: 'nowrap' }}>{badge}</span>}
    </div>
    {children}
  </div>
);

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '0 0 10px', lineHeight: 1.5 }}>{children}</p>
);

const ErrorLine = ({ children }: { children: React.ReactNode }) => (
  <div style={{ marginTop: '10px', padding: '9px 12px', borderRadius: '8px', fontSize: '12px', lineHeight: 1.45, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}>⚠ {children}</div>
);

const TribeFilter = ({ value, onChange, tribes }: { value: string; onChange: (v: string) => void; tribes: string[] }) => (
  <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
    {['All', ...tribes].map(t => {
      const on = value === t;
      const c = t === 'All' ? '#FF6B35' : tc(t);
      return (
        <button key={t} onClick={() => onChange(t)} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const, border: 'none', cursor: 'pointer', background: on ? `${c}22` : 'rgba(255,255,255,0.03)', color: on ? c : 'rgba(255,255,255,0.3)' }}>{t}</button>
      );
    })}
  </div>
);

// The currently chosen survivor for a slot, with a Change / Choose button.
function Chosen({ s, placeholder, onOpen, open, locked }: { s: Survivor | null; placeholder: string; onOpen: () => void; open: boolean; locked: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: s ? `${tc(s.tribe)}14` : 'rgba(255,255,255,0.02)', border: s ? `1px solid ${tc(s.tribe)}55` : '1px dashed rgba(255,255,255,0.12)' }}>
      {s ? <>
        <Av s={s} sz={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>{s.name}</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: tc(s.tribe), letterSpacing: '1px' }}>{s.tribe.toUpperCase()}</div>
        </div>
      </> : <div style={{ flex: 1, fontSize: '13px', color: 'rgba(255,255,255,0.35)' }}>{locked ? 'No pick' : placeholder}</div>}
      {!locked && (
        <button onClick={onOpen} style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', cursor: 'pointer', border: '1px solid rgba(255,107,53,0.3)', background: open ? 'rgba(255,107,53,0.15)' : 'rgba(255,107,53,0.06)', color: '#FF6B35', whiteSpace: 'nowrap' }}>
          {open ? 'Close' : s ? 'Change' : 'Choose'}
        </button>
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
    <div style={{ marginTop: '10px' }}>
      <TribeFilter value={filter} onChange={setFilter} tribes={tribes} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(125px,1fr))', gap: '6px', maxHeight: '300px', overflowY: 'auto', padding: '2px' }}>
        {list.length === 0 && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', padding: '16px', textAlign: 'center', gridColumn: '1/-1' }}>No survivors available</div>}
        {list.map(s => {
          const sel = selectedId === s.id;
          const tag = tags?.[s.id];
          return (
            <div key={s.id} onClick={() => onSelect(s.id)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '10px', cursor: 'pointer', background: sel ? `${tc(s.tribe)}18` : 'rgba(255,255,255,0.02)', border: sel ? `1px solid ${tc(s.tribe)}66` : '1px solid rgba(255,255,255,0.05)' }}>
              <Av s={s} sz={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: sel ? '#fff' : 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                {tag
                  ? <div style={{ fontSize: '9px', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{tag}</div>
                  : <div style={{ fontSize: '9px', fontWeight: 700, color: tc(s.tribe), letterSpacing: '1px' }}>{s.tribe.toUpperCase()}</div>}
              </div>
              {sel && <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: tc(s.tribe), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ color: tcOn(s.tribe), fontSize: '11px', fontWeight: 800 }}>✓</span></div>}
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
  const pageStyle = { minHeight: '100vh', background: '#0a0a0f', color: '#e8e8e8', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" } as const;

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}><div className="text-white/30 text-sm tracking-wider uppercase">Loading picks...</div></div>;
  if (loadError) return <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0a0a0f' }}><div className="text-center"><div className="text-3xl mb-3">⚠️</div><div className="text-sm" style={{ color: '#f87171' }}>{loadError}</div><button onClick={loadData} className="mt-4 text-xs text-white/50 underline">Try again</button></div></div>;
  if (!season) return <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0f' }}><div className="text-center"><div className="text-3xl mb-3">🏝</div><div className="text-white/40 text-sm">No active season found</div></div></div>;

  const titleSurvivor = titlePick ? byId.get(titlePick) || null : null;

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '20px 16px 120px' }}>

        {/* ── HEADER ── */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#fff' }}>🔥 Pick Card</h1>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,107,53,0.1)', color: '#FF6B35', border: '1px solid rgba(255,107,53,0.2)' }}>EP. {currentEp}</span>
            {episode?.is_finale && <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(155,89,182,0.15)', color: '#c084fc', border: '1px solid rgba(155,89,182,0.3)', letterSpacing: '1px' }}>🏆 FINALE</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{season.name} · Locks {episode ? formatLock(episode.lock_at) : '—'}</span>
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: isLocked ? 'rgba(248,113,113,0.1)' : 'rgba(5,169,230,0.1)', color: isLocked ? '#f87171' : '#3fc0f0' }}>
              {isLocked ? '🔒 LOCKED' : `⏱ ${formatCountdown(lockAtMs! - now)}`}
            </span>
          </div>
        </div>

        {!episode && <ErrorLine>No schedule found for episode {currentEp}. The card is locked until the commissioner fixes the episodes table.</ErrorLine>}

        {/* ── H2H FIXTURE ── */}
        <div style={{ margin: '12px 0 14px', padding: '18px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(255,107,53,0.14), rgba(5,169,230,0.08))', border: '1px solid rgba(255,107,53,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>
              {episode?.h2h_round ? `Head to Head · Round ${episode.h2h_round}` : 'Head to Head'}
            </span>
            {episode?.is_couples_week && <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(244,114,182,0.15)', color: '#f472b6', letterSpacing: '1px' }}>💞 COUPLES WEEK</span>}
            {episode?.is_rivalry_week && <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', background: 'rgba(248,113,113,0.15)', color: '#f87171', letterSpacing: '1px' }}>⚔️ RIVALRY WEEK</span>}
          </div>
          {fixture && opponentName ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
                <span style={{ flex: 1, textAlign: 'right', fontSize: '22px', fontWeight: 900, color: '#fff' }}>{manager?.name}</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#FF6B35', letterSpacing: '1px' }}>VS</span>
                <span style={{ flex: 1, textAlign: 'left', fontSize: '22px', fontWeight: 900, color: '#fff' }}>{opponentName}</span>
              </div>
              <div style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>Higher card total wins · Win 3 · Draw 1 · Loss 0</div>
            </>
          ) : episode?.h2h_round ? (
            <div style={{ fontSize: '13px', color: '#f87171' }}>No fixture found for you in round {episode.h2h_round}. Tell the commissioner.</div>
          ) : (
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>No fixture this week{episode?.is_finale ? ' — it’s the finale.' : '.'}</div>
          )}
        </div>

        {saveMessage && (
          <div style={{ padding: '12px 16px', borderRadius: '10px', marginBottom: '12px', fontSize: '13px', background: saveMessage.ok ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', border: saveMessage.ok ? '1px solid rgba(74,222,128,0.25)' : '1px solid rgba(248,113,113,0.3)', color: saveMessage.ok ? '#4ade80' : '#f87171' }}>{saveMessage.text}</div>
        )}
        {existingPick && !saveMessage && (
          <div style={{ padding: '10px 14px', borderRadius: '10px', marginBottom: '12px', fontSize: '12px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.18)', color: 'rgba(74,222,128,0.85)' }}>
            {isLocked ? '✅ Your card is in. It’s locked for this episode.' : '✅ Card submitted — you can change it until the deadline.'}
          </div>
        )}
        {!existingPick && isLocked && episode && (
          <div style={{ padding: '10px 14px', borderRadius: '10px', marginBottom: '12px', fontSize: '12px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}>You didn’t submit a card for episode {currentEp}.</div>
        )}

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
              <Hint>{desc} <span style={{ color: 'rgba(255,255,255,0.3)' }}>{SLOT_SCORING[key]}</span></Hint>
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
            <div style={{ marginBottom: '10px', padding: '10px 14px', background: 'rgba(5,169,230,0.06)', border: '1px solid rgba(5,169,230,0.2)', borderRadius: '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(63,192,240,0.8)', letterSpacing: '1.5px', textTransform: 'uppercase' as const, marginBottom: '3px' }}>This week’s episode title</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>&ldquo;{season.next_episode_title}&rdquo;</div>
            </div>
          )}
          <Hint>Who says the episode title? Anyone still in the game, or Jeff. This pick can repeat one of your roster picks. <span style={{ color: 'rgba(255,255,255,0.3)' }}>Correct: +{SLOT_BONUS_TITLE}</span></Hint>
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
            <Hint>Pick one survivor you think <b style={{ color: 'rgba(255,255,255,0.7)' }}>will NOT be eliminated</b>. You can’t reuse a previous pool pick.</Hint>
            <Chosen s={poolPick ? byId.get(poolPick) || null : null} placeholder="Choose a survivor" open={openPicker === 'pool'} onOpen={() => togglePicker('pool')} locked={isLocked} />
            {openPicker === 'pool' && !isLocked && (
              <PickerGrid options={poolOptions} selectedId={poolPick} tribes={tribes}
                onSelect={(sid) => { setPoolPick(sid); setOpenPicker(null); setSaveMessage(null); }} />
            )}
          </>) : poolStatus === 'drowned' ? (<>
            <Hint>You’ve been <b style={{ color: '#FF6B35' }}>Drowned</b>. Pick who <b style={{ color: '#FF6B35' }}>WILL be eliminated</b> for a Backdoor attempt (optional).</Hint>
            <Chosen s={backdoorPick ? byId.get(backdoorPick) || null : null} placeholder="Choose a Backdoor pick" open={openPicker === 'backdoor'} onOpen={() => togglePicker('backdoor')} locked={isLocked} />
            {openPicker === 'backdoor' && !isLocked && (
              <PickerGrid options={rosterEligible} selectedId={backdoorPick} tribes={tribes}
                onSelect={(sid) => { setBackdoorPick(sid); setOpenPicker(null); setSaveMessage(null); }} />
            )}
          </>) : (
            <p style={{ fontSize: '12px', color: 'rgba(248,113,113,0.7)', margin: 0 }}>You’ve been <b>Burnt</b> — no more pool picks this season.</p>
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
                <div key={label} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>{label}</div>
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
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginBottom: '10px' }}>
                Already used: {[...usedChips].sort((a, b) => a.episode - b.episode).map(u => `${PICK_CHIPS.find(c => c.id === u.chip)?.name || u.chip} (E${u.episode})`).join(', ')}
              </div>
            )}
            {availableChips.length === 0 && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>You’ve used all four chips.</div>}
            {availableChips.map(c => {
              const on = chip === c.id;
              if (isLocked && !on) return null;
              return (
                <div key={c.id} onClick={() => selectChip(c.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', marginBottom: '6px', borderRadius: '10px', cursor: isLocked ? 'default' : 'pointer', background: on ? 'rgba(5,169,230,0.1)' : 'rgba(255,255,255,0.02)', border: on ? '1px solid rgba(5,169,230,0.45)' : '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '22px' }}>{c.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: on ? '#3fc0f0' : '#fff' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '2px', lineHeight: 1.4 }}>{c.desc}</div>
                  </div>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, border: on ? '2px solid #05a9e6' : '2px solid rgba(255,255,255,0.15)', background: on ? '#05a9e6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <span style={{ fontSize: '12px', color: '#0a0a0f', fontWeight: 800 }}>✓</span>}
                  </div>
                </div>
              );
            })}
            {isLocked && !chip && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>No chip played this episode.</div>}

            {chipDef?.needsSlot && (
              <div style={{ marginTop: '10px', padding: '12px', borderRadius: '10px', background: 'rgba(5,169,230,0.04)', border: '1px solid rgba(5,169,230,0.2)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: '8px' }}>{chipDef.name} applies to</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '6px' }}>
                  {ROSTER_SLOTS.map(({ key, label }) => {
                    const on = chipSlot === key;
                    const pickName = slots[key] ? byId.get(slots[key]!)?.name : null;
                    return (
                      <button key={key} disabled={isLocked} onClick={() => { setChipSlot(key); setSaveMessage(null); }} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: '8px', cursor: isLocked ? 'default' : 'pointer', background: on ? 'rgba(5,169,230,0.15)' : 'rgba(255,255,255,0.02)', border: on ? '1px solid rgba(5,169,230,0.5)' : '1px solid rgba(255,255,255,0.06)', color: on ? '#3fc0f0' : 'rgba(255,255,255,0.7)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700 }}>{label}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{pickName || 'no pick yet'}</div>
                      </button>
                    );
                  })}
                </div>
                {submitAttempted && !chipSlot && <ErrorLine>Choose which slot your {chipDef.name} applies to.</ErrorLine>}

                {chip === 'hedge' && chipSlot && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: '8px' }}>Hedge backup for {SLOT_LABEL[chipSlot]}</div>
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

        {/* ── SUBMIT ── */}
        <div style={{ position: 'sticky', bottom: 0, background: 'linear-gradient(transparent,#0a0a0f 20%)', padding: '20px 0 10px', marginTop: '8px' }}>
          {submitAttempted && issues.length > 0 && !isLocked && (
            <div style={{ marginBottom: '10px', padding: '12px 14px', borderRadius: '10px', background: 'rgba(20,10,10,0.95)', border: '1px solid rgba(248,113,113,0.35)' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '1px', color: '#f87171', marginBottom: '6px', textTransform: 'uppercase' }}>Before you can submit</div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', lineHeight: 1.55, color: 'rgba(255,255,255,0.8)' }}>
                {issues.map((i, n) => <li key={n}>{i}</li>)}
              </ul>
            </div>
          )}
          <button onClick={savePicks} disabled={isLocked || saving}
            style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', cursor: isLocked || saving ? 'default' : 'pointer', fontWeight: 800, fontSize: '15px', letterSpacing: '1.5px', background: isLocked ? 'rgba(248,113,113,0.08)' : 'linear-gradient(135deg,#FF6B35,#FF8F00)', color: isLocked ? 'rgba(248,113,113,0.6)' : '#fff', boxShadow: isLocked ? 'none' : '0 4px 20px rgba(255,107,53,0.3)', opacity: saving ? 0.6 : 1 }}>
            {isLocked ? '🔒 PICKS LOCKED' : saving ? 'Saving...' : existingPick ? '🔥 UPDATE PICKS' : '🔥 SUBMIT PICKS'}
          </button>
          {!isLocked && !submitAttempted && issues.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{issues.length} thing{issues.length > 1 ? 's' : ''} left to do on your card</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WeeklyPicksPage() {
  return <AuthGuard><PicksContent /></AuthGuard>;
}
