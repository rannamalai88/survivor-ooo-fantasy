// =============================================================================
// lib/scoring.ts — S51 scoring rules (pure functions, no database access)
// =============================================================================
// These doc comments ARE the spec. See S51_TECHNICAL_SPEC_v2.md §4.
//
// Per card, each of the four roster slots scores:
//   base    = sum of the survivor's FSG action points this episode
//   hit     = the slot's condition was met (table below)
//   mult    = hit ? 2 : 1   (Triple Down on the chip slot: 3 when hit)
//   bonus   = +5 when the Going Home slot hits
//   penalty = the survivor left the game and the slot isn't Going Home:
//             Immunity −5, Reward −3, MOP −3. Uncapped; multi-boot weeks stack.
//   total   = base × mult + bonus + penalty   (may be negative)
//
//   Slot        Hit when
//   reward      a reward challenge happened AND pick won one
//   immunity    an immunity challenge happened AND pick won one
//   going_home  pick left the game (voted out, quit/evac, out of game)
//   mop         pick has the most Other points (ties pay everyone)
//
// No-event rule: if no reward challenge happened, the Reward slot scores base
// points only — no double, no penalty. The same applies to Immunity when no
// immunity challenge happened, to MOP when nobody scored Other points, and to
// Going Home when nobody left (it can't hit, so no double and no bonus).
//
// Title slot: +1 if the pick said the episode title. Never multiplied.
// manual_adjustment on a picked survivor passes through UNMULTIPLIED as its
// own 'adjustment' line.
//
// Chip order: Hedge → slot scoring → Triple Down → fixture → Double Fixture /
// Point Shield. Chips are E2–E12 only, one per episode, one use each per season.
// =============================================================================

import {
  PENALTY, SLOT_BONUS_GOING_HOME, SLOT_BONUS_TITLE, H2H_POINTS, PLACEMENT_CURVE,
  QUINFECTA_EXACT, QUINFECTA_ADJACENT, QUINFECTA_PERFECT_BONUS,
  CHIP_FIRST_EP, CHIP_LAST_EP, ROSTER_SLOTS, PICK_CHIPS,
  type RosterSlot, type PickChip,
} from './constants';
import type { EventCategory } from './fsg-parser';

// --- Types -------------------------------------------------------------------

export interface EpisodeEvent {
  survivorId: string;
  action: string;
  points: number;
  category: EventCategory;
}

export interface Outcomes {
  rewardHappened: boolean;
  immunityHappened: boolean;
  rewardWinners: string[];
  immunityWinners: string[];
  departures: string[];
  mopWinners: string[];
  otherPoints: Record<string, number>;
}

export interface CardInput {
  picks: Record<RosterSlot, string | null>;
  titlePickId: string | null;
  chip: PickChip | null;
  chipSlot: RosterSlot | null;
  hedgeAltId: string | null;
}

export type LineSlot = RosterSlot | 'title' | 'adjustment';

export interface ScoreLine {
  slot: LineSlot;
  survivorId: string | null;
  basePoints: number;
  multiplier: number;
  bonus: number;
  penalty: number;
  total: number;
  reason: string;
}

export interface ScoringContext {
  episode: number;
  outcomes: Outcomes;
  eventsBySurvivor: Record<string, EpisodeEvent[]>;
  names: Record<string, string>;                 // survivor id → display name
  departureKind: Record<string, string>;         // survivor id → "Voted out" etc.
  adjustments: Record<string, number>;           // survivor id → manual_adjustment
  titleAnswerId: string | null | undefined;      // undefined = no answer recorded yet
}

export interface CardResult {
  lines: ScoreLine[];
  cardTotal: number;
  penaltyTotal: number;
  titleCorrect: boolean;
  chip: PickChip | null;         // the chip that actually applied (null if invalid / none)
  chipSlot: RosterSlot | null;
  chipNote: string | null;       // why a submitted chip was ignored, if it was
}

const SLOT_LABEL: Record<RosterSlot, string> =
  Object.fromEntries(ROSTER_SLOTS.map(s => [s.key, s.label])) as Record<RosterSlot, string>;
const CHIP_NAME: Record<PickChip, string> =
  Object.fromEntries(PICK_CHIPS.map(c => [c.id, c.name])) as Record<PickChip, string>;

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const pts = (n: number) => `${n} pt${Math.abs(n) === 1 ? '' : 's'}`;

// --- Outcomes ------------------------------------------------------------------

