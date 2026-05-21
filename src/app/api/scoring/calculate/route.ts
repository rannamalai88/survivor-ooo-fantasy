// src/app/api/scoring/calculate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  calculateManagerFantasy,
  calculatePoolScore,
  calculateNETTotal,
  calculateGrandTotal,
  calculateQuinfectaScore,
} from '@/lib/scoring';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { episode, seasonId } = await request.json();
    if (!episode || !seasonId) {
      return NextResponse.json({ error: 'Missing episode or seasonId' }, { status: 400 });
    }

    // 0. Season info
    const { data: seasonData } = await supabase
      .from('seasons')
      .select('total_episodes')
      .eq('id', seasonId)
      .single();

    const totalEpisodes = seasonData?.total_episodes || 13;
    const totalWeeks = totalEpisodes - 1;
    const isFinaleRun = episode === totalEpisodes;

    // 1. Survivor scores for this episode
    const { data: episodeScores } = await supabase
      .from('survivor_scores')
      .select('survivor_id, fsg_points, manual_adjustment')
      .eq('season_id', seasonId)
      .eq('episode', episode);

    if (!episodeScores?.length) {
      return NextResponse.json(
        { error: 'No survivor scores found. Pull from FSG first.' },
        { status: 400 }
      );
    }

    // 2. Survivor metadata (voted-out bonus + quinfecta actuals + sole survivor)
    const { data: survivors } = await supabase
      .from('survivors')
      .select('id, name, is_active, eliminated_episode, elimination_order')
      .eq('season_id', seasonId);

    // Build score lookup — fsgPoints, manualAdjustment, votedOutBonus kept separate.
    //
    // The Sole Survivor doesn't earn the voted-out bonus the usual way (she was
    // never voted out — elimination_order is NULL). At the finale run she gets
    // the equivalent "outlasted everyone" bonus of 24 points, treated as a
    // voted-out bonus so it flows through captain 2x and chip multipliers the
    // same way every other voted-out bonus does.
    const survivorEpScores: Record<
      string,
      { fsgPoints: number; manualAdjustment: number; votedOutBonus: number; isNewlyEliminated: boolean }
    > = {};
    for (const s of episodeScores) {
      const survivor = survivors?.find((sv) => sv.id === s.survivor_id);
      const isNewlyEliminated = survivor?.eliminated_episode === episode;

      let votedOutBonus = isNewlyEliminated ? survivor?.elimination_order || 0 : 0;
      if (isFinaleRun && survivor?.is_active === true) {
        // Sole Survivor outlasted everyone — bonus equivalent to a 24th-place
        // voted-out bonus. Downstream this gets the captain 2x treatment, the
        // chip multipliers (Team Boost 3x, Super Captain 4x), etc.
        votedOutBonus = 24;
      }

      survivorEpScores[s.survivor_id] = {
        fsgPoints: s.fsg_points || 0,
        manualAdjustment: s.manual_adjustment || 0,
        votedOutBonus,
        isNewlyEliminated,
      };
    }

    // 3. Managers
    const { data: managers } = await supabase
      .from('managers')
      .select('id, name')
      .eq('season_id', seasonId);
    if (!managers?.length) {
      return NextResponse.json({ error: 'No managers found' }, { status: 500 });
    }

    // 4. Permanent (drafted) team rosters — used for sole-survivor bonus too
    const { data: teams } = await supabase
      .from('teams')
      .select('manager_id, survivor_id')
      .eq('season_id', seasonId)
      .eq('is_active', true);

    const managerTeams: Record<string, string[]> = {};
    for (const t of teams || []) {
      if (!managerTeams[t.manager_id]) managerTeams[t.manager_id] = [];
      managerTeams[t.manager_id].push(t.survivor_id);
    }

    // 5. Weekly picks for this episode
    const { data: weeklyPicks } = await supabase
      .from('weekly_picks')
      .select('manager_id, captain_id, chip_played, chip_target, net_pick_id, pool_pick_id, pool_backdoor_id, swap_out_ids, swap_in_ids, player_add_id')
      .eq('season_id', seasonId)
      .eq('episode', episode);

    const picksByManager: Record<string, any> = {};
    for (const p of weeklyPicks || []) {
      picksByManager[p.manager_id] = p;
    }

    // 6. Captain privilege state
    const { data: prevManagerScores } = await supabase
      .from('manager_scores')
      .select('manager_id, captain_lost')
      .eq('season_id', seasonId)
      .lt('episode', episode);

    const captainPrivilegeLost = new Set<string>();
    for (const ps of prevManagerScores || []) {
      if (ps.captain_lost) captainPrivilegeLost.add(ps.manager_id);
    }

    // 7b. Effective teams (chip 4 swap / chip 5 add)
    const effectiveTeams: Record<string, string[]> = {};
    for (const mgr of managers) {
      const baseteam = managerTeams[mgr.id] || [];
      const picks = picksByManager[mgr.id];

      if (
        picks?.chip_played === 4 &&
        Array.isArray(picks?.swap_out_ids) && picks.swap_out_ids.length > 0 &&
        Array.isArray(picks?.swap_in_ids)  && picks.swap_in_ids.length > 0 &&
        picks.swap_out_ids.length === picks.swap_in_ids.length
      ) {
        const swapOuts = picks.swap_out_ids as string[];
        const swapIns  = picks.swap_in_ids  as string[];
        effectiveTeams[mgr.id] = [
          ...baseteam.filter(id => !swapOuts.includes(id)),
          ...swapIns,
        ];
      } else if (picks?.chip_played === 5 && picks?.player_add_id) {
        effectiveTeams[mgr.id] = [...baseteam, picks.player_add_id];
      } else {
        effectiveTeams[mgr.id] = baseteam;
      }
    }

    // 7. NET answer
    const { data: netAnswer } = await supabase
      .from('net_answers')
      .select('correct_survivor_id')
      .eq('season_id', seasonId)
      .eq('episode', episode)
      .maybeSingle();

    // 8. FIRST PASS — base fantasy (no chips), for Chip 1 targeting
    const managerBaseFantasy: Record<string, number> = {};
    for (const mgr of managers) {
      const team = effectiveTeams[mgr.id] || [];
      const picks = picksByManager[mgr.id];
      const hasCap = !captainPrivilegeLost.has(mgr.id);

      const result = calculateManagerFantasy({
        teamSurvivorIds: team,
        captainId: picks?.captain_id || null,
        hasCaptainPrivilege: hasCap,
        chipPlayed: null,
        chipTarget: null,
        survivorEpScores,
      });
      managerBaseFantasy[mgr.id] = result.fantasyPoints;
    }

    // 9. SECOND PASS — full calc with chips
    const resultRows: any[] = [];

    for (const mgr of managers) {
      const team = effectiveTeams[mgr.id] || [];
      const picks = picksByManager[mgr.id];
      const hasCap = !captainPrivilegeLost.has(mgr.id);

      let assistantTargetScore: number | undefined = undefined;
      if (picks?.chip_played === 1 && picks?.chip_target) {
        const targetMgr =
          managers.find((m) => m.id === picks.chip_target) ||
          managers.find((m) => m.name.toLowerCase() === picks.chip_target.toLowerCase());
        if (targetMgr) assistantTargetScore = managerBaseFantasy[targetMgr.id];
      }

      const result = calculateManagerFantasy({
        teamSurvivorIds: team,
        captainId: picks?.captain_id || null,
        hasCaptainPrivilege: hasCap,
        chipPlayed: picks?.chip_played || null,
        chipTarget: picks?.chip_target || null,
        survivorEpScores,
        assistantManagerTargetScore: assistantTargetScore,
      });

      const netCorrect =
        netAnswer?.correct_survivor_id && picks?.net_pick_id
          ? picks.net_pick_id === netAnswer.correct_survivor_id
          : false;

      resultRows.push({
        season_id: seasonId,
        manager_id: mgr.id,
        episode,
        fantasy_points: result.fantasyPoints,
        base_team_points: result.baseTeamPoints,
        captain_bonus: result.captainBonusPoints,
        chip_bonus: result.chipBonusPoints,
        voted_out_bonus: result.teamVotedOutBonus,
        captain_lost: result.captainLost,
        chip_played: picks?.chip_played || null,
        chip_detail: result.chipDetail,
        net_correct: netCorrect,
        updated_at: new Date().toISOString(),
      });
    }

    // 10. Upsert manager_scores
    const { error: upsertErr } = await supabase
      .from('manager_scores')
      .upsert(resultRows, { onConflict: 'season_id,manager_id,episode' });

    if (upsertErr) {
      return NextResponse.json({ error: `Save failed: ${upsertErr.message}` }, { status: 500 });
    }

    // 10b. chips_used (idempotent)
    for (const row of resultRows) {
      if (!row.chip_played) continue;
      const picks = picksByManager[row.manager_id];
      if (!picks?.chip_played) continue;

      const { data: existing } = await supabase
        .from('chips_used')
        .select('id')
        .eq('season_id', seasonId)
        .eq('manager_id', row.manager_id)
        .eq('chip_id', picks.chip_played)
        .maybeSingle();

      if (!existing) {
        await supabase.from('chips_used').insert({
          season_id: seasonId,
          manager_id: row.manager_id,
          chip_id: picks.chip_played,
          episode,
          target: picks.chip_target || null,
        });
      }
    }

    // ----------------------------------------------------------------
    // 10c. POOL STATUS — canonical recomputation from picks history.
    // At season's end, any pool-active manager transitions to 'finished'.
    // ----------------------------------------------------------------
    const { data: allMgrPicksHistory } = await supabase
      .from('weekly_picks')
      .select('manager_id, episode, pool_pick_id, pool_backdoor_id')
      .eq('season_id', seasonId)
      .gte('episode', 2)
      .lte('episode', episode);

    const picksByMgrEp: Record<string, Record<number, { pool_pick_id: string | null; pool_backdoor_id: string | null }>> = {};
    for (const p of allMgrPicksHistory || []) {
      if (!picksByMgrEp[p.manager_id]) picksByMgrEp[p.manager_id] = {};
      picksByMgrEp[p.manager_id][p.episode] = {
        pool_pick_id: p.pool_pick_id,
        pool_backdoor_id: p.pool_backdoor_id,
      };
    }

    const { data: existingPoolStatuses } = await supabase
      .from('pool_status')
      .select('manager_id, status')
      .eq('season_id', seasonId);

    const existingStatusByMgr: Record<string, string> = {};
    for (const p of existingPoolStatuses || []) {
      existingStatusByMgr[p.manager_id] = p.status;
    }

    for (const mgr of managers) {
      const existing = existingStatusByMgr[mgr.id];
      if (existing === 'burnt') continue;

      const mgrPicks = picksByMgrEp[mgr.id] || {};
      let status: 'active' | 'drowned' = 'active';
      let weeksSurvived = 0;
      let drownedEpisode: number | null = null;

      for (let ep = 2; ep <= episode; ep++) {
        const pick = mgrPicks[ep];

        if (status === 'active') {
          if (pick?.pool_pick_id) {
            const survivor = survivors?.find((s) => s.id === pick.pool_pick_id);
            const eliminatedThisEpOrEarlier =
              survivor &&
              !survivor.is_active &&
              survivor.eliminated_episode !== null &&
              survivor.eliminated_episode <= ep;

            if (eliminatedThisEpOrEarlier) {
              status = 'drowned';
              drownedEpisode = ep;
            } else {
              weeksSurvived += 1;
            }
          }
        } else {
          if (pick?.pool_backdoor_id) {
            const survivor = survivors?.find((s) => s.id === pick.pool_backdoor_id);
            const guessedCorrectly =
              survivor &&
              !survivor.is_active &&
              survivor.eliminated_episode === ep;

            if (guessedCorrectly) {
              status = 'active';
              drownedEpisode = null;
            }
          }
        }
      }

      let finalStatus: 'active' | 'drowned' | 'finished' = status;
      if (isFinaleRun && status === 'active') {
        finalStatus = 'finished';
      }

      await supabase.from('pool_status').upsert(
        {
          season_id: seasonId,
          manager_id: mgr.id,
          status: finalStatus,
          weeks_survived: weeksSurvived,
          drowned_episode: drownedEpisode,
        },
        { onConflict: 'season_id,manager_id' }
      );
    }

    // ----------------------------------------------------------------
    // 10d. QUINFECTA ACTUALS + SOLE SURVIVOR identification.
    //   place 20–23 → survivor with that elimination_order
    //   place 24    → is_active=true winner (falls back to elim_order=24
    //                 for backward compat with alternate conventions)
    // ----------------------------------------------------------------
    const quinfectaActuals: { place: number; survivorId: string }[] = [];
    for (const place of [20, 21, 22, 23]) {
      const s = survivors?.find(sv => sv.elimination_order === place);
      if (s) quinfectaActuals.push({ place, survivorId: s.id });
    }
    const winner = survivors?.find(sv => sv.is_active === true)
                ?? survivors?.find(sv => sv.elimination_order === 24);
    if (winner) quinfectaActuals.push({ place: 24, survivorId: winner.id });

    // Build set of managers eligible for +15 Sole Survivor bonus —
    // PERMANENT team membership only (chip 5 player-add does NOT qualify).
    const soleSurvivorManagers = new Set<string>();
    if (winner) {
      for (const t of teams || []) {
        if (t.survivor_id === winner.id) {
          soleSurvivorManagers.add(t.manager_id);
        }
      }
    }
    const SOLE_SURVIVOR_BONUS = 15;

    // ----------------------------------------------------------------
    // 11. Recalculate manager_totals
    // ----------------------------------------------------------------
    for (const mgr of managers) {
      const { data: allEpScores } = await supabase
        .from('manager_scores')
        .select('fantasy_points, net_correct')
        .eq('season_id', seasonId)
        .eq('manager_id', mgr.id);

      const fantasyTotal = (allEpScores || []).reduce(
        (s, r) => s + (r.fantasy_points || 0), 0
      );
      const netCorrectCount = (allEpScores || []).filter((r) => r.net_correct).length;
      const netTotal = calculateNETTotal(netCorrectCount);

      const { data: poolStatus } = await supabase
        .from('pool_status')
        .select('weeks_survived')
        .eq('season_id', seasonId)
        .eq('manager_id', mgr.id)
        .maybeSingle();

      const { data: allTotals } = await supabase
        .from('manager_scores')
        .select('manager_id, fantasy_points')
        .eq('season_id', seasonId);

      const managerSums: Record<string, number> = {};
      for (const t of allTotals || []) {
        managerSums[t.manager_id] = (managerSums[t.manager_id] || 0) + (t.fantasy_points || 0);
      }
      const topFantasy = Math.max(...Object.values(managerSums), 0);

      const poolScore = calculatePoolScore(
        poolStatus?.weeks_survived || 0,
        totalWeeks,
        topFantasy
      );

      // ── Quinfecta score ──
      let quinfectaScore = 0;
      const { data: qPred } = await supabase
        .from('quinfecta_predictions')
        .select('place_20_id, place_21_id, place_22_id, place_23_id, place_24_id')
        .eq('season_id', seasonId)
        .eq('manager_id', mgr.id)
        .maybeSingle();

      if (qPred && quinfectaActuals.length > 0) {
        const predictions = [
          { place: 20, survivorId: qPred.place_20_id },
          { place: 21, survivorId: qPred.place_21_id },
          { place: 22, survivorId: qPred.place_22_id },
          { place: 23, survivorId: qPred.place_23_id },
          { place: 24, survivorId: qPred.place_24_id },
        ].filter((p): p is { place: number; survivorId: string } => !!p.survivorId);

        quinfectaScore = calculateQuinfectaScore(predictions, quinfectaActuals);
      }

      // ── Sole Survivor bonus ──
      // +15 to managers with the winner on their PERMANENT (drafted) team.
      // Chip 5 "Player Add" does not qualify.
      const soleSurvivorBonus = soleSurvivorManagers.has(mgr.id)
        ? SOLE_SURVIVOR_BONUS
        : 0;

      const grandTotal =
        calculateGrandTotal(fantasyTotal, poolScore, quinfectaScore, netTotal)
        + soleSurvivorBonus;

      await supabase.from('manager_totals').upsert(
        {
          season_id: seasonId,
          manager_id: mgr.id,
          fantasy_total: fantasyTotal,
          pool_score: poolScore,
          quinfecta_score: quinfectaScore,
          net_total: netTotal,
          sole_survivor_bonus: soleSurvivorBonus,
          grand_total: grandTotal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'season_id,manager_id' }
      );
    }

    // 12. Rank managers by grand_total
    const { data: ranked } = await supabase
      .from('manager_totals')
      .select('manager_id, grand_total')
      .eq('season_id', seasonId)
      .order('grand_total', { ascending: false });

    if (ranked) {
      for (let i = 0; i < ranked.length; i++) {
        await supabase
          .from('manager_totals')
          .update({ rank: i + 1 })
          .eq('season_id', seasonId)
          .eq('manager_id', ranked[i].manager_id);
      }
    }

    return NextResponse.json({
      success: true,
      episode,
      results: resultRows.map((r) => ({
        managerId: r.manager_id,
        fantasyPoints: r.fantasy_points,
        captainBonus: r.captain_bonus,
        chipBonus: r.chip_bonus,
        votedOutBonus: r.voted_out_bonus,
        captainLost: r.captain_lost,
        netCorrect: r.net_correct,
      })),
    });
  } catch (error: any) {
    console.error('Calculate error:', error);
    return NextResponse.json(
      { error: `Calculation failed: ${error.message}` },
      { status: 500 }
    );
  }
}
