// ============================================================
// Survivor OOO Fantasy — Scoring Engine
// ============================================================
// Pure calculation functions. No Supabase calls here —
// the caller fetches data and passes it in.
// ============================================================

// ---- Types ----

export interface SurvivorScore {
  survivor_id: string;
  episode: number;
  fsg_points: number;
  manual_adjustment: number;
  final_points: number; // fsg_points + manual_adjustment
}

export interface TeamMember {
  survivor_id: string;
  is_active: boolean;
}

export interface WeeklyPick {
  manager_id: string;
  episode: number;
  captain_id: string | null;
  pool_pick_id: string | null;
  pool_backdoor_id: string | null;
  net_pick_id: string | null;
  chip_played: number | null;
  chip_target: string | null;
}

export interface EliminatedSurvivor {
  survivor_id: string;
  elimination_order: number; // 1 = first out, 2 = second out, etc.
  eliminated_episode: number;
  has_idol: boolean; // did they go home with an idol?
}

export interface PoolStatusRecord {
  manager_id: string;
  status: string; // 'active' | 'drowned' | 'burnt' | 'finished'
  weeks_survived: number;
}

export interface NetAnswer {
  episode: number;
  correct_survivor_id: string;
}

export interface QuinfectaSubmission {
  manager_id: string;
  place_20th: string;
  place_21st: string;
  place_22nd: string;
  place_23rd: string;
  place_24th: string;
}

// ---- Results ----

export interface ManagerEpisodeScore {
  manager_id: string;
  episode: number;
  // Fantasy breakdown
  base_team_points: number;       // Sum of team survivor final_points (no multipliers)
  captain_bonus: number;          // Extra points from captain 2x (= captain's final_points)
  chip_effect_points: number;     // Extra points from chip effects
  chip_effect_detail: string;     // Description of chip effect
  voted_out_bonus: number;        // Cumulative voted-out bonus for eliminated team members
  idol_penalty: number;           // -5 per idol-in-pocket elimination
  sole_survivor_bonus: number;    // +15 per Sole Survivor on team
  fantasy_total: number;          // Everything above summed
  // NET
  net_correct: boolean;
  net_points: number;             // 3 if correct, 0 if not
  // Pool (running)
  pool_weeks_survived: number;
}

export interface ManagerSeasonTotals {
  manager_id: string;
  fantasy_total: number;
  pool_score: number;
  quinfecta_score: number;
  net_total: number;
  grand_total: number;
  rank: number;
}

