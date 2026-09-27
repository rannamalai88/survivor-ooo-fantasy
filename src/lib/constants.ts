// ============================================================
// Survivor OOO Fantasy — Constants
// ============================================================

export const SEASON_ID = process.env.NEXT_PUBLIC_SEASON_ID || '550e8400-e29b-41d4-a716-446655440000';

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

// Draft order for S50
export const DRAFT_ORDER = [
  'Alli', 'Alan', 'Hari', 'Stephanie', 'Alec', 'Veena',
  'Ramu', 'Cassie', 'Amy', 'Michael', 'Gisele', 'Samin',
];

// Round 5 partner pairings (draft position based: 1↔12, 2↔11, etc.)
export const R5_PARTNERS: Record<string, string> = {
  Alli: 'Samin',
  Samin: 'Alli',
  Alan: 'Gisele',
  Gisele: 'Alan',
  Hari: 'Michael',
  Michael: 'Hari',
  Stephanie: 'Amy',
  Amy: 'Stephanie',
  Alec: 'Cassie',
  Cassie: 'Alec',
  Veena: 'Ramu',
  Ramu: 'Veena',
};

// Couple pairings (for leaderboard)
export const COUPLES = [
  { label: 'Alli & Alec', members: ['Alli', 'Alec'] },
  { label: 'Stephanie & Alan', members: ['Stephanie', 'Alan'] },
  { label: 'Amy & Hari', members: ['Amy', 'Hari'] },
  { label: 'Veena & Ramu', members: ['Veena', 'Ramu'] },
  { label: 'Cassie & Michael', members: ['Cassie', 'Michael'] },
  { label: 'Gisele & Samin', members: ['Gisele', 'Samin'] },
];

// Chip definitions
export const CHIPS = [
  {
    id: 1,
    name: 'Assistant Manager',
    desc: "Get another manager's team points in addition to yours",
    window: 'Week 3-4',
    icon: '🤝',
  },
  {
    id: 2,
    name: 'Team Boost',
    desc: 'Core team (non-Captain) points tripled (3x)',
    window: 'Week 5-6',
    icon: '⚡',
  },
  {
    id: 3,
    name: 'Super Captain',
    desc: "Captain's points quadrupled (4x) instead of doubled",
    window: 'Week 7-8',
    icon: '👑',
  },
  {
    id: 4,
    name: 'Swap Out',
    desc: 'Swap active survivors on your team for any others',
    window: 'Week 9-10',
    icon: '🔄',
  },
  {
    id: 5,
    name: 'Player Add',
    desc: 'Add any active survivor to your team',
    window: 'Week 11-12',
    icon: '➕',
  },
];

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

// Navigation links
export const NAV_LINKS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/picks', label: 'Picks', icon: '✅' },
  { href: '/reveals', label: 'Reveals', icon: '🔓' },
  { href: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { href: '/my-team', label: 'My Team', icon: '👥' },
  { href: '/scoreboard', label: 'Fantasy Scoring', icon: '📊' },
  { href: '/chips', label: 'Chips', icon: '🎰' },
  { href: '/pool', label: 'Pool', icon: '🌊' },
  { href: '/net', label: 'NET', icon: '💬' },
  { href: '/rules', label: 'Rules', icon: '📖' },
  { href: '/draft', label: 'Draft', icon: '📋' },
  { href: '/dynasty', label: 'Dynasty', icon: '👑' },
];
