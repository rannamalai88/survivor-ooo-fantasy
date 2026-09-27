// Weekly recap + superlatives for one scored episode. Client-side, read-only.

import { supabase } from './supabase/client';
import { SEASON_ID, ROSTER_SLOTS, PICK_CHIPS, type RosterSlot } from './constants';
import { walkPool } from './pool';

export interface RecapManager { managerId: string; name: string }
export interface Recap {
  episode: number;
  cards: (RecapManager & { total: number })[];                 // sorted high → low
  highCard: (RecapManager & { total: number }) | null;
  lowCard: (RecapManager & { total: number }) | null;
  average: number;
  blowout: { winner: RecapManager; loser: RecapManager; winnerScore: number; loserScore: number; margin: number } | null;
  closest: { a: RecapManager; b: RecapManager; aScore: number; bScore: number; margin: number } | null;
  bestLine: (RecapManager & { slot: string; survivorName: string; total: number }) | null;
  worstLine: (RecapManager & { slot: string; survivorName: string; total: number }) | null;
  popular: { slot: RosterSlot; label: string; survivorId: string; survivorName: string; count: number; avgTotal: number; hit: boolean }[];
  title: { answerName: string | null; correct: string[] } ;
  chips: (RecapManager & { chip: string; chipName: string; slot: string | null })[];
  pool: { drowned: string[]; idolSaves: string[]; backdoorHits: string[]; stillActive: number };
  departures: string[];
}

const SLOT_LABEL: Record<string, string> = Object.fromEntries(ROSTER_SLOTS.map(s => [s.key, s.label]));

