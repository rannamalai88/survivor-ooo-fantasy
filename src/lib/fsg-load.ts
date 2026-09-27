// Server-side: fetch + parse both FSG pages and map FSG ids onto our survivors.
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchFSGRecapPage, fetchFSGSeasonPage, parseRecap, parseSeasonStats, type ParsedEpisode, type ParsedSeasonRow } from './fsg-parser';
import { checkCumulative, checkSummary, type SurvivorRef } from './fsg-checks';

export interface DbSurvivor {
  id: string; fsg_id: number | null; name: string; tribe: string; original_tribe: string | null;
  is_active: boolean; is_playable: boolean; eliminated_episode: number | null; elimination_order: number | null;
}

export interface LoadedFSG {
  seasonNumber: number;
  episodes: ParsedEpisode[];
  seasonRows: ParsedSeasonRow[];
  survivors: DbSurvivor[];
  byFsgId: Map<number, SurvivorRef>;
  unmappedFsgIds: number[];           // FSG ids with no survivors row — blocks writes
  cumulativeIssues: string[];
}

export async function loadFSG(supabase: SupabaseClient, seasonId: string): Promise<LoadedFSG> {
  const { data: season, error: seasonErr } = await supabase.from('seasons').select('number').eq('id', seasonId).single();
  if (seasonErr || !season) throw new Error(`Season ${seasonId} not found`);

  const [recapHtml, seasonHtml, survRes] = await Promise.all([
    fetchFSGRecapPage(season.number),
    fetchFSGSeasonPage(season.number),
    supabase.from('survivors')
      .select('id, fsg_id, name, tribe, original_tribe, is_active, is_playable, eliminated_episode, elimination_order')
      .eq('season_id', seasonId),
  ]);
  if (survRes.error) throw survRes.error;

  const episodes = parseRecap(recapHtml);
  const seasonRows = parseSeasonStats(seasonHtml);
  const survivors = (survRes.data || []) as DbSurvivor[];

  const byFsgId = new Map<number, SurvivorRef>();
  for (const s of survivors) {
    if (s.fsg_id) byFsgId.set(s.fsg_id, { id: s.id, fsgId: s.fsg_id, name: s.name, tribe: s.tribe, originalTribe: s.original_tribe });
  }

  const seen = new Set<number>();
  for (const ep of episodes) {
    for (const e of ep.events) seen.add(e.fsgId);
    if (ep.soleSurvivor) seen.add(ep.soleSurvivor.fsgId);
  }
  for (const r of seasonRows) seen.add(r.fsgId);
  const unmappedFsgIds = [...seen].filter(id => !byFsgId.has(id));

  return {
    seasonNumber: season.number, episodes, seasonRows, survivors, byFsgId, unmappedFsgIds,
    cumulativeIssues: checkCumulative(episodes, seasonRows, byFsgId),
  };
}

export function summaryIssues(ep: ParsedEpisode, loaded: LoadedFSG) {
  return checkSummary(ep, loaded.byFsgId);
}

/** Parsed events keyed by our survivor UUIDs (unmapped ids dropped — check unmappedFsgIds first). */
export function toEpisodeEvents(ep: ParsedEpisode, byFsgId: Map<number, SurvivorRef>) {
  return ep.events
    .filter(e => byFsgId.has(e.fsgId))
    .map(e => ({ survivorId: byFsgId.get(e.fsgId)!.id, action: e.action, points: e.points, category: e.category }));
}
