// ============================================================
// Survivor OOO Fantasy — Constants
// ============================================================

export const SEASON_ID = process.env.NEXT_PUBLIC_SEASON_ID || '550e8400-e29b-41d4-a716-446655440000';

// Tribe colors
export const TRIBE_COLORS: Record<string, string> = {
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

// Navigation links
export const NAV_LINKS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/draft', label: 'Draft', icon: '📋' },
  { href: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
  { href: '/my-team', label: 'My Team', icon: '👥' },
  { href: '/picks', label: 'Picks', icon: '✅' },
  { href: '/scoreboard', label: 'Scoreboard', icon: '📊' },
  { href: '/pool', label: 'Pool', icon: '🌊' },
  { href: '/dynasty', label: 'Dynasty', icon: '👑' },
  { href: '/rules', label: 'Rules', icon: '📖' },
];