export async function loadRecap(episode: number): Promise<Recap | null> {
  const [mgrRes, scoresRes, linesRes, h2hRes, fxRes, picksRes, survRes, netRes, poolRes, outRes] = await Promise.all([
    supabase.from('managers').select('id, name').eq('season_id', SEASON_ID),
    supabase.from('manager_scores').select('manager_id, card_total, chip, chip_slot').eq('season_id', SEASON_ID).eq('episode', episode),
    supabase.from('score_lines').select('manager_id, slot, survivor_id, total, multiplier').eq('season_id', SEASON_ID).eq('episode', episode),
    supabase.from('h2h_results').select('fixture_id, score_a, score_b').eq('season_id', SEASON_ID).eq('episode', episode),
    supabase.from('fixtures').select('id, manager_a, manager_b').eq('season_id', SEASON_ID),
    supabase.from('weekly_picks').select('manager_id, episode, reward_pick_id, immunity_pick_id, going_home_pick_id, mop_pick_id, title_pick_id, pool_pick_id, pool_backdoor_id').eq('season_id', SEASON_ID).lte('episode', episode),
    supabase.from('survivors').select('id, name, is_active, eliminated_episode').eq('season_id', SEASON_ID),
    supabase.from('net_answers').select('correct_survivor_id').eq('season_id', SEASON_ID).eq('episode', episode).maybeSingle(),
    supabase.from('pool_status').select('manager_id, has_immunity_idol').eq('season_id', SEASON_ID),
    supabase.from('episode_outcomes').select('departures').eq('season_id', SEASON_ID).eq('episode', episode).maybeSingle(),
  ]);

  const scores = scoresRes.data || [];
  if (!scores.length) return null;
  const managers = mgrRes.data || [];
  const survivors = survRes.data || [];
  const m = (id: string): RecapManager => ({ managerId: id, name: managers.find((x: any) => x.id === id)?.name || '?' });
  const sName = (id: string | null) => (id && survivors.find((s: any) => s.id === id)?.name) || '—';

  const cards = scores.filter((s: any) => s.card_total !== null)
    .map((s: any) => ({ ...m(s.manager_id), total: s.card_total as number }))
    .sort((a, b) => b.total - a.total);
  const average = cards.length ? Math.round((cards.reduce((s, c) => s + c.total, 0) / cards.length) * 10) / 10 : 0;

  // Fixtures
  const fx = new Map((fxRes.data || []).map((f: any) => [f.id, f]));
  const games = (h2hRes.data || []).map((r: any) => {
    const f: any = fx.get(r.fixture_id);
    return f ? { a: f.manager_a as string, b: f.manager_b as string, sa: r.score_a as number, sb: r.score_b as number } : null;
  }).filter(Boolean) as { a: string; b: string; sa: number; sb: number }[];
  const decided = games.filter(g => g.sa !== g.sb);
  const big = [...decided].sort((x, y) => Math.abs(y.sa - y.sb) - Math.abs(x.sa - x.sb))[0];
  const close = [...games].sort((x, y) => Math.abs(x.sa - x.sb) - Math.abs(y.sa - y.sb))[0];

  // Lines
  const roster = (linesRes.data || []).filter((l: any) => ROSTER_SLOTS.some(s => s.key === l.slot) && l.survivor_id);
  const best = [...roster].sort((a: any, b: any) => b.total - a.total)[0];
  const worst = [...roster].sort((a: any, b: any) => a.total - b.total)[0];

  // Popular picks per slot (from locked cards)
  const epPicks = (picksRes.data || []).filter((p: any) => p.episode === episode);
  const col: Record<RosterSlot, string> = { reward: 'reward_pick_id', immunity: 'immunity_pick_id', going_home: 'going_home_pick_id', mop: 'mop_pick_id' };
  const popular = ROSTER_SLOTS.map(({ key, label }) => {
    const counts = new Map<string, number>();
    for (const p of epPicks as any[]) if (p[col[key]]) counts.set(p[col[key]], (counts.get(p[col[key]]) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) return null;
    const lines = roster.filter((l: any) => l.slot === key && l.survivor_id === top[0]);
    const avgTotal = lines.length ? Math.round((lines.reduce((s: number, l: any) => s + l.total, 0) / lines.length) * 10) / 10 : 0;
    return { slot: key, label, survivorId: top[0], survivorName: sName(top[0]), count: top[1], avgTotal, hit: lines.some((l: any) => l.multiplier > 1) };
  }).filter(Boolean) as Recap['popular'];

  // Title
  const answer = netRes.data?.correct_survivor_id ?? null;
  const correct = answer ? epPicks.filter((p: any) => p.title_pick_id === answer).map((p: any) => m(p.manager_id).name) : [];

  // Chips
  const chips = scores.filter((s: any) => s.chip).map((s: any) => ({
    ...m(s.manager_id), chip: s.chip, chipName: PICK_CHIPS.find(c => c.id === s.chip)?.name || s.chip, slot: s.chip_slot ? SLOT_LABEL[s.chip_slot] : null,
  }));

  // Pool: compare the walk through this episode vs the one before
  const survMap = new Map(survivors.map((s: any) => [s.id, s]));
  const drowned: string[] = [], idolSaves: string[] = [], backdoorHits: string[] = [];
  let stillActive = 0;
  for (const mgr of managers as any[]) {
    const byEp: Record<number, any> = {};
    for (const p of picksRes.data || []) if ((p as any).manager_id === mgr.id) byEp[(p as any).episode] = p;
    const hasIdol = !!(poolRes.data || []).find((p: any) => p.manager_id === mgr.id)?.has_immunity_idol;
    const walk = walkPool(byEp, survMap as any, hasIdol, episode);
    const week = walk.weeks.find(w => w.episode === episode);
    if (week?.type === 'drowned' || week?.type === 'missed') drowned.push(mgr.name);
    if (week?.type === 'idol') idolSaves.push(mgr.name);
    if (week?.type === 'backdoor_hit') backdoorHits.push(mgr.name);
    if (walk.status === 'active') stillActive++;
  }

  return {
    episode,
    cards,
    highCard: cards[0] || null,
    lowCard: cards[cards.length - 1] || null,
    average,
    blowout: big ? (big.sa > big.sb
      ? { winner: m(big.a), loser: m(big.b), winnerScore: big.sa, loserScore: big.sb, margin: big.sa - big.sb }
      : { winner: m(big.b), loser: m(big.a), winnerScore: big.sb, loserScore: big.sa, margin: big.sb - big.sa }) : null,
    closest: close ? { a: m(close.a), b: m(close.b), aScore: close.sa, bScore: close.sb, margin: Math.abs(close.sa - close.sb) } : null,
    bestLine: best ? { ...m(best.manager_id), slot: SLOT_LABEL[best.slot], survivorName: sName(best.survivor_id), total: best.total } : null,
    worstLine: worst ? { ...m(worst.manager_id), slot: SLOT_LABEL[worst.slot], survivorName: sName(worst.survivor_id), total: worst.total } : null,
    popular,
    title: { answerName: answer ? sName(answer) : null, correct },
    chips,
    pool: { drowned, idolSaves, backdoorHits, stillActive },
    departures: ((outRes.data?.departures || []) as string[]).map(sName),
  };
}
