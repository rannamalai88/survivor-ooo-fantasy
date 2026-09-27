// Client-side loader for S51 standings, shared by the leaderboard and home pages.
// Everything here is read-only and derived from rows the calculate route writes.

import { supabase } from './supabase/client';
import { SEASON_ID } from './constants';

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
  cards: Record<number, number>;     // episode → card total
  shadowBeat: number;                // all-play: other managers outscored, summed over episodes
  shadowGames: number;               // all-play: other managers faced, summed over episodes
  weeksSurvived: number;
  poolStatus: string;
}

export interface CoupleRow { label: string; managerIds: string[]; championship: number; rank: number }

export interface Standings {
  rows: StandingRow[];
  couples: CoupleRow[];
  scoredEpisodes: number[];
  currentEpisode: number;
}

export async function loadStandings(): Promise<Standings> {
  const [mgrRes, totRes, scoreRes, h2hRes, fxRes, coupleRes, poolRes, epRes, seasonRes] = await Promise.all([
    supabase.from('managers').select('id, name').eq('season_id', SEASON_ID),
    supabase.from('manager_totals').select('*').eq('season_id', SEASON_ID),
    supabase.from('manager_scores').select('manager_id, episode, card_total, shadow_beat').eq('season_id', SEASON_ID),
    supabase.from('h2h_results').select('episode, fixture_id, score_a, score_b').eq('season_id', SEASON_ID),
    supabase.from('fixtures').select('id, manager_a, manager_b').eq('season_id', SEASON_ID),
    supabase.from('couples').select('manager1_id, manager2_id, label').eq('season_id', SEASON_ID),
    supabase.from('pool_status').select('manager_id, status, weeks_survived').eq('season_id', SEASON_ID),
    supabase.from('episodes').select('number').eq('season_id', SEASON_ID).eq('status', 'scored').order('number'),
    supabase.from('seasons').select('current_episode').eq('id', SEASON_ID).single(),
  ]);

  const managers = mgrRes.data || [];
  const totals = totRes.data || [];
  const scores = scoreRes.data || [];
  const fixtures = new Map((fxRes.data || []).map((f: any) => [f.id, f]));
  const results = [...(h2hRes.data || [])].sort((a: any, b: any) => a.episode - b.episode);

  const rows: StandingRow[] = managers.map((m: any) => {
    const t: any = totals.find((x: any) => x.manager_id === m.id) || {};
    const pool: any = (poolRes.data || []).find((x: any) => x.manager_id === m.id) || {};
    const cards: Record<number, number> = {};
    let shadowBeat = 0, shadowGames = 0;
    for (const s of scores) {
      if (s.manager_id !== m.id || s.card_total === null) continue;
      cards[s.episode] = s.card_total;
      shadowBeat += s.shadow_beat || 0;
      shadowGames += managers.length - 1;
    }

    const form: ('W' | 'D' | 'L')[] = [];
    for (const r of results) {
      const f: any = fixtures.get(r.fixture_id);
      if (!f || (f.manager_a !== m.id && f.manager_b !== m.id)) continue;
      const mine = f.manager_a === m.id ? r.score_a : r.score_b;
      const theirs = f.manager_a === m.id ? r.score_b : r.score_a;
      form.push(mine > theirs ? 'W' : mine < theirs ? 'L' : 'D');
    }

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
      played: form.length,
      won: form.filter(x => x === 'W').length,
      drawn: form.filter(x => x === 'D').length,
      lost: form.filter(x => x === 'L').length,
      form,
      cards,
      shadowBeat,
      shadowGames,
      weeksSurvived: pool.weeks_survived || 0,
      poolStatus: pool.status || 'active',
    };
  });

  const couplesRaw = (coupleRes.data || []).map((c: any) => ({
    label: c.label,
    managerIds: [c.manager1_id, c.manager2_id],
    championship: [c.manager1_id, c.manager2_id].reduce((s: number, id: string) => s + (rows.find(r => r.managerId === id)?.championship || 0), 0),
  })).sort((a, b) => b.championship - a.championship);
  const couples: CoupleRow[] = couplesRaw.map((c, i) => ({
    ...c,
    rank: i > 0 && couplesRaw[i - 1].championship === c.championship ? 0 : i + 1,
  }));
  // Shared rank for ties
  for (let i = 1; i < couples.length; i++) if (couples[i].rank === 0) couples[i].rank = couples[i - 1].rank;

  return {
    rows,
    couples,
    scoredEpisodes: (epRes.data || []).map((e: any) => e.number),
    currentEpisode: seasonRes.data?.current_episode || 1,
  };
}

export const fmtPts = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(2).replace(/0$/, ''));