/** Spec §3.4. MOP winners are everyone tied for the most Other points (> 0). */
export function deriveOutcomes(events: EpisodeEvent[]): Outcomes {
  const uniq = (xs: string[]) => [...new Set(xs)];
  const rewardWinners = uniq(events.filter(e => e.category === 'reward').map(e => e.survivorId));
  const immunityWinners = uniq(events.filter(e => e.category === 'immunity').map(e => e.survivorId));
  const departures = uniq(events.filter(e => e.category === 'departure').map(e => e.survivorId));

  const otherPoints: Record<string, number> = {};
  for (const e of events) {
    if (e.category === 'other') otherPoints[e.survivorId] = (otherPoints[e.survivorId] || 0) + e.points;
  }
  const max = Math.max(0, ...Object.values(otherPoints));
  const mopWinners = max > 0 ? Object.keys(otherPoints).filter(id => otherPoints[id] === max) : [];

  return {
    rewardHappened: rewardWinners.length > 0,
    immunityHappened: immunityWinners.length > 0,
    rewardWinners, immunityWinners, departures, mopWinners, otherPoints,
  };
}

/** Sum of a survivor's FSG action points this episode (departure rows carry 0). */
export function basePointsFor(survivorId: string, ctx: ScoringContext): number {
  return (ctx.eventsBySurvivor[survivorId] || []).reduce((s, e) => s + e.points, 0);
}

// --- Chip validation -----------------------------------------------------------

/** Returns null if the chip may apply, otherwise the reason it is ignored. */
export function chipProblem(episode: number, card: CardInput, usedInOtherEpisodes: PickChip[]): string | null {
  if (!card.chip) return null;
  const def = PICK_CHIPS.find(c => c.id === card.chip);
  if (!def) return `Unknown chip "${card.chip}" ignored.`;
  if (episode < CHIP_FIRST_EP || episode > CHIP_LAST_EP) return `${def.name} ignored — chips only apply in episodes ${CHIP_FIRST_EP}–${CHIP_LAST_EP}.`;
  if (usedInOtherEpisodes.includes(card.chip)) return `${def.name} ignored — already used earlier this season.`;
  if (def.needsSlot && !card.chipSlot) return `${def.name} ignored — no target slot chosen.`;
  if (card.chip === 'hedge' && !card.hedgeAltId) return 'Hedge ignored — no backup survivor chosen.';
  return null;
}

// --- Slot scoring ----------------------------------------------------------------

function scoreSlot(slot: RosterSlot, survivorId: string, ctx: ScoringContext, tripleDown: boolean): ScoreLine {
  const o = ctx.outcomes;
  const name = ctx.names[survivorId] || 'Unknown survivor';
  const base = basePointsFor(survivorId, ctx);
  const departed = o.departures.includes(survivorId);

  const happened = slot === 'reward' ? o.rewardHappened
    : slot === 'immunity' ? o.immunityHappened
    : slot === 'mop' ? o.mopWinners.length > 0
    : true;
  const hit = slot === 'reward' ? happened && o.rewardWinners.includes(survivorId)
    : slot === 'immunity' ? happened && o.immunityWinners.includes(survivorId)
    : slot === 'going_home' ? departed
    : o.mopWinners.includes(survivorId);

  const multiplier = hit ? (tripleDown ? 3 : 2) : 1;
  const bonus = slot === 'going_home' && hit ? SLOT_BONUS_GOING_HOME : 0;
  const penalty = departed && slot !== 'going_home' && happened ? PENALTY[slot] : 0;
  const total = base * multiplier + bonus + penalty;

  const parts: string[] = [];
  const doubled = `${pts(base)} ×${multiplier}${tripleDown && hit ? ' (Triple Down)' : ''} = ${base * multiplier}`;

  if (slot === 'reward' || slot === 'immunity') {
    const kind = slot === 'reward' ? 'reward' : 'immunity';
    if (!happened) parts.push(`No ${kind} challenge this episode, so ${name} scores base points only: ${pts(base)}.`);
    else if (hit) parts.push(`${name} won ${kind}. Slot hit: ${doubled}.`);
    else parts.push(`${name} didn't win ${kind}. ${pts(base)}, not doubled.`);
  } else if (slot === 'going_home') {
    if (hit) parts.push(`${name} left the game (${ctx.departureKind[survivorId] || 'departed'}). Slot hit: ${doubled}, plus ${signed(SLOT_BONUS_GOING_HOME)} Going Home bonus.`);
    else if (o.departures.length === 0) parts.push(`Nobody left the game this episode, so ${name} scores base points only: ${pts(base)}.`);
    else parts.push(`${name} stayed in the game. ${pts(base)}, not doubled.`);
  } else {
    const mine = o.otherPoints[survivorId] || 0;
    const max = Math.max(0, ...Object.values(o.otherPoints));
    const tiedWith = o.mopWinners.filter(id => id !== survivorId).map(id => ctx.names[id] || '?');
    if (!happened) parts.push(`Nobody scored Other points this episode, so ${name} scores base points only: ${pts(base)}.`);
    else if (hit) parts.push(`${name} had the most Other points (${mine})${tiedWith.length ? `, tied with ${tiedWith.join(', ')}` : ''}. Slot hit: ${doubled}.`);
    else parts.push(`${name} had ${mine} Other point${mine === 1 ? '' : 's'}; the most was ${max} (${o.mopWinners.map(id => ctx.names[id] || '?').join(', ')}). ${pts(base)}, not doubled.`);
  }
  if (tripleDown && !hit) parts.push('Triple Down did not trigger because the slot missed.');
  if (penalty) parts.push(`${name} left the game, so ${penalty} penalty for losing your ${SLOT_LABEL[slot]} pick.`);
  if (departed && slot !== 'going_home' && !happened) parts.push(`${name} left the game, but there's no penalty because the event didn't happen.`);
  parts.push(`Slot total: ${total}.`);

  return { slot, survivorId, basePoints: base, multiplier, bonus, penalty, total, reason: parts.join(' ') };
}

