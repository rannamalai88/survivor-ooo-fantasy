// Client-side loader for S51 standings and analytics, shared by Home, Standings,
// manager profiles and the recap. Read-only; derived from rows `calculate` writes.
// Cached for 30s so moving between pages doesn't refetch.

import { supabase } from './supabase/client';
import { SEASON_ID } from './constants';

export interface MatchResult {
  episode: number;
  opponentId: string;
  opponentName: string;
  myCard: number;
  theirCard: number;
  result: 'W' | 'D' | 'L';
  h2hPoints: number;          // after chips
  chip: string | null;
}

export interface StandingRow {
  managerId: string;
  name: string;
  rank: number | null;               // overall championship rank
  championship: number;
  champFantasy: number;
  champPool: number;
  champQuinfecta: number;
  fantasyRank: number | null;
  poolRank: number | null;
  quinfectaRank: number | null;
  h2hPoints: number;
  rawCardPoints: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  form: ('W' | 'D' | 'L')[];         // most recent last
  results: MatchResult[];            // oldest first
  cards: Record<number, number>;     // episode → card total
  h2hByEpisode: Record<number, number>;
  shadowBeat: number;                // all-play: other managers outscored, summed over episodes
  shadowGames: number;               // all-play: other managers faced, summed over episodes
  expectedWins: number;              // Σ shadow_beat / (n − 1) over played fixtures
  luck: number;                      // (W + ½D) − expectedWins
  rankHistory: { episode: number; rank: number }[];   // H2H table rank after each scored episode
  weeksSurvived: number;
  poolStatus: string;
  idolUsed: boolean;
  hasIdol: boolean;
}

export interface CoupleRow { label: string; managerIds: string[]; championship: number; rank: number }

export interface Standings {
  rows: StandingRow[];
  couples: CoupleRow[];
  scoredEpisodes: number[];
  currentEpisode: number;
  leagueAvg: Record<number, number>;  // episode → average card total
  nameOf: (id: string) => string;
}

const TTL_MS = 30_000;
let cached: { at: number; promise: Promise<Standings> } | null = null;

export function invalidateStandings() { cached = null; }

export function loadStandings(force = false): Promise<Standings> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const promise = fetchStandings();
  cached = { at: Date.now(), promise };
  promise.catch(() => { cached = null; });
  return promise;
}

