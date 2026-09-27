// ============================================================
// Survivor OOO Fantasy — Constants
// ============================================================

export const SEASON_ID = process.env.NEXT_PUBLIC_SEASON_ID || '550e8400-e29b-41d4-a716-446655440000';

// ============================================================
// S51 season shape (spec §2). Reference these — never inline 21 / 51.
// ============================================================
export const SEASON_NUMBER = 51;
export const CAST_SIZE = 21;
export const TRIBES = ['Savu', 'Toka'] as const;
export const H2H_ROUNDS = 11;

// FSG numbers places the opposite way to elimination_order
// (FSG: 1 = winner; DB: 1 = first out).
export const eliminationOrderFromPlace = (fsgPlace: number) => CAST_SIZE + 1 - fsgPlace;
export const placeFromEliminationOrder = (eliminationOrder: number) => CAST_SIZE + 1 - eliminationOrder;

// Quinfecta (E13): exact place +5, one place off +2, all five exact +10
export const QUINFECTA_EXACT = 5;
export const QUINFECTA_ADJACENT = 2;
export const QUINFECTA_PERFECT_BONUS = 10;

// Championship: rank each game, map rank to the curve, multiply by weight
export const PLACEMENT_CURVE = [12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
export const WEIGHTS = { fantasy: 3, pool: 1.5, quinfecta: 1 } as const;

// H2H fixture points
export const H2H_POINTS = { win: 3, draw: 1, loss: 0 } as const;

// Tribe colors (S51 first; S50 tribes kept so last season's data still renders)
export const TRIBE_COLORS: Record<string, string> = {
  Savu: '#8b2bc0',
  Toka: '#f0c624',
  Vatu: '#9B59B6',
  Kalo: '#1ABC9C',
  Cila: '#E67E22',
};

// Status colors
export const STATUS_COLORS: Record<string, string> = {
  active: '#1ABC9C',
  drowned: '#E74C3C',
  burnt: '#95a5a6',
  finished: '#FFD54F',
};

// ============================================================
// S51 pick card
// ============================================================

// The four roster slots. Picks across these must be four different survivors
// (enforced in the pick card, not the database).
export type RosterSlot = 'reward' | 'immunity' | 'going_home' | 'mop';

export const ROSTER_SLOTS: { key: RosterSlot; column: string; label: string; icon: string; desc: string }[] = [
  { key: 'reward',     column: 'reward_pick_id',     label: 'Reward Winner',     icon: '🍖', desc: 'Wins a reward challenge (tribe or individual).' },
  { key: 'immunity',   column: 'immunity_pick_id',   label: 'Immunity Winner',   icon: '🗿', desc: 'Wins an immunity challenge (tribe or individual).' },
  { key: 'going_home', column: 'going_home_pick_id', label: 'Going Home',        icon: '🔥', desc: 'Leaves the game this episode — voted out, quit, or evacuated.' },
  { key: 'mop',        column: 'mop_pick_id',        label: 'Most Other Points', icon: '📈', desc: 'Scores the most non-challenge FSG points this episode (ties pay everyone).' },
];

export type PickChip = 'triple_down' | 'double_fixture' | 'point_shield' | 'hedge';

// needsSlot: chip targets one roster slot (stored in weekly_picks.chip_slot).
// Double Fixture and Point Shield act on the H2H fixture, so chip_slot stays null.
export const PICK_CHIPS: { id: PickChip; name: string; icon: string; desc: string; needsSlot: boolean }[] = [
  { id: 'triple_down',    name: 'Triple Down',    icon: '🎲', desc: 'If the target slot hits, it scores 3× instead of 2×.',                         needsSlot: true },
  { id: 'hedge',          name: 'Hedge',          icon: '🛡', desc: 'Name a second survivor for the target slot. Whichever does better counts.',    needsSlot: true },
  { id: 'double_fixture', name: 'Double Fixture', icon: '⚔️', desc: 'Your H2H result counts double (6 for a win, 2 for a draw).',                    needsSlot: false },
  { id: 'point_shield',   name: 'Point Shield',   icon: '🧱', desc: 'If you lose your H2H fixture, it counts as a draw instead.',                     needsSlot: false },
];

// Slot scoring values (S51 spec §2). A slot hit doubles the survivor's points.
export const SLOT_BONUS_GOING_HOME = 5;
export const SLOT_BONUS_TITLE = 1;
export const PENALTY = { immunity: -5, reward: -3, mop: -3 } as const;

// Chips are playable E2–E12 only, one per episode, each once per season.
export const CHIP_FIRST_EP = 2;
export const CHIP_LAST_EP = 12;