function emptyLine(slot: LineSlot, reason: string): ScoreLine {
  return { slot, survivorId: null, basePoints: 0, multiplier: 1, bonus: 0, penalty: 0, total: 0, reason };
}

/**
 * Scores one manager's card. `card` null = no card submitted (all slots 0).
 * `usedInOtherEpisodes` is the manager's chips from other episodes, for the
 * one-use-per-season check at scoring time.
 */
export function scoreCard(card: CardInput | null, ctx: ScoringContext, usedInOtherEpisodes: PickChip[] = []): CardResult {
  const lines: ScoreLine[] = [];

  if (!card) {
    for (const { key } of ROSTER_SLOTS) lines.push(emptyLine(key, 'No card submitted.'));
    lines.push(emptyLine('title', 'No card submitted.'));
    return { lines, cardTotal: 0, penaltyTotal: 0, titleCorrect: false, chip: null, chipSlot: null, chipNote: null };
  }

  const problem = chipProblem(ctx.episode, card, usedInOtherEpisodes);
  const chip = problem ? null : card.chip;
  const chipSlot = chip && PICK_CHIPS.find(c => c.id === chip)?.needsSlot ? card.chipSlot : null;

  const resolved: Partial<Record<RosterSlot, string>> = {};

  for (const { key } of ROSTER_SLOTS) {
    const pick = card.picks[key];
    if (!pick) { lines.push(emptyLine(key, `No ${SLOT_LABEL[key]} pick.`)); continue; }
    const tripleDown = chip === 'triple_down' && chipSlot === key;

    // 1. Hedge resolves first: whichever survivor gives the better slot total counts.
    if (chip === 'hedge' && chipSlot === key && card.hedgeAltId) {
      const a = scoreSlot(key, pick, ctx, false);
      const b = scoreSlot(key, card.hedgeAltId, ctx, false);
      const useAlt = b.total > a.total;
      const chosen = useAlt ? b : a;
      const nA = ctx.names[pick] || '?', nB = ctx.names[card.hedgeAltId] || '?';
      chosen.reason = `Hedge: ${nA} would score ${a.total}, ${nB} would score ${b.total} — ${useAlt ? nB : nA} counts${a.total === b.total ? ' (tie keeps your main pick)' : ''}. ` + chosen.reason;
      lines.push(chosen);
      resolved[key] = chosen.survivorId!;
      continue;
    }

    // 2. Slot scoring, with Triple Down applied to the multiplier when it hits.
    lines.push(scoreSlot(key, pick, ctx, tripleDown));
    resolved[key] = pick;
  }

  // Title (+1, never multiplied)
  let titleCorrect = false;
  if (!card.titlePickId) lines.push(emptyLine('title', 'No Title pick.'));
  else {
    const name = ctx.names[card.titlePickId] || 'Unknown';
    if (ctx.titleAnswerId === undefined) {
      lines.push({ ...emptyLine('title', `You picked ${name}. No title answer has been recorded for this episode yet.`), survivorId: card.titlePickId });
    } else if (ctx.titleAnswerId === card.titlePickId) {
      titleCorrect = true;
      lines.push({ slot: 'title', survivorId: card.titlePickId, basePoints: 0, multiplier: 1, bonus: SLOT_BONUS_TITLE, penalty: 0, total: SLOT_BONUS_TITLE, reason: `${name} said the episode title. ${signed(SLOT_BONUS_TITLE)}.` });
    } else {
      const who = ctx.titleAnswerId ? ctx.names[ctx.titleAnswerId] || 'someone else' : 'nobody on your list';
      lines.push({ ...emptyLine('title', `The title was said by ${who}; you picked ${name}. 0 pts.`), survivorId: card.titlePickId });
    }
  }

  // Manual adjustments on survivors who actually scored in a roster slot (unmultiplied)
  for (const id of new Set(Object.values(resolved))) {
    const adj = id ? ctx.adjustments[id] || 0 : 0;
    if (id && adj !== 0) {
      lines.push({ slot: 'adjustment', survivorId: id, basePoints: adj, multiplier: 1, bonus: 0, penalty: 0, total: adj, reason: `Commissioner adjustment for ${ctx.names[id] || '?'}: ${signed(adj)} (never multiplied).` });
    }
  }

  const cardTotal = lines.reduce((s, l) => s + l.total, 0);
  const penaltyTotal = lines.reduce((s, l) => s + l.penalty, 0);
  return { lines, cardTotal, penaltyTotal, titleCorrect, chip, chipSlot, chipNote: problem };
}

