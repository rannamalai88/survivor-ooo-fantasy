import { IconHome, IconCard, IconSwords, IconTrophy, IconUsers, IconWaves, IconChips, IconSpark, IconBook, IconCrown, IconSettings, IconChart } from '@/components/ui/icons';

export interface NavItem { href: string; label: string; icon: (p: { size?: number; className?: string }) => JSX.Element; match?: string[]; adminOnly?: boolean }

// Bottom tab bar (phones) + first items of the desktop bar
export const PRIMARY_NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: IconHome },
  { href: '/picks', label: 'Picks', icon: IconCard },
  { href: '/matchups', label: 'Matchups', icon: IconSwords, match: ['/matchups', '/reveals', '/breakdown'] },
  { href: '/leaderboard', label: 'Standings', icon: IconTrophy },
];

// "More" menu on phones; the rest of the desktop bar
export const SECONDARY_NAV: NavItem[] = [
  { href: '/managers/me', label: 'My Season', icon: IconChart, match: ['/managers', '/my-team'] },
  { href: '/recap', label: 'Recap', icon: IconSpark },
  { href: '/survivors', label: 'Survivors', icon: IconUsers, match: ['/survivors', '/scoreboard'] },
  { href: '/pool', label: 'Pool', icon: IconWaves },
  { href: '/chips', label: 'Chips', icon: IconChips },
  { href: '/rules', label: 'Rules', icon: IconBook },
  { href: '/dynasty', label: 'Dynasty', icon: IconCrown },
  { href: '/admin', label: 'Admin', icon: IconSettings, adminOnly: true },
];

export function isActive(pathname: string, item: NavItem) {
  if (item.href === '/') return pathname === '/';
  return (item.match || [item.href]).some(p => pathname === p || pathname.startsWith(p + '/'));
}
