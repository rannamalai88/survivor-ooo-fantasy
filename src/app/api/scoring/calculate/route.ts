// src/app/api/scoring/calculate/route.ts
// ============================================================
// S51 scoring engine (spec §4). Idempotent: deletes and rewrites every
// derived row for the episode. Re-running is the normal fix — correct the
// input (FSG pull, manual adjustment, title answer) and run it again.
//
//   1. Load episode_events, picks, adjustments, title answer
//   2. Score every card → score_lines (plain-English reason per line)
//   3. card_total (may be negative) → manager_scores
//   4. Resolve fixtures → h2h_results; Double Fixture / Point Shield
//   5. shadow_beat = how many of the other managers this manager outscored
//   6. Rebuild pool_status by walking from E2 (lib/pool.ts)
//   7. Recompute standings + championship points → manager_totals
//
// POST { episode: number, seasonId: string, dryRun?: boolean }
//   dryRun: score cards and fixtures and return them WITHOUT writing anything.
//   eventsFromEpisode (dry run only): score this episode's cards against another
//   episode's FSG events — for testing before an episode airs.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { WEIGHTS, placeFromEliminationOrder, CAST_SIZE, type RosterSlot, type PickChip } from '@/lib/constants';
import {
  deriveOutcomes, scoreCard, resolveFixture, rankAndShare, scoreQuinfecta,
  type EpisodeEvent, type ScoringContext, type CardInput, type CardResult,
} from '@/lib/scoring';
import { walkPool, type PoolPick } from '@/lib/pool';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { episode, seasonId, dryRun = false, eventsFromEpisode } = await request.json();
    if (!episode || !seasonId) return NextResponse.json({ error: 'Missing episode or seasonId' }, { status: 400 });
    const supabase = createServiceClient();

    // ── 0. Season + episode ──
    const [{ data: season }, { data: epRow }] = await Promise.all([
      supabase.from('seasons').select('total_episodes').eq('id', seasonId).single(),
      supabase.from('episodes').select('number, h2h_round, is_finale, is_post_merge').eq('season_id', seasonId).eq('number', episode).maybeSingle(),
    ]);
    const totalEpisodes = season?.total_episodes || 13;
    const isFinaleRun = epRow?.is_finale ?? episode === totalEpisodes;
    // Head-to-head fantasy ends after E12. The finale scores no cards — it only
    // resolves the Pool and the Quinfecta.
    const cardsScored = !isFinaleRun;
    if (!dryRun && !epRow?.h2h_round && !isFinaleRun) {
      return NextResponse.json({ error: `Episode ${episode} has no H2H round and isn't the finale, so it isn't scored (E1 is parsed but never scored).` }, { status: 400 });
    }
    const eventsEpisode = dryRun && eventsFromEpisode ? Number(eventsFromEpisode) : episode;

    // ── 1. Inputs ──
    const [eventsRes, survRes, mgrRes, picksRes, adjRes, netRes] = await Promise.all([
      supabase.from('episode_events').select('survivor_id, action, points, category').eq('season_id', seasonId).eq('episode', eventsEpisode),
      supabase.from('survivors').select('id, name, is_active, eliminated_episode, elimination_order').eq('season_id', seasonId),
      supabase.from('managers').select('id, name').eq('season_id', seasonId),
      supabase.from('weekly_picks')
        .select('manager_id, episode, reward_pick_id, immunity_pick_id, going_home_pick_id, mop_pick_id, title_pick_id, chip, chip_slot, hedge_alt_id, pool_pick_id, pool_backdoor_id')
        .eq('season_id', seasonId),
      supabase.from('survivor_scores').select('survivor_id, manual_adjustment').eq('season_id', seasonId).eq('episode', episode),
      supabase.from('net_answers').select('correct_survivor_id').eq('season_id', seasonId).eq('episode', episode).maybeSingle(),
    ]);
    for (const r of [eventsRes, survRes, mgrRes, picksRes, adjRes, netRes]) if (r.error) throw r.error;

    const rawEvents = eventsRes.data || [];
    if (rawEvents.length === 0) {
      return NextResponse.json({ error: `No FSG events for episode ${eventsEpisode}. Pull from FSG first.` }, { status: 400 });
    }
    const survivors = survRes.data || [];
    const managers = mgrRes.data || [];
    const allPicks = picksRes.data || [];
    if (!managers.length) return NextResponse.json({ error: 'No managers found for this season' }, { status: 500 });

    const events: EpisodeEvent[] = rawEvents.map((e: any) => ({ survivorId: e.survivor_id, action: e.action, points: e.points, category: e.category }));
    const outcomes = deriveOutcomes(events);
    const eventsBySurvivor: Record<string, EpisodeEvent[]> = {};
    for (const e of events) (eventsBySurvivor[e.survivorId] ||= []).push(e);

    const ctx: ScoringContext = {
      episode,
      outcomes,
      eventsBySurvivor,
      names: Object.fromEntries(survivors.map((s: any) => [s.id, s.name])),
      departureKind: Object.fromEntries(events.filter(e => e.category === 'departure').map(e => [e.survivorId, e.action])),
      adjustments: Object.fromEntries((adjRes.data || []).map((r: any) => [r.survivor_id, r.manual_adjustment || 0])),
      titleAnswerId: netRes.data ? netRes.data.correct_survivor_id : undefined,
      isPostMerge: !!epRow?.is_post_merge,
    };

    // ── 2. Score every card ──
    const results = new Map<string, CardResult>();
    for (const m of managers) {
      const p = allPicks.find((x: any) => x.manager_id === m.id && x.episode === episode);
      const card: CardInput | null = p ? {
        picks: { reward: p.reward_pick_id, immunity: p.immunity_pick_id, going_home: p.going_home_pick_id, mop: p.mop_pick_id },
        titlePickId: p.title_pick_id,
        chip: p.chip as PickChip | null,
        chipSlot: p.chip_slot as RosterSlot | null,
        hedgeAltId: p.hedge_alt_id,
      } : null;
      const usedEarlier = allPicks
        .filter((x: any) => x.manager_id === m.id && x.episode < episode && x.chip)
        .map((x: any) => x.chip as PickChip);
      results.set(m.id, scoreCard(card, ctx, usedEarlier));
    }

    // ── 3. score_lines (delete + insert) ──
    if (!dryRun) {
      const { error } = await supabase.from('score_lines').delete().eq('season_id', seasonId).eq('episode', episode);
      if (error) throw error;
    }
    if (!dryRun && cardsScored) {
      const rows = managers.flatMap(m => results.get(m.id)!.lines.map(l => ({
        season_id: seasonId, episode, manager_id: m.id, slot: l.slot, survivor_id: l.survivorId,
        base_points: l.basePoints, multiplier: l.multiplier, bonus: l.bonus, penalty: l.penalty, total: l.total, reason: l.reason,
      })));
      const { error: insErr } = await supabase.from('score_lines').insert(rows);
      if (insErr) throw insErr;
    }

    // ── 4. Fixtures → h2h_results ──
    const cardTotal = (id: string) => results.get(id)!.cardTotal;
    const h2hPoints = new Map<string, number>();
    const h2hNote = new Map<string, string>();
    const opponentOf = new Map<string, string>();
    const fixtureRows: any[] = [];

    // ── 5. Shadow record: of the other managers, how many did I outscore? ──
    const shadow = new Map(managers.map(m => [m.id, managers.filter(o => o.id !== m.id && cardTotal(o.id) < cardTotal(m.id)).length]));

    if (epRow?.h2h_round) {
      const { data: fixtures, error } = await supabase.from('fixtures').select('id, manager_a, manager_b')
        .eq('season_id', seasonId).eq('round', epRow.h2h_round);
      if (error) throw error;
      for (const f of fixtures || []) {
        const chipA = results.get(f.manager_a)?.chip ?? null;
        const chipB = results.get(f.manager_b)?.chip ?? null;
        const sa = cardTotal(f.manager_a), sb = cardTotal(f.manager_b);
        const r = resolveFixture(sa, sb, chipA === 'double_fixture' || chipA === 'point_shield' ? chipA : null, chipB === 'double_fixture' || chipB === 'point_shield' ? chipB : null);
        h2hPoints.set(f.manager_a, r.a.points); h2hPoints.set(f.manager_b, r.b.points);
        h2hNote.set(f.manager_a, r.a.note); h2hNote.set(f.manager_b, r.b.note);
        opponentOf.set(f.manager_a, f.manager_b); opponentOf.set(f.manager_b, f.manager_a);
        fixtureRows.push({
          season_id: seasonId, episode, fixture_id: f.id,
          score_a: sa, score_b: sb, points_a: r.a.points, points_b: r.b.points,
          chip_a: chipA, chip_b: chipB,
          shadow_a: shadow.get(f.manager_a) ?? 0, shadow_b: shadow.get(f.manager_b) ?? 0,
          computed_at: new Date().toISOString(),
        });
      }
    }
    if (dryRun && !cardsScored) {
      return NextResponse.json({ success: true, dryRun: true, episode, finale: true, titleAnswerRecorded: true, results: [],
        message: 'Finale: no cards are scored. Calculate & save resolves the Pool and the Quinfecta.' });
    }
    if (dryRun) {
      const nameOfMgr = (id: string) => managers.find(m => m.id === id)?.name ?? '?';
      return NextResponse.json({
        success: true, dryRun: true, episode, eventsFromEpisode: eventsEpisode, ruleset: epRow?.is_post_merge ? 'post-merge' : 'pre-merge',
        titleAnswerRecorded: ctx.titleAnswerId !== undefined,
        results: managers.map(m => {
          const r = results.get(m.id)!;
          return {
            name: m.name, cardTotal: r.cardTotal, chip: r.chip, chipNote: r.chipNote,
            opponent: opponentOf.has(m.id) ? nameOfMgr(opponentOf.get(m.id)!) : null,
            h2hPoints: h2hPoints.get(m.id) ?? null, h2hNote: h2hNote.get(m.id) ?? null, shadowBeat: shadow.get(m.id) ?? 0,
            lines: r.lines.map(l => ({ slot: l.slot, survivor: l.survivorId ? ctx.names[l.survivorId] : null, total: l.total, reason: l.reason })),
          };
        }).sort((a, b) => b.cardTotal - a.cardTotal),
      });
    }
    {
      const { error } = await supabase.from('h2h_results').delete().eq('season_id', seasonId).eq('episode', episode);
      if (error) throw error;
      if (fixtureRows.length) {
        const { error: insErr } = await supabase.from('h2h_results').insert(fixtureRows);
        if (insErr) throw insErr;
      }
    }

    // ── manager_scores (none at the finale) ──
    if (!cardsScored) {
      const { error } = await supabase.from('manager_scores').delete().eq('season_id', seasonId).eq('episode', episode);
      if (error) throw error;
    } else {
      const now = new Date().toISOString();
      const rows = managers.map(m => {
        const r = results.get(m.id)!;
        return {
          season_id: seasonId, manager_id: m.id, episode,
          card_total: r.cardTotal,
          fantasy_points: r.cardTotal,          // continuity for pages not yet rebuilt
          penalty_total: r.penaltyTotal,
          title_correct: r.titleCorrect,
          net_correct: r.titleCorrect,
          chip: r.chip,
          chip_slot: r.chipSlot,
          h2h_points: h2hPoints.has(m.id) ? h2hPoints.get(m.id)! : null,
          shadow_beat: shadow.get(m.id) ?? 0,
          captain_lost: false,
          updated_at: now,
        };
      });
      const { error } = await supabase.from('manager_scores').upsert(rows, { onConflict: 'season_id,manager_id,episode' });
      if (error) throw error;
    }

    // ── 6. POOL STATUS — canonical walk from E2 (lib/pool.ts), incl. Dynasty Idol.
    //    At season's end, any pool-active manager transitions to 'finished'.
    {
      const picksByMgrEp: Record<string, Record<number, PoolPick>> = {};
      for (const p of allPicks) {
        (picksByMgrEp[p.manager_id] ||= {})[p.episode] = { pool_pick_id: p.pool_pick_id, pool_backdoor_id: p.pool_backdoor_id };
      }
      const { data: existingPool } = await supabase.from('pool_status').select('manager_id, status, has_immunity_idol').eq('season_id', seasonId);
      const survivorMap = new Map(survivors.map((s: any) => [s.id, s]));

      for (const mgr of managers) {
        const existing: any = (existingPool || []).find((p: any) => p.manager_id === mgr.id);
        if (existing?.status === 'burnt') continue;
        const walk = walkPool(picksByMgrEp[mgr.id] || {}, survivorMap, !!existing?.has_immunity_idol, episode);
        const finalStatus: 'active' | 'drowned' | 'finished' = isFinaleRun && walk.status === 'active' ? 'finished' : walk.status;
        const { error } = await supabase.from('pool_status').upsert(
          { season_id: seasonId, manager_id: mgr.id, status: finalStatus, weeks_survived: walk.weeksSurvived, drowned_episode: walk.drownedEpisode, idol_used: walk.idolUsed },
          { onConflict: 'season_id,manager_id' },
        );
        if (error) throw error;
      }
    }

    // ── 7. Standings + championship ──
    const [{ data: allScores }, { data: poolRows }, { data: qRows }] = await Promise.all([
      supabase.from('manager_scores').select('manager_id, card_total, h2h_points').eq('season_id', seasonId),
      supabase.from('pool_status').select('manager_id, weeks_survived').eq('season_id', seasonId),
      supabase.from('quinfecta_predictions').select('manager_id, place_1_id, place_2_id, place_3_id, place_4_id, place_5_id').eq('season_id', seasonId),
    ]);

    // Quinfecta only once the final five places are all known (FSG place 1–5).
    const actualPlace: Record<string, number> = {};
    for (const s of survivors) {
      if (s.elimination_order && s.elimination_order > CAST_SIZE - 5) actualPlace[s.id] = placeFromEliminationOrder(s.elimination_order);
    }
    const quinfectaReady = Object.keys(actualPlace).length === 5;

    const standings = managers.map(m => {
      const mine = (allScores || []).filter((r: any) => r.manager_id === m.id);
      const q = (qRows || []).find((r: any) => r.manager_id === m.id);
      return {
        id: m.id,
        h2h: mine.reduce((s: number, r: any) => s + (r.h2h_points || 0), 0),
        raw: mine.reduce((s: number, r: any) => s + (r.card_total || 0), 0),
        weeks: (poolRows || []).find((r: any) => r.manager_id === m.id)?.weeks_survived || 0,
        quinfecta: quinfectaReady && q ? scoreQuinfecta([q.place_1_id, q.place_2_id, q.place_3_id, q.place_4_id, q.place_5_id], actualPlace).total : 0,
      };
    });

    // Fantasy = H2H points, tiebreak cumulative raw card points
    const fantasy = new Map(rankAndShare(standings, s => [s.h2h, s.raw]).map(r => [r.item.id, r]));
    const pool = new Map(rankAndShare(standings, s => [s.weeks]).map(r => [r.item.id, r]));
    const quin = new Map(rankAndShare(standings, s => [s.quinfecta]).map(r => [r.item.id, r]));

    const totals = standings.map(s => {
      const champFantasy = fantasy.get(s.id)!.curvePoints * WEIGHTS.fantasy;
      const champPool = pool.get(s.id)!.curvePoints * WEIGHTS.pool;
      const champQuinfecta = quinfectaReady ? quin.get(s.id)!.curvePoints * WEIGHTS.quinfecta : 0;
      return { ...s, champFantasy, champPool, champQuinfecta, championship: champFantasy + champPool + champQuinfecta };
    });
    const overall = new Map(rankAndShare(totals, t => [t.championship, t.raw]).map(r => [r.item.id, r.rank]));
    const round2 = (n: number) => Math.round(n * 100) / 100;

    {
      const now = new Date().toISOString();
      const rows = totals.map(t => ({
        season_id: seasonId, manager_id: t.id,
        h2h_points: t.h2h,
        raw_card_points: t.raw,
        fantasy_total: t.raw,
        fantasy_rank: fantasy.get(t.id)!.rank,
        pool_rank: pool.get(t.id)!.rank,
        quinfecta_rank: quinfectaReady ? quin.get(t.id)!.rank : null,
        quinfecta_score: t.quinfecta,
        champ_fantasy: round2(t.champFantasy),
        champ_pool: round2(t.champPool),
        champ_quinfecta: round2(t.champQuinfecta),
        championship_points: round2(t.championship),
        pool_score: round2(t.champPool),           // continuity
        grand_total: round2(t.championship),       // continuity
        net_total: 0,
        sole_survivor_bonus: 0,
        rank: overall.get(t.id)!,
        updated_at: now,
      }));
      const { error } = await supabase.from('manager_totals').upsert(rows, { onConflict: 'season_id,manager_id' });
      if (error) throw error;
    }

    await supabase.from('episodes').update({ status: 'scored' }).eq('season_id', seasonId).eq('number', episode);
    await supabase.from('activity_log').insert({
      season_id: seasonId, type: 'admin', message: `Scores calculated for episode ${episode}`, metadata: { episode },
    });

    const nameOfMgr = (id: string) => managers.find(m => m.id === id)?.name ?? '?';
    return NextResponse.json({
      success: true,
      episode,
      titleAnswerRecorded: ctx.titleAnswerId !== undefined,
      quinfectaScored: quinfectaReady,
      ruleset: epRow?.is_post_merge ? 'post-merge' : 'pre-merge',
      finale: !cardsScored,
      message: cardsScored ? undefined : `Finale: Pool resolved${quinfectaReady ? ' and Quinfecta scored' : ' (Quinfecta waits for all five final places)'}. No cards are scored.`,
      results: !cardsScored ? [] : managers.map(m => {
        const r = results.get(m.id)!;
        return {
          managerId: m.id,
          name: m.name,
          submitted: allPicks.some((x: any) => x.manager_id === m.id && x.episode === episode),
          cardTotal: r.cardTotal,
          penaltyTotal: r.penaltyTotal,
          titleCorrect: r.titleCorrect,
          chip: r.chip,
          chipNote: r.chipNote,
          opponent: opponentOf.has(m.id) ? nameOfMgr(opponentOf.get(m.id)!) : null,
          h2hPoints: h2hPoints.get(m.id) ?? null,
          h2hNote: h2hNote.get(m.id) ?? null,
          shadowBeat: shadow.get(m.id) ?? 0,
        };
      }).sort((a, b) => b.cardTotal - a.cardTotal),
    });
  } catch (error: any) {
    console.error('Calculate error:', error);
    return NextResponse.json({ error: `Calculation failed: ${error.message}` }, { status: 500 });
  }
}
