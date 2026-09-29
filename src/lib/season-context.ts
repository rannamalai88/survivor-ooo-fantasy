'use client';

// Season row + the current episode row, fetched once and shared by every
// component (top bar, pages). Cached for a minute so navigation is instant.

import { useEffect, useState } from 'react';
import { supabase } from './supabase/client';
import { SEASON_ID } from './constants';

export interface Season {
  id: string; number: number; name: string; status: string;
  current_episode: number; total_episodes: number;
}
export interface EpisodeRow {
  number: number; air_date: string; lock_at: string; h2h_round: number | null; status: string;
  is_finale: boolean; is_couples_week: boolean; is_rivalry_week: boolean;
  title: string | null; is_post_merge: boolean;
}
export interface SeasonContext { season: Season | null; episode: EpisodeRow | null; episodes: EpisodeRow[] }

const TTL_MS = 60_000;
let cached: { at: number; promise: Promise<SeasonContext> } | null = null;

export function loadSeasonContext(force = false): Promise<SeasonContext> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const promise = (async () => {
    const [{ data: season }, { data: episodes }] = await Promise.all([
      supabase.from('seasons').select('id, number, name, status, current_episode, total_episodes').eq('id', SEASON_ID).maybeSingle(),
      supabase.from('episodes').select('number, air_date, lock_at, h2h_round, status, is_finale, is_couples_week, is_rivalry_week, title, is_post_merge').eq('season_id', SEASON_ID).order('number'),
    ]);
    const eps = (episodes || []) as EpisodeRow[];
    return {
      season: season as Season | null,
      episodes: eps,
      episode: season ? eps.find(e => e.number === season.current_episode) ?? null : null,
    };
  })();
  cached = { at: Date.now(), promise };
  promise.catch(() => { cached = null; });
  return promise;
}

export function useSeasonContext() {
  const [ctx, setCtx] = useState<SeasonContext & { loading: boolean }>({ season: null, episode: null, episodes: [], loading: true });
  useEffect(() => {
    let alive = true;
    loadSeasonContext().then(c => { if (alive) setCtx({ ...c, loading: false }); }).catch(() => { if (alive) setCtx(s => ({ ...s, loading: false })); });
    return () => { alive = false; };
  }, []);
  return ctx;
}
