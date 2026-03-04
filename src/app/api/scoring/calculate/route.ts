// src/app/api/scoring/calculate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateManagerFantasy, calculatePoolScore, calculateNETTotal, calculateGrandTotal } from '@/lib/scoring';

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

    // 1. Get survivor scores for this episode (with manual adjustments applied)
    const { data: episodeScores } = await supabase
      .from('survivor_scores')
      .select('survivor_id, fsg_points, voted_out_bonus, manual_adjustment')
      .eq('season_id', seasonId)
      .eq('episode', episode);

    if (!episodeScores?.length) {
      return NextResponse.json({ error: 'No survivor scores found. Pull from FSG first.' }, { status: 400 });
    }

    // Build score lookup
    const survivorEpScores: Record<string, { fsgPoints: number; votedOutBonus: number; isNewlyEliminated: boolean }> = {};
    for (const s of episodeScores) {
      survivorEpScores[s.survivor_id] = {
        fsgPoints: (s.fsg_points || 0) + (s.manual_adjustment || 0),
        votedOutBonus: s.voted_out_bonus || 0,
        isNewlyEliminated: (s.voted_out_bonus || 0) > 0,
      };
    }

    // 2. Get managers
    const { data: managers } = await supabase
      .from('managers')
      .select('id, name')
      .eq('season_id', seasonId);
    if (!managers?.length) return NextResponse.json({ error: 'No managers found' }, { status: 500 });

    // 3. Get active team members for each manager
    const { data: teams } = await supabase
      .from('teams')
      .select('manager_id, survivor_id')
      .eq('season_id', seasonId)
      .eq('is_active', true);

    const managerTeams: Record<string, string[]> = {};
    for (const t of (teams || [])) {
      if (!managerTeams[t.manager_id]) managerTeams[t.manager_id] = [];
      managerTeams[t.manager_id].push(t.survivor_id);
    }

    // 4. Get weekly picks
    const { data: weeklyPicks } = await supabase
      .from('weekly_picks')
      .select('manager_id, captain_id, chip_played, chip_target, net_pick_id')
      .eq('season_id', seasonId)
      .eq('episode', episode);

    const picksByManager: Record<string, any> = {};
    for (const p of (weeklyPicks || [])) {
      picksByManager[p.manager_id] = p;
    }

    // 5. Check captain privilege — lost if captain was eliminated in ANY previous episode
    const { data: prevManagerScores } = await supabase
      .from('manager_scores')
      .select('manager_id, captain_lost')
      .eq('season_id', seasonId)
      .lt('episode', episode);

    const captainPrivilegeLost = new Set<string>();
    for (const ps of (prevManagerScores || [])) {
      if (ps.captain_lost) captainPrivilegeLost.add(ps.manager_id);
    }

    // 6. NET answer
    const { data: netAnswer } = await supabase
      .from('net_answers')
      .select('correct_survivor_id')
      .eq('season_id', seasonId)
      .eq('episode', episode)
      .maybeSingle();

    // 7. First pass — calculate base scores (needed for Assistant Manager chip)
    const managerBaseScores: Record<string, number> = {};
    for (const mgr of managers) {
      const team = managerTeams[mgr.id] || [];
      const picks = picksByManager[mgr.id];
      const hasCap = !captainPrivilegeLost.has(mgr.id);

      // Base = team points + captain bonus (no chip effects)
      const result = calculateManagerFantasy({
        teamSurvivorIds: team,
        captainId: picks?.captain_id || null,
        hasCaptainPrivilege: hasCap,
        chipPlayed: null, // No chip for base calc
        chipTarget: null,
        survivorEpScores,
      });
      managerBaseScores[mgr.id] = result.fantasyPoints;
    }

    // 8. Second pass — full calculation with chip effects
    const resultRows: any[] = [];
    for (const mgr of managers) {
      const team = managerTeams[mgr.id] || [];
      const picks = picksByManager[mgr.id];
      const hasCap = !captainPrivilegeLost.has(mgr.id);

      const result = calculateManagerFantasy({
        teamSurvivorIds: team,
        captainId: picks?.captain_id || null,
        hasCaptainPrivilege: hasCap,
        chipPlayed: picks?.chip_played || null,
        chipTarget: picks?.chip_target || null,
        survivorEpScores,
        assistantManagerTargetScore: picks?.chip_target ? managerBaseScores[picks.chip_target] : undefined,
      });

      const netCorrect = netAnswer?.correct_survivor_id && picks?.net_pick_id
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

    // 9. Upsert manager scores
    const { error: upsertErr } = await supabase
      .from('manager_scores')
      .upsert(resultRows, { onConflict: 'season_id,manager_id,episode' });

    if (upsertErr) {
      return NextResponse.json({ error: `Save failed: ${upsertErr.message}` }, { status: 500 });
    }

    // 10. Recalculate manager_totals
    for (const mgr of managers) {
      const { data: allEpScores } = await supabase
        .from('manager_scores')
        .select('fantasy_points, net_correct')
        .eq('season_id', seasonId)
        .eq('manager_id', mgr.id);

      const fantasyTotal = (allEpScores || []).reduce((s, r) => s + (r.fantasy_points || 0), 0);
      const netCorrectCount = (allEpScores || []).filter(r => r.net_correct).length;
      const netTotal = calculateNETTotal(netCorrectCount);

      // Pool score
      const { data: poolStatus } = await supabase
        .from('pool_status')
        .select('weeks_survived')
        .eq('season_id', seasonId)
        .eq('manager_id', mgr.id)
        .maybeSingle();

      // Top fantasy score across all managers
      const { data: allTotals } = await supabase
        .from('manager_scores')
        .select('manager_id, fantasy_points')
        .eq('season_id', seasonId);

      const managerSums: Record<string, number> = {};
      for (const t of (allTotals || [])) {
        managerSums[t.manager_id] = (managerSums[t.manager_id] || 0) + (t.fantasy_points || 0);
      }
      const topFantasy = Math.max(...Object.values(managerSums), 0);

      const poolScore = calculatePoolScore(poolStatus?.weeks_survived || 0, episode, topFantasy);
      const grandTotal = calculateGrandTotal(fantasyTotal, poolScore, 0, netTotal);

      await supabase.from('manager_totals').upsert({
        season_id: seasonId,
        manager_id: mgr.id,
        fantasy_total: fantasyTotal,
        pool_score: poolScore,
        quinfecta_score: 0,
        net_total: netTotal,
        grand_total: grandTotal,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'season_id,manager_id' });
    }

    // 11. Rank
    const { data: ranked } = await supabase
      .from('manager_totals')
      .select('manager_id, grand_total')
      .eq('season_id', seasonId)
      .order('grand_total', { ascending: false });

    if (ranked) {
      for (let i = 0; i < ranked.length; i++) {
        await supabase.from('manager_totals')
          .update({ rank: i + 1 })
          .eq('season_id', seasonId)
          .eq('manager_id', ranked[i].manager_id);
      }
    }

    return NextResponse.json({
      success: true,
      episode,
      results: resultRows.map(r => ({
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
    return NextResponse.json({ error: `Calculation failed: ${error.message}` }, { status: 500 });
  }
}