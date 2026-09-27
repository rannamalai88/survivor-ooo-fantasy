// src/app/api/scoring/scrape-fsg/route.ts
// ============================================================
// Pulls one episode from FantasySurvivorGame.com and writes:
//   episode_events    one row per survivor per FSG action (+ departures)
//   episode_outcomes  reward/immunity/departures/MOP derived from the events
//   survivor_scores   per-survivor totals + scored_actions JSON (continuity);
//                     existing manual_adjustment values are preserved
//   survivors         is_active / eliminated_episode / elimination_order
//                     (the Pool walk depends on these), tribe changes
//   episodes.status   scheduled → aired
//
// Idempotent: re-running replaces that episode's rows.
// Refuses to write if the parser reports errors or an FSG id can't be mapped.
// Warnings (unknown actions, cross-check mismatches) are written through but
// returned to the admin and logged to activity_log.
//
// POST { episode: number, seasonId: string }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { eliminationOrderFromPlace } from '@/lib/constants';
import { loadFSG, summaryIssues, toEpisodeEvents } from '@/lib/fsg-load';
import { deriveOutcomes } from '@/lib/scoring';

export const dynamic = 'force-dynamic';

// Must match the survivors_tribe_check constraint in the live database.
const ALLOWED_TRIBES = ['Vatu', 'Kalo', 'Cila', 'Savu', 'Toka', 'Merge', 'Host'];