async function fetchStandings(): Promise<Standings> {
  const [mgrRes, totRes, scoreRes, h2hRes, fxRes, coupleRes, poolRes, epRes, seasonRes] = await Promise.all([
    supabase.from('managers').select('id, name').eq('season_id', SEASON_ID),
    supabase.from('manager_totals').select('*').eq('season_id', SEASON_ID),
    supabase.from('manager_scores').select('manager_id, episode, card_total, h2h_points, shadow_beat, chip').eq('season_id', SEASON_ID),
    supabase.from('h2h_results').select('episode, fixture_id, score_a, score_b, points_a, points_b, chip_a, chip_b').eq('season_id', SEASON_ID),
    supabase.from('fixtures').select('id, manager_a, manager_b').eq('season_id', SEASON_ID),
    supabase.from('couples').select('manager1_id, manager2_id, label').eq('season_id', SEASON_ID),
    supabase.from('pool_status').select('manager_id, status, weeks_survived, has_immunity_idol, idol_used').eq('season_id', SEASON_ID),
    supabase.from('episodes').select('number').eq('season_id', SEASON_ID).eq('status', 'scored').order('number'),
    supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
  ]);

  const managers = (mgrRes.data || []) as { id: string; name: string }[];
  const n = managers.length;
  const nameById = new Map(managers.map(m => [m.id, m.name]));
  const nameOf = (id: string) => nameById.get(id) || 'Unknown';
  const totals = totRes.data || [];
  const scores = scoreRes.data || [];
  const fixtures = new Map((fxRes.data || []).map((f: any) => [f.id, f]));
  const results = [...(h2hRes.data || [])].sort((a: any, b: any) => a.episode - b.episode);
  const scoredEpisodes = (epRes.data || []).map((e: any) => e.number as number);

  const leagueAvg: Record<number, number> = {};
  for (const ep of scoredEpisodes) {
    const vals = scores.filter((s: any) => s.episode === ep && s.card_total !== null).map((s: any) => s.card_total as number);
    if (vals.length) leagueAvg[ep] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }

  const rows: StandingRow[] = managers.map(m => {
    const t: any = totals.find((x: any) => x.manager_id === m.id) || {};
    const pool: any = (poolRes.data || []).find((x: any) => x.manager_id === m.id) || {};
    const cards: Record<number, number> = {};
    const h2hByEpisode: Record<number, number> = {};
    let shadowBeat = 0, shadowGames = 0;
    for (const s of scores as any[]) {
      if (s.manager_id !== m.id || s.card_total === null) continue;
      cards[s.episode] = s.card_total;
      if (s.h2h_points !== null) h2hByEpisode[s.episode] = s.h2h_points;
      shadowBeat += s.shadow_beat || 0;
      shadowGames += n - 1;
    }

    const matchResults: MatchResult[] = [];
    let expectedWins = 0;
    for (const r of results as any[]) {
      const f: any = fixtures.get(r.fixture_id);
      if (!f || (f.manager_a !== m.id && f.manager_b !== m.id)) continue;
      const isA = f.manager_a === m.id;
      const mine = isA ? r.score_a : r.score_b;
      const theirs = isA ? r.score_b : r.score_a;
      const oppId = isA ? f.manager_b : f.manager_a;
      matchResults.push({
        episode: r.episode, opponentId: oppId, opponentName: nameOf(oppId), myCard: mine, theirCard: theirs,
        result: mine > theirs ? 'W' : mine < theirs ? 'L' : 'D',
        h2hPoints: isA ? r.points_a : r.points_b, chip: isA ? r.chip_a : r.chip_b,
      });
      const beat = (scores as any[]).find(s => s.manager_id === m.id && s.episode === r.episode)?.shadow_beat || 0;
      if (n > 1) expectedWins += beat / (n - 1);
    }
    const won = matchResults.filter(x => x.result === 'W').length;
    const drawn = matchResults.filter(x => x.result === 'D').length;

    return {
      managerId: m.id,
      name: m.name,
      rank: t.rank ?? null,
      championship: Number(t.championship_points || 0),
      champFantasy: Number(t.champ_fantasy || 0),
      champPool: Number(t.champ_pool || 0),
      champQuinfecta: Number(t.champ_quinfecta || 0),
      fantasyRank: t.fantasy_rank ?? null,
      poolRank: t.pool_rank ?? null,
      quinfectaRank: t.quinfecta_rank ?? null,
      h2hPoints: t.h2h_points || 0,
      rawCardPoints: t.raw_card_points || 0,
      played: matchResults.length,
      won,
      drawn,
      lost: matchResults.length - won - drawn,
      form: matchResults.map(x => x.result),
      results: matchResults,
      cards,
      h2hByEpisode,
      shadowBeat,
      shadowGames,
      expectedWins: Math.round(expectedWins * 100) / 100,
      luck: Math.round((won + drawn / 2 - expectedWins) * 100) / 100,
      rankHistory: [],
      weeksSurvived: pool.weeks_survived || 0,
      poolStatus: pool.status || 'active',
      idolUsed: !!pool.idol_used,
      hasIdol: !!pool.has_immunity_idol,
    };
  });

  // H2H table rank after each scored episode (points, then card points; ties share)
  for (let i = 0; i < scoredEpisodes.length; i++) {
    const upTo = scoredEpisodes.slice(0, i + 1);
    const snap = rows.map(r => ({
      id: r.managerId,
      pts: upTo.reduce((s, ep) => s + (r.h2hByEpisode[ep] || 0), 0),
      raw: upTo.reduce((s, ep) => s + (r.cards[ep] || 0), 0),
    })).sort((a, b) => b.pts - a.pts || b.raw - a.raw);
    snap.forEach((s, idx) => {
      const prev = snap[idx - 1];
      const rank = idx > 0 && prev.pts === s.pts && prev.raw === s.raw
        ? rows.find(r => r.managerId === prev.id)!.rankHistory.slice(-1)[0].rank
        : idx + 1;
      rows.find(r => r.managerId === s.id)!.rankHistory.push({ episode: scoredEpisodes[i], rank });
    });
  }

  const couplesRaw = (coupleRes.data || []).map((c: any) => ({
    label: c.label,
    managerIds: [c.manager1_id, c.manager2_id],
    championship: [c.manager1_id, c.manager2_id].reduce((s: number, id: string) => s + (rows.find(r => r.managerId === id)?.championship || 0), 0),
  })).sort((a, b) => b.championship - a.championship);
  const couples: CoupleRow[] = [];
  couplesRaw.forEach((c, i) => couples.push({ ...c, rank: i > 0 && couplesRaw[i - 1].championship === c.championship ? couples[i - 1].rank : i + 1 }));

  return {
    rows,
    couples,
    scoredEpisodes,
    currentEpisode: seasonRes.data?.current_episode || 1,
    leagueAvg,
    nameOf,
  };
}

export const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/0$/, ''));
export const fmtSigned = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;
