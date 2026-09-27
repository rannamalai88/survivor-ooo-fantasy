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
import { deriveOutcomes, scoreCard, resolveFixture, rankAndShare, scoreQuinfecta, type ScoringContext, type EpisodeEvent } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('seasonId') || SEASON_ID;
    const supabase = createServiceClient();
    const loaded = await loadFSG(supabase, seasonId);
    const nameOf = (id: string) => loaded.survivors.find(s => s.id === id)?.name ?? id;

    if (searchParams.get('selftest')) return NextResponse.json(runSelfTest(loaded, nameOf));

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

function runSelfTest(loaded: Awaited<ReturnType<typeof loadFSG>>, nameOf: (id: string) => string) {
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
    adjustments: {}, titleAnswerId: undefined,
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

  return { success: checks.every(c => c.pass), passed: checks.filter(c => c.pass).length, total: checks.length, checks };
}