export async function POST(request: NextRequest) {
  try {
    const { episode, seasonId } = await request.json();
    if (!episode || !seasonId) return NextResponse.json({ error: 'Missing episode or seasonId' }, { status: 400 });

    const supabase = createServiceClient();
    const loaded = await loadFSG(supabase, seasonId);
    const ep = loaded.episodes.find(e => e.episode === episode);
    if (!ep) {
      return NextResponse.json({
        success: false,
        error: `Episode ${episode} isn't on FSG's recap page yet. FSG usually updates the morning after it airs.`,
        availableEpisodes: loaded.episodes.map(e => e.episode),
      }, { status: 404 });
    }

    // ── Blocking problems: never write a partial or mis-mapped episode ──
    const epFsgIds = new Set([...ep.events.map(e => e.fsgId), ...(ep.soleSurvivor ? [ep.soleSurvivor.fsgId] : [])]);
    const unmapped = [...epFsgIds].filter(id => !loaded.byFsgId.has(id));
    const blocking = [
      ...ep.errors,
      ...unmapped.map(id => `FSG survivor id ${id} has no matching survivors row (survivors.fsg_id). Nothing was written.`),
    ];
    if (blocking.length) {
      return NextResponse.json({ success: false, error: 'FSG data could not be parsed safely. Nothing was written.', blocking }, { status: 422 });
    }

    const warnings: string[] = [
      ...ep.warnings,
      ...summaryIssues(ep, loaded),
      ...loaded.cumulativeIssues,
      ...loaded.unmappedFsgIds.filter(id => !epFsgIds.has(id)).map(id => `FSG season page lists survivor id ${id}, which has no survivors row.`),
    ];

    const events = toEpisodeEvents(ep, loaded.byFsgId);
    const outcomes = deriveOutcomes(events);
    const idOf = (fsgId: number) => loaded.byFsgId.get(fsgId)!.id;
    const nameOf = (id: string) => loaded.survivors.find(s => s.id === id)?.name ?? id;

    // ── 1. episode_events (delete + insert = idempotent) ──
    const { error: delErr } = await supabase.from('episode_events').delete().eq('season_id', seasonId).eq('episode', episode);
    if (delErr) throw delErr;
    if (events.length) {
      const { error } = await supabase.from('episode_events').insert(events.map(e => ({
        season_id: seasonId, episode, survivor_id: e.survivorId, action: e.action, points: e.points, category: e.category,
      })));
      if (error) throw error;
    }

    // ── 2. episode_outcomes ──
    {
      const { error } = await supabase.from('episode_outcomes').upsert({
        season_id: seasonId, episode,
        reward_happened: outcomes.rewardHappened,
        immunity_happened: outcomes.immunityHappened,
        reward_winners: outcomes.rewardWinners,
        immunity_winners: outcomes.immunityWinners,
        departures: outcomes.departures,
        mop_winners: outcomes.mopWinners,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'season_id,episode' });
      if (error) throw error;
    }

    // ── 3. survivor_scores (continuity with S50 shape; manual adjustments kept) ──
    const { data: existingScores } = await supabase.from('survivor_scores')
      .select('survivor_id, manual_adjustment').eq('season_id', seasonId).eq('episode', episode);
    const adjBy = new Map((existingScores || []).map((r: any) => [r.survivor_id, r.manual_adjustment || 0]));
    const cumulativeBy = new Map(loaded.seasonRows.map(r => [r.fsgId, r.survPts]));
    const pulledAt = new Date().toISOString();

    const scoreRows = loaded.survivors.filter(s => s.is_playable && s.fsg_id).map(s => {
      const mine = events.filter(e => e.survivorId === s.id && e.category !== 'departure');
      const fsgPoints = mine.reduce((sum, e) => sum + e.points, 0);
      const adj = adjBy.get(s.id) || 0;
      return {
        season_id: seasonId, survivor_id: s.id, episode,
        fsg_points: fsgPoints,
        fsg_cumulative: cumulativeBy.get(s.fsg_id!) ?? null,
        manual_adjustment: adj,
        voted_out_bonus: 0,
        final_points: fsgPoints + adj,
        scored_actions: mine.length
          ? { source: 'fsg_auto', actions: mine.map(e => ({ action: e.action, points: e.points })), pulled_at: pulledAt }
          : { source: 'fsg_auto', actions: [], no_actions: true },
      };
    });
    {
      const { error } = await supabase.from('survivor_scores').upsert(scoreRows, { onConflict: 'season_id,survivor_id,episode' });
      if (error) throw error;
    }

    // ── 4. Eliminations (the Pool walk reads these) ──
    const eliminations: { name: string; kind: string; place: number | null; eliminationOrder: number | null }[] = [];
    const departedIds = new Set(ep.departures.map(d => idOf(d.fsgId)));

    for (const d of ep.departures) {
      const s = loaded.survivors.find(x => x.id === idOf(d.fsgId))!;
      if (s.eliminated_episode !== null && s.eliminated_episode !== episode) {
        warnings.push(`${s.name} is already marked out in episode ${s.eliminated_episode}; FSG now lists them leaving in episode ${episode}. Left unchanged — check manually.`);
        continue;
      }
      const eliminationOrder = d.place !== null ? eliminationOrderFromPlace(d.place) : s.elimination_order;
      const { error } = await supabase.from('survivors')
        .update({ is_active: false, eliminated_episode: episode, elimination_order: eliminationOrder })
        .eq('id', s.id);
      if (error) throw error;
      eliminations.push({ name: s.name, kind: d.kind, place: d.place, eliminationOrder });
    }

    // Anyone we previously marked out in THIS episode but FSG no longer lists → restore
    for (const s of loaded.survivors) {
      if (s.eliminated_episode === episode && !departedIds.has(s.id)) {
        const { error } = await supabase.from('survivors')
          .update({ is_active: true, eliminated_episode: null, elimination_order: null }).eq('id', s.id);
        if (error) throw error;
        warnings.push(`${s.name} was marked out in episode ${episode} but FSG no longer lists them — restored to active.`);
      }
    }

    if (ep.soleSurvivor) {
      const winner = loaded.survivors.find(x => x.id === idOf(ep.soleSurvivor!.fsgId))!;
      const { error } = await supabase.from('survivors')
        .update({ is_active: true, elimination_order: eliminationOrderFromPlace(ep.soleSurvivor.place ?? 1) })
        .eq('id', winner.id);
      if (error) throw error;
    }

    // ── 5. Tribe changes (swaps / merge). original_tribe is never touched. ──
    const tribeChanges: string[] = [];
    for (const row of loaded.seasonRows) {
      const ref = loaded.byFsgId.get(row.fsgId);
      const s = ref && loaded.survivors.find(x => x.id === ref.id);
      if (!s || departedIds.has(s.id) || !s.is_active) continue;
      if (['Out', 'Unknown', ''].includes(row.tribe) || row.tribe === s.tribe) continue;
      if (!ALLOWED_TRIBES.includes(row.tribe)) {
        warnings.push(`FSG shows ${s.name} on tribe "${row.tribe}", which the survivors_tribe_check constraint doesn't allow yet. Add it to the constraint, then pull again.`);
        continue;
      }
      const { error } = await supabase.from('survivors').update({ tribe: row.tribe }).eq('id', s.id);
      if (error) throw error;
      tribeChanges.push(`${s.name}: ${s.tribe} → ${row.tribe}`);
    }

    // ── 6. Episode status ──
    await supabase.from('episodes').update({ status: 'aired' })
      .eq('season_id', seasonId).eq('number', episode).eq('status', 'scheduled');

    // ── 7. Log ──
    await supabase.from('activity_log').insert({
      season_id: seasonId, type: 'admin',
      message: `FSG pulled for episode ${episode}: ${events.filter(e => e.category !== 'departure').length} actions, ${ep.departures.length} departure(s)${warnings.length ? `, ${warnings.length} warning(s)` : ''}`,
      metadata: { episode, warnings, unknownActions: ep.unknownActions },
    });

    return NextResponse.json({
      success: true,
      episode,
      actions: events.filter(e => e.category !== 'departure').length,
      outcomes: {
        rewardHappened: outcomes.rewardHappened,
        immunityHappened: outcomes.immunityHappened,
        rewardWinners: outcomes.rewardWinners.map(nameOf),
        immunityWinners: outcomes.immunityWinners.map(nameOf),
        mopWinners: outcomes.mopWinners.map(nameOf),
        mopPoints: Math.max(0, ...Object.values(outcomes.otherPoints)),
      },
      eliminations,
      tribeChanges,
      scores: scoreRows.filter(r => r.fsg_points !== 0)
        .map(r => ({ name: nameOf(r.survivor_id), points: r.fsg_points, actions: (r.scored_actions as any).actions }))
        .sort((a, b) => b.points - a.points),
      unknownActions: ep.unknownActions,
      warnings,
      availableEpisodes: loaded.episodes.map(e => e.episode),
    });
  } catch (error: any) {
    console.error('FSG scrape error:', error);
    return NextResponse.json({ error: `Scrape failed: ${error.message}` }, { status: 500 });
  }
}