// ============================================================
// 1. Calculate Fantasy Points for one manager, one episode
// ============================================================
export function calcManagerEpisodeFantasy(
  managerId: string,
  episode: number,
  team: TeamMember[],                        // This manager's team
  scores: SurvivorScore[],                   // All survivor scores for this episode
  pick: WeeklyPick | null,                   // This manager's picks for this episode
  eliminated: EliminatedSurvivor[],          // All eliminated survivors up to this episode
  allTeams: Map<string, TeamMember[]>,       // All managers' teams (for Asst. Manager chip)
  allPicks: Map<string, WeeklyPick>,         // All managers' picks this episode (for Asst. Manager)
  allScores: SurvivorScore[],                // All scores this episode (for Asst. Manager calc)
  soleSurvivorId: string | null,             // The winner's survivor_id (null until finale)
): ManagerEpisodeScore {
  
  const epScores = new Map<string, number>();
  scores.forEach(s => {
    if (s.episode === episode) {
      epScores.set(s.survivor_id, s.final_points);
    }
  });

  const captainId = pick?.captain_id || null;
  const chipPlayed = pick?.chip_played || null;
  const chipTargetId = pick?.chip_target || null;

  // --- Base team points (before any multipliers) ---
  let baseTeamPoints = 0;
  team.forEach(tm => {
    baseTeamPoints += epScores.get(tm.survivor_id) || 0;
  });

  // --- Captain bonus ---
  // Captain gets 2x, so the "bonus" is the extra 1x (already counted once in base)
  let captainBonus = 0;
  if (captainId) {
    const captainPts = epScores.get(captainId) || 0;
    captainBonus = captainPts; // this is the extra 1x on top of base
  }

  // --- Chip effects ---
  let chipEffectPoints = 0;
  let chipEffectDetail = '';

  if (chipPlayed) {
    switch (chipPlayed) {
      case 1: {
        // Assistant Manager: copy target manager's base team points (excl. bonuses)
        if (chipTargetId) {
          const targetTeam = allTeams.get(chipTargetId) || [];
          let targetBasePoints = 0;
          targetTeam.forEach(tm => {
            targetBasePoints += epScores.get(tm.survivor_id) || 0;
          });
          // Also apply target's captain bonus
          const targetPick = allPicks.get(chipTargetId);
          if (targetPick?.captain_id) {
            targetBasePoints += epScores.get(targetPick.captain_id) || 0;
          }
          chipEffectPoints = targetBasePoints;
          const targetName = chipTargetId; // caller should resolve to name if needed
          chipEffectDetail = `Assistant Manager: copied team points (+${targetBasePoints})`;
        }
        break;
      }
      case 2: {
        // Team Boost: non-captain team members' points tripled (3x)
        // They already get 1x in base, so extra = 2x for non-captains
        let nonCaptainPts = 0;
        team.forEach(tm => {
          if (tm.survivor_id !== captainId) {
            nonCaptainPts += epScores.get(tm.survivor_id) || 0;
          }
        });
        chipEffectPoints = nonCaptainPts * 2; // 2x extra to make 3x total
        chipEffectDetail = `Team Boost: non-captain points 3x (+${chipEffectPoints})`;
        break;
      }
      case 3: {
        // Super Captain: captain 4x instead of 2x
        // Captain already gets base(1x) + captainBonus(1x) = 2x
        // Need 4x total, so extra = 2x more
        if (captainId) {
          const captainPts = epScores.get(captainId) || 0;
          chipEffectPoints = captainPts * 2; // 2x extra to go from 2x to 4x
          chipEffectDetail = `Super Captain: captain 4x (+${chipEffectPoints})`;
        }
        break;
      }
      case 4: {
        // Swap Out: team composition change only, no direct point effect
        chipEffectDetail = 'Swap Out: team swapped (effect applied to roster)';
        break;
      }
      case 5: {
        // Player Add: team composition change only, no direct point effect
        chipEffectDetail = 'Player Add: survivor added (effect applied to roster)';
        break;
      }
    }
  }

  // --- Voted Out Bonus ---
  // Each eliminated survivor on this team earns points = their elimination_order
  // This is cumulative and awarded every episode they are out
  let votedOutBonus = 0;
  team.forEach(tm => {
    const elim = eliminated.find(e => e.survivor_id === tm.survivor_id);
    if (elim && elim.eliminated_episode <= episode) {
      // They earn (elimination_order) points per episode they are out
      // But actually per the spec: "1 point per position out of game"
      // This means they earn their elimination_order as a one-time bonus
      // Let's calculate it as cumulative: each ep after elimination
      votedOutBonus += elim.elimination_order;
    }
  });

  // --- Idol in Pocket Penalty ---
  let idolPenalty = 0;
  team.forEach(tm => {
    const elim = eliminated.find(e => e.survivor_id === tm.survivor_id);
    if (elim && elim.has_idol && elim.eliminated_episode === episode) {
      idolPenalty -= 5;
    }
  });

  // --- Sole Survivor Bonus ---
  // +15 per Sole Survivor on team (NOT affected by captain 2x)
  let soleSurvivorBonus = 0;
  if (soleSurvivorId) {
    const hasSoleSurvivor = team.some(tm => tm.survivor_id === soleSurvivorId);
    if (hasSoleSurvivor) {
      soleSurvivorBonus = 15;
    }
  }

  // --- Fantasy Total ---
  const fantasyTotal = baseTeamPoints + captainBonus + chipEffectPoints + votedOutBonus + idolPenalty + soleSurvivorBonus;

  // --- NET ---
  // (Caller needs to pass netAnswer separately — handled in the batch function)
  
  return {
    manager_id: managerId,
    episode,
    base_team_points: baseTeamPoints,
    captain_bonus: captainBonus,
    chip_effect_points: chipEffectPoints,
    chip_effect_detail: chipEffectDetail,
    voted_out_bonus: votedOutBonus,
    idol_penalty: idolPenalty,
    sole_survivor_bonus: soleSurvivorBonus,
    fantasy_total: fantasyTotal,
    net_correct: false, // set by caller
    net_points: 0,      // set by caller
    pool_weeks_survived: 0, // set by caller
  };
}

// ============================================================
// 2. Calculate NET score for a manager's pick
// ============================================================
export function calcNetScore(
  pick: WeeklyPick | null,
  netAnswer: NetAnswer | null,
): { correct: boolean; points: number } {
  if (!pick?.net_pick_id || !netAnswer?.correct_survivor_id) {
    return { correct: false, points: 0 };
  }
  const correct = pick.net_pick_id === netAnswer.correct_survivor_id;
  return { correct, points: correct ? 3 : 0 };
}

// ============================================================
// 3. Calculate Pool Score
// ============================================================
export function calcPoolScore(
  weeksInPool: number,
  totalWeeks: number,
  topFantasyScore: number,
): number {
  if (totalWeeks === 0) return 0;
  const x = weeksInPool / totalWeeks;
  const y = 0.25 * topFantasyScore;
  return Math.round(x * y * 100) / 100; // round to 2 decimal places
}