// --- H2H -------------------------------------------------------------------------

/**
 * 3 / 1 / 0. Double Fixture doubles only the player's own points (6/2/0);
 * Point Shield turns that player's loss into a draw (0 → 1). Both players'
 * chips apply independently.
 */
export function resolveFixture(scoreA: number, scoreB: number, chipA: PickChip | null, chipB: PickChip | null) {
  const side = (mine: number, theirs: number, chip: PickChip | null) => {
    const result: 'win' | 'draw' | 'loss' = mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw';
    let points: number = H2H_POINTS[result];
    let note = `${result === 'win' ? 'Win' : result === 'draw' ? 'Draw' : 'Loss'} (${mine}–${theirs}): ${points}`;
    if (chip === 'double_fixture') { points *= 2; note += `, doubled by Double Fixture = ${points}`; }
    if (chip === 'point_shield' && result === 'loss') { points = H2H_POINTS.draw; note += `, Point Shield turns it into a draw = ${points}`; }
    return { result, points, note };
  };
  return { a: side(scoreA, scoreB, chipA), b: side(scoreB, scoreA, chipB) };
}

// --- Ranking & championship --------------------------------------------------------

/**
 * Ranks items by `keys` (all descending). Items equal on every key share a rank
 * and split the PLACEMENT_CURVE points of the positions they occupy.
 */
export function rankAndShare<T>(items: T[], keys: (item: T) => number[]): { item: T; rank: number; curvePoints: number }[] {
  const sorted = [...items].sort((x, y) => {
    const a = keys(x), b = keys(y);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
    return 0;
  });
  const out: { item: T; rank: number; curvePoints: number }[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    const k = keys(sorted[i]).join('|');
    while (j + 1 < sorted.length && keys(sorted[j + 1]).join('|') === k) j++;
    let pool = 0;
    for (let p = i; p <= j; p++) pool += PLACEMENT_CURVE[p] ?? 0;
    const share = pool / (j - i + 1);
    for (let p = i; p <= j; p++) out.push({ item: sorted[p], rank: i + 1, curvePoints: share });
    i = j + 1;
  }
  return out;
}

// --- Quinfecta (E13) -----------------------------------------------------------------

/**
 * `predicted[p-1]` is the survivor predicted to finish in FSG place p (1 = winner).
 * `actualPlace` maps survivor id → FSG place. Exact +5, one place off +2,
 * all five exact +10. Max 35.
 */
export function scoreQuinfecta(predicted: (string | null)[], actualPlace: Record<string, number>) {
  const perPlace = predicted.slice(0, 5).map((id, i) => {
    const place = i + 1;
    if (!id) return { place, survivorId: null, points: 0, note: 'No prediction' };
    const actual = actualPlace[id];
    if (actual === place) return { place, survivorId: id, points: QUINFECTA_EXACT, note: 'Exact' };
    if (actual !== undefined && Math.abs(actual - place) === 1) return { place, survivorId: id, points: QUINFECTA_ADJACENT, note: `One off (finished ${actual})` };
    return { place, survivorId: id, points: 0, note: actual ? `Finished ${actual}` : 'Place unknown' };
  });
  const perfect = perPlace.length === 5 && perPlace.every(p => p.note === 'Exact');
  const total = perPlace.reduce((s, p) => s + p.points, 0) + (perfect ? QUINFECTA_PERFECT_BONUS : 0);
  return { perPlace, perfect, total };
}
