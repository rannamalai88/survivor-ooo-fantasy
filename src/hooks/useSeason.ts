'use client';

// The seasons row for NEXT_PUBLIC_SEASON_ID (shared, cached — see lib/season-context).
import { useSeasonContext } from '@/lib/season-context';
export type { Season } from '@/lib/season-context';

export function useSeason() {
  const { season, loading } = useSeasonContext();
  return { season, isLoading: loading };
}