// ============================================================
// 4. Calculate Quinfecta Score
// ============================================================
export function calcQuinfectaScore(
  submission: QuinfectaSubmission | null,
  actual: {
    place_20th: string;
    place_21st: string;
    place_22nd: string;
    place_23rd: string;
    place_24th: string;
  } | null,
): number {
  if (!submission || !actual) return 0;

  // Sequential tiers — must get each correct in order
  const tiers = [
    { predicted: submission.place_20th, actual: actual.place_20th, points: 5 },
    { predicted: submission.place_21st, actual: actual.place_21st, points: 10 },
    { predicted: submission.place_22nd, actual: actual.place_22nd, points: 25 },
    { predicted: submission.place_23rd, actual: actual.place_23rd, points: 50 },
    { predicted: submission.place_24th, actual: actual.place_24th, points: 50 },
  ];

  let highestTier = 0;
  for (const tier of tiers) {
    if (tier.predicted === tier.actual) {
      highestTier = tier.points;
    } else {
      break; // Sequential — stop at first miss
    }
  }

  return highestTier;
}

// ============================================================
// 5. Calculate Grand Total for a manager
// ============================================================
export function calcGrandTotal(
  fantasyTotal: number,
  poolScore: number,
  quinfectaScore: number,
  netTotal: number,
): number {
  return fantasyTotal + poolScore + quinfectaScore + netTotal;
}

// ============================================================
// 6. Batch: Calculate all manager scores for one episode
//    This is the main function the admin triggers.
// ============================================================
export function calcAllManagerScoresForEpisode(
  episode: number,
  managers: { id: string; name: string }[],
  allTeams: Map<string, TeamMember[]>,
  allSurvivorScores: SurvivorScore[],
  allWeeklyPicks: Map<string, WeeklyPick>,
  eliminated: EliminatedSurvivor[],
  netAnswer: NetAnswer | null,
  poolStatuses: Map<string, PoolStatusRecord>,
  soleSurvivorId: string | null,
): ManagerEpisodeScore[] {
  
  const results: ManagerEpisodeScore[] = [];

  for (const manager of managers) {
    const team = allTeams.get(manager.id) || [];
    const pick = allWeeklyPicks.get(manager.id) || null;
    const episodeScores = allSurvivorScores.filter(s => s.episode === episode);

    const score = calcManagerEpisodeFantasy(
      manager.id,
      episode,
      team,
      allSurvivorScores,
      pick,
      eliminated,
      allTeams,
      allWeeklyPicks,
      allSurvivorScores,
      soleSurvivorId,
    );

    // NET
    const net = calcNetScore(pick, netAnswer);
    score.net_correct = net.correct;
    score.net_points = net.points;

    // Pool weeks survived
    const ps = poolStatuses.get(manager.id);
    score.pool_weeks_survived = ps?.weeks_survived || 0;

    results.push(score);
  }

  return results;
}

// ============================================================
// 7. Calculate season totals for all managers
// ============================================================
export function calcSeasonTotals(
  managers: { id: string }[],
  allEpisodeScores: ManagerEpisodeScore[],  // All episodes, all managers
  poolStatuses: Map<string, PoolStatusRecord>,
  totalWeeks: number,
  quinfectas: Map<string, QuinfectaSubmission>,
  actualFinishOrder: {
    place_20th: string;
    place_21st: string;
    place_22nd: string;
    place_23rd: string;
    place_24th: string;
  } | null,
): ManagerSeasonTotals[] {
  
  // First pass: calculate fantasy totals to find the top score (needed for Pool)
  const managerFantasyTotals = new Map<string, number>();
  const managerNetTotals = new Map<string, number>();

  for (const manager of managers) {
    const scores = allEpisodeScores.filter(s => s.manager_id === manager.id);
    const fantasyTotal = scores.reduce((sum, s) => sum + s.fantasy_total, 0);
    const netTotal = scores.reduce((sum, s) => sum + s.net_points, 0);
    managerFantasyTotals.set(manager.id, fantasyTotal);
    managerNetTotals.set(manager.id, netTotal);
  }

  // Find top fantasy score for pool calculation
  const topFantasyScore = Math.max(...Array.from(managerFantasyTotals.values()), 0);

  // Second pass: calculate full totals
  const totals: ManagerSeasonTotals[] = managers.map(manager => {
    const fantasyTotal = managerFantasyTotals.get(manager.id) || 0;
    const netTotal = managerNetTotals.get(manager.id) || 0;

    // Pool score
    const ps = poolStatuses.get(manager.id);
    const poolScore = calcPoolScore(
      ps?.weeks_survived || 0,
      totalWeeks,
      topFantasyScore,
    );

    // Quinfecta
    const quinfectaScore = calcQuinfectaScore(
      quinfectas.get(manager.id) || null,
      actualFinishOrder,
    );

    const grandTotal = calcGrandTotal(fantasyTotal, poolScore, quinfectaScore, netTotal);

    return {
      manager_id: manager.id,
      fantasy_total: fantasyTotal,
      pool_score: poolScore,
      quinfecta_score: quinfectaScore,
      net_total: netTotal,
      grand_total: grandTotal,
      rank: 0, // calculated after sorting
    };
  });

  // Sort and assign ranks
  totals.sort((a, b) => b.grand_total - a.grand_total);
  totals.forEach((t, i) => {
    t.rank = i + 1;
  });

  return totals;
}
