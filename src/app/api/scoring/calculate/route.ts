// src/app/api/scoring/calculate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  calculateManagerFantasy,
  calculatePoolScore,
  calculateNETTotal,
  calculateGrandTotal,
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

    // 0. Get season info — need total_episodes for the pool formula
    const { data: seasonData } = await supabase
      .from('seasons')
      .select('total_episodes')
      .eq('id', seasonId)
      .single();

    // Pool runs from episode 2 through the finale, so total pool weeks = total_episodes - 1
    const totalWeeks = (seasonData?.total_episodes || 13) - 1;

    // 1. Get survivor scores for this episode
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

    // 2. Get survivor elimination info for voted-out bonus
    const { data: survivors } = await supabase
      .from('survivors')
      .select('id, name, is_active, eliminated_episode, elimination_order')
      .eq('season_id', seasonId);

    // Build score lookup — FSG points + voted-out bonus per survivor
    const survivorEpScores: Record<
      string,
      { fsgPoints: number; votedOutBonus: number; isNewlyEliminated: boolean }
    > = {};
    for (const s of episodeScores) {
      const survivor = survivors?.find((sv) => sv.id === s.survivor_id);
      const isNewlyEliminated = survivor?.eliminated_episode === episode;
      const votedOutBonus = isNewlyEliminated ? survivor?.elimination_order || 0 : 0;

      survivorEpScores[s.survivor_id] = {
        fsgPoints: (s.fsg_points || 0) + (s.manual_adjustment || 0),
        votedOutBonus,
        isNewlyEliminated,
      };
    }

    // 3. Get managers
    const { data: managers } = await supabase
      .from('managers')
      .select('id, name')
      .eq('season_id', seasonId);
    if (!managers?.length) {
      return NextResponse.json({ error: 'No managers found' }, { status: 500 });
    }

    // 4. Get active team members for each manager
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

    // 5. Get weekly picks
    const { data: weeklyPicks } = await supabase
      .from('weekly_picks')
      .select('manager_id, captain_id, chip_played, chip_target, net_pick_id, pool_pick_id, pool_backdoor_id')
      .eq('season_id', seasonId)
      .eq('episode', episode);

    const picksByManager: Record<string, any> = {};
    for (const p of weeklyPicks || []) {
      picksByManager[p.manager_id] = p;
    }

    // 6. Check captain privilege — permanently lost if captain eliminated in any prior episode
    const { data: prevManagerScores } = await supabase
      .from('manager_scores')
      .select('manager_id, captain_lost')
      .eq('season_id', seasonId)
      .lt('episode', episode);

    const captainPrivilegeLost = new Set<string>();
    for (const ps of prevManagerScores || []) {
      if (ps.captain_lost) captainPrivilegeLost.add(ps.manager_id);
    }

    // 7. NET answer
    const { data: netAnswer } = await supabase
      .from('net_answers')
      .select('correct_survivor_id')
      .eq('season_id', seasonId)
      .eq('episode', episode)
      .maybeSingle();

    // ----------------------------------------------------------------
    // 8. FIRST PASS — base fantasy score (chipPlayed: null) for every manager.
    //    Used as the "target score" for Chip 1 (Assistant Manager).
    //    No chip effects → no circular stacking possible.
    //    Result = FSG points + voted-out bonus + captain 2x only.
    // ----------------------------------------------------------------
    const managerBaseFantasy: Record<string, number> = {};
    for (const mgr of managers) {
      const team = managerTeams[mgr.id] || [];
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

    // ----------------------------------------------------------------
    // 9. SECOND PASS — full calculation including chip effects.
    //    chip_target stored as manager NAME from picks UI; resolve to ID.
    // ----------------------------------------------------------------
    const resultRows: any[] = [];

    for (const mgr of managers) {
      const team = managerTeams[mgr.id] || [];
      const picks = picksByManager[mgr.id];
      const hasCap = !captainPrivilegeLost.has(mgr.id);

      let assistantTargetScore: number | undefined = undefined;
      if (picks?.chip_played === 1 && picks?.chip_target) {
        const targetMgr =
          managers.find((m) => m.id === picks.chip_target) ||
          managers.find((m) => m.name.toLowerCase() === picks.chip_target.toLowerCase());

        if (targetMgr) {
          assistantTargetScore = managerBaseFantasy[targetMgr.id];
        }
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

    // ----------------------------------------------------------------
    // 10b. Record chips played in chips_used (idempotent)
    // ----------------------------------------------------------------
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
    // 10c. Update pool status for ACTIVE managers —
    //      increment weeks_survived if their pick survived,
    //      or drown them if their pick was eliminated.
    // ----------------------------------------------------------------
    const { data: allPoolPicks } = await supabase
      .from('weekly_picks')
      .select('manager_id, pool_pick_id, pool_backdoor_id')
      .eq('season_id', seasonId)
      .eq('episode', episode);

    if (allPoolPicks) {
      for (const pick of allPoolPicks) {
        if (!pick.pool_pick_id) continue;

        const pickedSurvivor = survivors?.find((s) => s.id === pick.pool_pick_id);
        const pickEliminated =
          pickedSurvivor &&
          !pickedSurvivor.is_active &&
          pickedSurvivor.eliminated_episode !== null &&
          pickedSurvivor.eliminated_episode <= episode;

        const { data: currentPool } = await supabase
          .from('pool_status')
          .select('*')
          .eq('season_id', seasonId)
          .eq('manager_id', pick.manager_id)
          .maybeSingle();

        // Only process currently-active managers here.
        // Drowned managers are handled separately in 10d below.
        if (currentPool && currentPool.status !== 'active') continue;

        if (pickEliminated) {
          await supabase.from('pool_status').upsert(
            {
              season_id: seasonId,
              manager_id: pick.manager_id,
              status: 'drowned',
              drowned_episode: episode,
              weeks_survived: currentPool?.weeks_survived || 0,
            },
            { onConflict: 'season_id,manager_id' }
          );
        } else {
          await supabase.from('pool_status').upsert(
            {
              season_id: seasonId,
              manager_id: pick.manager_id,
              status: 'active',
              weeks_survived: (currentPool?.weeks_survived || 0) + 1,
            },
            { onConflict: 'season_id,manager_id' }
          );
        }
      }
    }

    // ----------------------------------------------------------------
    // 10d. Backdoor reactivation — check drowned managers' backdoor picks.
    //
    //      A drowned manager submits pool_backdoor_id instead of a normal
    //      pick. If the survivor they named was eliminated THIS episode,
    //      they guessed correctly and get reactivated (status → 'active').
    //      Their weeks_survived is NOT incremented — they sat out this week.
    //      If they guessed wrong, they stay drowned (no change needed).
    // ----------------------------------------------------------------
    const { data: drownedPools } = await supabase
      .from('pool_status')
      .select('manager_id, weeks_survived')
      .eq('season_id', seasonId)
      .eq('status', 'drowned');

    if (drownedPools && drownedPools.length > 0) {
      const drownedManagerIds = drownedPools.map((p) => p.manager_id);

      // Find any drowned manager who submitted a backdoor pick this episode
      const backdoorPicks = (allPoolPicks || []).filter(
        (p) => drownedManagerIds.includes(p.manager_id) && p.pool_backdoor_id
      );

      for (const pick of backdoorPicks) {
        const backdoorSurvivor = survivors?.find((s) => s.id === pick.pool_backdoor_id);

        // Correct if the named survivor was eliminated specifically this episode
        const guessedCorrectly =
          backdoorSurvivor &&
          !backdoorSurvivor.is_active &&
          backdoorSurvivor.eliminated_episode === episode;

        if (guessedCorrectly) {
          const poolEntry = drownedPools.find((p) => p.manager_id === pick.manager_id);

          await supabase.from('pool_status').upsert(
            {
              season_id: seasonId,
              manager_id: pick.manager_id,
              status: 'active',
              drowned_episode: null,   // clear the drowning record
              weeks_survived: poolEntry?.weeks_survived || 0,
              // weeks_survived stays the same — no credit for the drowned week
            },
            { onConflict: 'season_id,manager_id' }
          );
        }
      }
    }

    // 11. Recalculate manager_totals
    for (const mgr of managers) {
      const { data: allEpScores } = await supabase
        .from('manager_scores')
        .select('fantasy_points, net_correct')
        .eq('season_id', seasonId)
        .eq('manager_id', mgr.id);

      const fantasyTotal = (allEpScores || []).reduce(
        (s, r) => s + (r.fantasy_points || 0),
        0
      );
      const netCorrectCount = (allEpScores || []).filter((r) => r.net_correct).length;
      const netTotal = calculateNETTotal(netCorrectCount);

      const { data: poolStatus } = await supabase
        .from('pool_status')
        .select('weeks_survived')
        .eq('season_id', seasonId)
        .eq('manager_id', mgr.id)
        .maybeSingle();

      // Top fantasy score across all managers (for pool formula denominator)
      const { data: allTotals } = await supabase
        .from('manager_scores')
        .select('manager_id, fantasy_points')
        .eq('season_id', seasonId);

      const managerSums: Record<string, number> = {};
      for (const t of allTotals || []) {
        managerSums[t.manager_id] = (managerSums[t.manager_id] || 0) + (t.fantasy_points || 0);
      }
      const topFantasy = Math.max(...Object.values(managerSums), 0);

      // Pool formula: (weeks_survived / total_pool_weeks) × 0.25 × top_fantasy
      // total_pool_weeks = total_episodes - 1  (no pool pick in episode 1)
      const poolScore = calculatePoolScore(
        poolStatus?.weeks_survived || 0,
        totalWeeks,
        topFantasy
      );

      const grandTotal = calculateGrandTotal(fantasyTotal, poolScore, 0, netTotal);

      await supabase.from('manager_totals').upsert(
        {
          season_id: seasonId,
          manager_id: mgr.id,
          fantasy_total: fantasyTotal,
          pool_score: poolScore,
          quinfecta_score: 0,
          net_total: netTotal,
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
