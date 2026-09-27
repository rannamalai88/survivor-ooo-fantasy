'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SEASON_ID } from '@/lib/constants';

export interface Season {
  id: string;
  number: number;
  name: string;
  status: string;
  current_episode: number;
  total_episodes: number;
  next_episode_title: string | null;
}

// The seasons row for NEXT_PUBLIC_SEASON_ID.
export function useSeason() {
  const [season, setSeason] = useState<Season | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('seasons')
      .select('id, number, name, status, current_episode, total_episodes, next_episode_title')
      .eq('id', SEASON_ID)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('Error loading season:', error);
        setSeason(data as Season | null);
        setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return { season, isLoading };
}
