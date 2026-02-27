import { TRIBE_COLORS } from './constants';

// Get tribe color with fallback
export function getTribeColor(tribe: string): string {
  return TRIBE_COLORS[tribe] || '#666';
}

// Generate initials from name (handles "Q" with quotes)
export function getInitials(name: string): string {
  const clean = name.replace(/['"]/g, '');
  return clean.charAt(0).toUpperCase();
}

// Format rank with suffix (1st, 2nd, 3rd, etc.)
export function formatRank(rank: number): string {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `${rank}th`;
}

// Snake draft order helper
// Rounds 1, 2, 4: positions 1→12
// Round 3: positions 12→1
// Round 5: partner pick (order 1→12 but partner picks for you)
export function getDraftOrder(round: number, totalManagers: number = 12): number[] {
  const forward = Array.from({ length: totalManagers }, (_, i) => i + 1);
  const reverse = [...forward].reverse();

  switch (round) {
    case 1:
    case 2:
    case 4:
    case 5:
      return forward;
    case 3:
      return reverse;
    default:
      return forward;
  }
}

// Calculate retirement count for a survivor in rounds 2-4
export function getRetirementCount(
  survivorId: string,
  draftPicks: Array<{ survivor_id: string; round: number }>
): number {
  return draftPicks.filter(
    (p) => p.survivor_id === survivorId && p.round >= 2 && p.round <= 4
  ).length;
}

// Check if survivor is retired (drafted 2+ times in rounds 2-4)
export function isRetired(
  survivorId: string,
  draftPicks: Array<{ survivor_id: string; round: number }>
): boolean {
  return getRetirementCount(survivorId, draftPicks) >= 2;
}

// Relative time helper (e.g., "2 hours ago")
export function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}
