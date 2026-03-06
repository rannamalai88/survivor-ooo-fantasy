// src/lib/scoring.ts
// ============================================================
// Survivor OOO Fantasy — Core Scoring Engine
// ============================================================

// ---------- TYPES ----------

export interface ManagerEpisodeResult {
  managerId: string;
  managerName: string;
  episode: number;
  baseTeamPoints: number;
  captainId: string | null;
  captainName: string | null;
  captainBasePoints: number;
  captainBonusPoints: number;
  captainLost: boolean;
  chipPlayed: number | null;
  chipBonusPoints: number;
  chipDetail: string | null;
  teamVotedOutBonus: number;
  fantasyPoints: number;
  netCorrect: boolean;
}

// ---------- EPISODE SCORING ----------

/**
 * Calculate manager fantasy points for one episode.
 * 
 * Logic:
 * 1. Sum each active team member's episode FSG points
 * 2. Add voted out bonus for team members eliminated this episode
 * 3. Captain's (episode pts + voted out bonus) is doubled (2x)
 * 4. If captain is eliminated: get 2x this episode, but flag captain as permanently lost
 * 5. Apply chip effects (Team Boost 3x on non-captains, Super Captain 4x, Asst Manager copy)
 * 
 * Captain 2x does NOT apply to: Sole Survivor bonus (+15)
 */
export function calculateManagerFantasy(params: {
  teamSurvivorIds: string[];
  captainId: string | null;
  hasCaptainPrivilege: boolean;
  chipPlayed: number | null;
  chipTarget: string | null;
  survivorEpScores: Record<string, { fsgPoints: number; votedOutBonus: number; isNewlyEliminated: boolean }>;
  // For Assistant Manager chip: the target manager's base score (without their own chip effects)
  assistantManagerTargetScore?: number;
}): {
  baseTeamPoints: number;
  captainBasePoints: number;
  captainBonusPoints: number;
  captainLost: boolean;
  chipBonusPoints: number;
  chipDetail: string | null;
  teamVotedOutBonus: number;
  fantasyPoints: number;
} {
  const { teamSurvivorIds, captainId, hasCaptainPrivilege, chipPlayed, chipTarget, survivorEpScores, assistantManagerTargetScore } = params;

  let baseTeamPoints = 0;
  let teamVotedOutBonus = 0;
  let captainBasePoints = 0;
  let captainBonusPoints = 0;
  let captainLost = false;
  let chipBonusPoints = 0;
  let chipDetail: string | null = null;

  // Step 1: Sum base points for all team members
  for (const sid of teamSurvivorIds) {
    const scores = survivorEpScores[sid];
    if (!scores) continue;
    baseTeamPoints += scores.fsgPoints;
    teamVotedOutBonus += scores.votedOutBonus;
  }

  // Step 2: Captain 2x
  if (captainId && hasCaptainPrivilege && teamSurvivorIds.includes(captainId)) {
    const captainScores = survivorEpScores[captainId];
    if (captainScores) {
      captainBasePoints = captainScores.fsgPoints + captainScores.votedOutBonus;
      captainBonusPoints = captainBasePoints; // extra 1x = total 2x

      if (captainScores.isNewlyEliminated) {
        captainLost = true;
      }
    }
  }

  // Step 3: Chip effects
  if (chipPlayed) {
    switch (chipPlayed) {
      case 1: // Assistant Manager — copy target manager's team points
        if (assistantManagerTargetScore !== undefined) {
          chipBonusPoints = assistantManagerTargetScore;
          chipDetail = `Assistant Manager: +${assistantManagerTargetScore} pts from target`;
        }
        break;

      case 2: // Team Boost — non-captain members' points tripled (3x)
        for (const sid of teamSurvivorIds) {
          if (sid === captainId) continue;
          const scores = survivorEpScores[sid];
          if (!scores) continue;
          const memberTotal = scores.fsgPoints + scores.votedOutBonus;
          chipBonusPoints += memberTotal * 2; // +2x extra = 3x total
        }
        chipDetail = `Team Boost: non-captain members 3x`;
        break;

      case 3: // Super Captain — captain 4x instead of 2x
        if (captainId && hasCaptainPrivilege) {
          // Captain already has +1x from step 2. Super Captain adds +2x more = 4x total
          chipBonusPoints = captainBasePoints * 2;
          chipDetail = `Super Captain: captain at 4x`;
        } else {
          chipDetail = `Super Captain: no effect (captain privilege lost)`;
        }
        break;

      case 4: // Swap Out — roster change only
        chipDetail = `Swap Out: roster updated`;
        break;

      case 5: // Player Add — roster change only
        chipDetail = `Player Add: survivor added`;
        break;
    }
  }

  const fantasyPoints = baseTeamPoints + teamVotedOutBonus + captainBonusPoints + chipBonusPoints;

  return {
    baseTeamPoints,
    captainBasePoints,
    captainBonusPoints,
    captainLost,
    chipBonusPoints,
    chipDetail,
    teamVotedOutBonus,
    fantasyPoints,
  };
}

// ---------- POOL SCORE ----------

export function calculatePoolScore(weeksSurvived: number, totalWeeks: number, topFantasyScore: number): number {
  if (totalWeeks === 0) return 0;
  return Math.round(((weeksSurvived / totalWeeks) * (0.25 * topFantasyScore)) * 100) / 100;
}

// ---------- QUINFECTA ----------

const QUINFECTA_TIERS = [
  { place: 20, points: 5 },
  { place: 21, points: 10 },
  { place: 22, points: 25 },
  { place: 23, points: 50 },
  { place: 24, points: 50 },
];

export function calculateQuinfectaScore(
  predictions: { place: number; survivorId: string }[],
  actuals: { place: number; survivorId: string }[]
): number {
  let score = 0;
  for (const tier of QUINFECTA_TIERS) {
    const pred = predictions.find(p => p.place === tier.place);
    const actual = actuals.find(a => a.place === tier.place);
    if (pred && actual && pred.survivorId === actual.survivorId) {
      score = tier.points; // Highest tier reached (not cumulative)
    } else {
      break;
    }
  }
  return score;
}

// ---------- NET ----------

export function calculateNETTotal(correctGuesses: number): number {
  return correctGuesses * 3;
}

// ---------- GRAND TOTAL ----------

export function calculateGrandTotal(fantasy: number, pool: number, quinfecta: number, net: number): number {
  return Math.round((fantasy + pool + quinfecta + net) * 100) / 100;
}