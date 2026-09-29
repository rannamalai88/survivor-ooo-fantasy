// src/app/api/scoring/preview-fsg/route.ts
// ============================================================
// Read-only parser debug endpoint. Never writes to the database.
//
// GET ?episode=N           → parsed events, derived outcomes, cross-check issues
// GET ?selftest=1          → runs the spec §8 E1 regression assertions plus
//                            unit checks on the scoring rules; 200 if all pass
// ============================================================

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { SEASON_ID, eliminationOrderFromPlace, placeFromEliminationOrder } from '@/lib/constants';
import { loadFSG, summaryIssues, toEpisodeEvents } from '@/lib/fsg-load';
import { fetchFSGRecapPage, parseRecap } from '@/lib/fsg-parser';
import { walkPool } from '@/lib/pool';
import { deriveOutcomes, scoreCard, resolveFixture, rankAndShare, scoreQuinfecta, type ScoringContext, type EpisodeEvent } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('seasonId') || SEASON_ID;
    const supabase = createServiceClient();
    const loaded = await loadFSG(supabase, seasonId);
    const nameOf = (id: string) => loaded.survivors.find(s => s.id === id)?.name ?? id;

    if (searchParams.get('selftest')) return NextResponse.json(await runSelfTest(loaded, nameOf));

    const episodeParam = searchParams.get('episode');
    const episodes = episodeParam ? loaded.episodes.filter(e => e.episode === Number(episodeParam)) : loaded.episodes;

    return NextResponse.json({
      success: true,
      fetchedAt: new Date().toISOString(),
      seasonNumber: loaded.seasonNumber,
      availableEpisodes: loaded.episodes.map(e => e.episode),
      unmappedFsgIds: loaded.unmappedFsgIds,
      cumulativeIssues: loaded.cumulativeIssues,
      episodes: episodes.map(ep => {
        const events = toEpisodeEvents(ep, loaded.byFsgId);
        const o = deriveOutcomes(events);
        return {
          episode: ep.episode,
          errors: ep.errors,
          warnings: ep.warnings,
          unknownActions: ep.unknownActions,
          summaryIssues: summaryIssues(ep, loaded),
          summary: ep.summary,
          outcomes: {
            rewardHappened: o.rewardHappened,
            immunityHappened: o.immunityHappened,
            rewardWinners: o.rewardWinners.map(nameOf),
            immunityWinners: o.immunityWinners.map(nameOf),
            departures: ep.departures.map(d => ({ name: loaded.byFsgId.get(d.fsgId)?.name ?? d.fsgId, kind: d.kind, place: d.place })),
            mopWinners: o.mopWinners.map(nameOf),
            otherPoints: Object.fromEntries(Object.entries(o.otherPoints).map(([id, p]) => [nameOf(id), p])),
          },
          events: ep.events.map(e => ({ survivor: loaded.byFsgId.get(e.fsgId)?.name ?? `#${e.fsgId}`, action: e.action, points: e.points, category: e.category })),
        };
      }),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// --- Spec §8 regression + rule unit checks ------------------------------------------

async function runSelfTest(loaded: Awaited<ReturnType<typeof loadFSG>>, nameOf: (id: string) => string) {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const check = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail: pass ? undefined : detail });
  const idByName = (n: string) => loaded.survivors.find(s => s.name === n)?.id ?? `missing:${n}`;
  const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

  // Pure rule checks (no FSG dependency)
  check('elimination_order = 22 − FSG place (21st → 1)', eliminationOrderFromPlace(21) === 1 && eliminationOrderFromPlace(1) === 21 && placeFromEliminationOrder(1) === 21);
  const f1 = resolveFixture(10, 5, 'double_fixture', null);
  check('Double Fixture doubles own win only (6/0)', f1.a.points === 6 && f1.b.points === 0, JSON.stringify(f1));
  const f2 = resolveFixture(5, 10, 'point_shield', 'double_fixture');
  check('Point Shield turns loss into draw; opponent Double Fixture win = 6', f2.a.points === 1 && f2.b.points === 6, JSON.stringify(f2));
  const f3 = resolveFixture(-4, -4, null, null);
  check('Negative totals can draw', f3.a.points === 1 && f3.b.points === 1);
  const ranked = rankAndShare([{ id: 'a', v: 9 }, { id: 'b', v: 9 }, { id: 'c', v: 1 }], x => [x.v]);
  check('Tied ranks split pooled curve points', ranked[0].curvePoints === 11 && ranked[1].curvePoints === 11 && ranked[2].rank === 3 && ranked[2].curvePoints === 9, JSON.stringify(ranked));
  const q = scoreQuinfecta(['a', 'b', 'c', 'd', 'e'], { a: 1, b: 2, c: 3, d: 4, e: 5 });
  const q2 = scoreQuinfecta(['b', 'a', 'c', null, 'z'], { a: 1, b: 2, c: 3 });
  check('Quinfecta perfect = 35', q.total === 35, JSON.stringify(q));
  check('Quinfecta adjacent/exact mix = 2+2+5 = 9', q2.total === 9, JSON.stringify(q2));

  // Pool walk (lib/pool.ts)
  const sv = new Map([
    ['x', { id: 'x', is_active: false, eliminated_episode: 3 }],
    ['y', { id: 'y', is_active: false, eliminated_episode: 4 }],
    ['z', { id: 'z', is_active: true, eliminated_episode: null }],
    ['w', { id: 'w', is_active: false, eliminated_episode: 5 }],
  ]);
  const pk = (pool: string | null, backdoor: string | null = null) => ({ pool_pick_id: pool, pool_backdoor_id: backdoor });
  const pw1 = walkPool({ 2: pk('z'), 3: pk('x'), 4: pk('z') }, sv, false, 4);
  check('Pool: eliminated pick drowns (no idol)', pw1.status === 'drowned' && pw1.drownedEpisode === 3 && pw1.weeksSurvived === 1, JSON.stringify(pw1));
  const pw2 = walkPool({ 2: pk('z'), 3: pk('x'), 4: pk('y') }, sv, true, 4);
  check('Pool: Dynasty Idol saves first eliminated pick, week counts, second drowns', pw2.idolUsed && pw2.idolEpisode === 3 && pw2.status === 'drowned' && pw2.drownedEpisode === 4 && pw2.weeksSurvived === 2, JSON.stringify(pw2));
  const pw3 = walkPool({ 2: pk('z') }, sv, true, 3);
  check('Pool: missed pick drowns, idol does not cover it', pw3.status === 'drowned' && pw3.drownedEpisode === 3 && !pw3.idolUsed, JSON.stringify(pw3));
  const pw4 = walkPool({ 2: pk('z'), 3: pk('x'), 4: pk(null, 'y'), 5: pk('z') }, sv, false, 5);
  check('Pool: correct backdoor reactivates without incrementing', pw4.status === 'active' && pw4.weeksSurvived === 2 && pw4.weeks[2].type === 'backdoor_hit', JSON.stringify(pw4));

  // Finale + edge cases, parsed from the complete S50 recap (known outcomes)
  try {
    const s50 = parseRecap(await fetchFSGRecapPage(50));
    const e13 = s50.find(e => e.episode === 13), e1 = s50.find(e => e.episode === 1), e6 = s50.find(e => e.episode === 6);
    check('S50 recap parses all 13 episodes with no errors', s50.length === 13 && s50.every(e => e.errors.length === 0), s50.flatMap(e => e.errors).join(' | '));
    check('Finale: Sole Survivor parsed at place 1 (→ elimination_order = CAST_SIZE)', !!e13?.soleSurvivor && e13.soleSurvivor.place === 1 && eliminationOrderFromPlace(1) === 21, JSON.stringify(e13?.soleSurvivor));
    const oog = (e13?.departures || []).filter(d => d.kind === 'Out of game').map(d => d.place).sort();
    check('Finale: runners-up parsed as Out of game at places 2 and 3', JSON.stringify(oog) === '[2,3]', JSON.stringify(e13?.departures));
    check('Finale: Sole Survivor is not a departure', !!e13 && !e13.departures.some(d => d.fsgId === e13.soleSurvivor?.fsgId));
    const mergeEps = s50.filter(e => e.events.some(ev => ev.action === 'Merge')).map(e => e.episode);
    check('Merge action detected in exactly one S50 episode', mergeEps.length === 1, JSON.stringify(mergeEps));
    check('Quit/Evac parsed with its place (S50 E1, 23rd)', !!e1?.departures.find(d => d.kind === 'Quit/Evac' && d.place === 23), JSON.stringify(e1?.departures));
    check('Triple boot parsed (S50 E6, 3 departures)', e6?.departures.length === 3, JSON.stringify(e6?.departures));
  } catch (err: any) {
    check('S50 recap reachable for finale checks', false, err.message);
  }

  // Spec §8 — E1 regression against the live FSG page
  const e1 = loaded.episodes.find(e => e.episode === 1);
  if (!e1) {
    check('E1 present in FSG recap', false, 'Episode 1 not found');
    return { success: false, checks };
  }
  check('E1 parsed with no errors', e1.errors.length === 0, e1.errors.join(' | '));
  check('No unmapped FSG ids', loaded.unmappedFsgIds.length === 0, loaded.unmappedFsgIds.join(', '));
  check('E1 summary headers agree with itemized list', summaryIssues(e1, loaded).length === 0, summaryIssues(e1, loaded).join(' | '));
  check('Every survivor\'s parsed sum equals Surv Pts', loaded.cumulativeIssues.length === 0, loaded.cumulativeIssues.join(' | '));

  const events: EpisodeEvent[] = toEpisodeEvents(e1, loaded.byFsgId);
  const o = deriveOutcomes(events);
  const savu = loaded.survivors.filter(s => s.original_tribe === 'Savu').map(s => s.id);
  check('reward_happened == false', o.rewardHappened === false);
  check('immunity_winners = all 10 Savu, Rob included', sameSet(o.immunityWinners, savu) && o.immunityWinners.includes(idByName('Rob')), o.immunityWinners.map(nameOf).join(', '));
  check('mop_winners == [Rob, Kristin] at 3', sameSet(o.mopWinners, [idByName('Rob'), idByName('Kristin')]) && o.otherPoints[idByName('Rob')] === 3, `${o.mopWinners.map(nameOf).join(', ')} ${JSON.stringify(o.otherPoints)}`);
  const idol = e1.events.find(e => e.action === 'Gain an Immunity Idol');
  check('Rob\'s idol is Other, not Immunity', !!idol && idol.category === 'other' && loaded.byFsgId.get(idol.fsgId)?.name === 'Rob');
  const aaliyah = e1.departures.find(d => loaded.byFsgId.get(d.fsgId)?.name === 'Aaliyah');
  check('Aaliyah: FSG place 21 → elimination_order 1', !!aaliyah && aaliyah.place === 21 && eliminationOrderFromPlace(aaliyah.place!) === 1, JSON.stringify(aaliyah));

  const totals: Record<string, number> = {};
  for (const e of events) totals[nameOf(e.survivorId)] = (totals[nameOf(e.survivorId)] || 0) + e.points;
  const expected: Record<string, number> = { Rob: 6, Kristin: 6, Eric: 5, Cristian: 5, Lewis: 2, Aaliyah: 1 };
  for (const [n, t] of Object.entries(expected)) check(`${n} total = ${t}`, totals[n] === t, `got ${totals[n]}`);

  const eventsBySurvivor: Record<string, EpisodeEvent[]> = {};
  for (const e of events) (eventsBySurvivor[e.survivorId] ||= []).push(e);
  const ctx: ScoringContext = {
    episode: 1, outcomes: o, eventsBySurvivor,
    names: Object.fromEntries(loaded.survivors.map(s => [s.id, s.name])),
    departureKind: Object.fromEntries(e1.departures.map(d => [loaded.byFsgId.get(d.fsgId)?.id, d.kind])),
    adjustments: {}, titleAnswerId: undefined, isPostMerge: false,
  };
  const best = scoreCard({
    picks: { reward: idByName('Eric'), immunity: idByName('Rob'), going_home: idByName('Aaliyah'), mop: idByName('Kristin') },
    titlePickId: null, chip: null, chipSlot: null, hedgeAltId: null,
  }, ctx);
  check('Best E1 card (Eric/Rob/Aaliyah/Kristin) = 36', best.cardTotal === 36, best.lines.map(l => `${l.slot}:${l.total}`).join(' '));

  const penalized = scoreCard({
    picks: { reward: idByName('Rob'), immunity: idByName('Aaliyah'), going_home: idByName('Eric'), mop: idByName('Lewis') },
    titlePickId: null, chip: null, chipSlot: null, hedgeAltId: null,
  }, ctx);
  const immLine = penalized.lines.find(l => l.slot === 'immunity')!;
  check('Departed Immunity pick takes −5 (Aaliyah 1 − 5 = −4)', immLine.total === -4 && immLine.penalty === -5, immLine.reason);

  // Penalty rulesets (spec v3): Reward/MOP never penalised; Going Home immune only post-merge
  const mopBoot = scoreCard({ picks: { reward: idByName('Eric'), immunity: idByName('Rob'), going_home: idByName('Lewis'), mop: idByName('Aaliyah') }, titlePickId: null, chip: null, chipSlot: null, hedgeAltId: null }, ctx);
  const mopLine = mopBoot.lines.find(l => l.slot === 'mop')!;
  check('MOP pick who leaves takes no penalty', mopLine.penalty === 0, mopLine.reason);
  const ghImmune = { picks: { reward: idByName('Eric'), immunity: idByName('Kristin'), going_home: idByName('Rob'), mop: idByName('Lewis') }, titlePickId: null, chip: null, chipSlot: null, hedgeAltId: null };
  const preLine = scoreCard(ghImmune, ctx).lines.find(l => l.slot === 'going_home')!;
  const postLine = scoreCard(ghImmune, { ...ctx, isPostMerge: true }).lines.find(l => l.slot === 'going_home')!;
  check('Going Home pick who wins immunity: 0 pre-merge', preLine.penalty === 0, preLine.reason);
  check('Going Home pick who wins immunity: −5 post-merge', postLine.penalty === -5 && postLine.total === 6 - 5, postLine.reason);
  const postImm = scoreCard({ picks: { reward: idByName('Rob'), immunity: idByName('Aaliyah'), going_home: idByName('Eric'), mop: idByName('Lewis') }, titlePickId: null, chip: null, chipSlot: null, hedgeAltId: null }, { ...ctx, isPostMerge: true }).lines.find(l => l.slot === 'immunity')!;
  check('Immunity pick who leaves takes −5 post-merge too', postImm.penalty === -5, postImm.reason);

  return { success: checks.every(c => c.pass), passed: checks.filter(c => c.pass).length, total: checks.length, checks };
}
