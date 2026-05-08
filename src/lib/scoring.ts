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
 * Fantasy = baseTeamPoints + teamVotedOutBonus + captainBonusPoints + chipBonusPoints
 *   (where baseTeamPoints already folds in any manualAdjustment for display)
 *
 * Manual adjustments (e.g. idol-in-pocket -5 penalty) are flat per-survivor
 * corrections that apply ONCE per roster slot but are NEVER multiplied by
 * captain 2x, Super Captain 4x, or Team Boost 3x. They flow through
 * `manualAdjustment` and only land in baseTeamPoints (and thus fantasyPoints
 * once per slot). Doubling a survivor via Player Add (chip 5) does double
 * the per-slot penalty — that's intentional, the survivor is on the team
 * twice that episode.
 *
 * Chip 1 — Assistant Manager:
 *   Adds the TARGET manager's full fantasy score for the episode, EXCLUDING
 *   any chip bonus the target played (no circular stacking). In practice this
 *   means we pass in the target's first-pass score (chip_played: null run).
 *   Concretely: target's (FSG points + voted-out bonus + captain 2x + manual adj).
 *
 * Chip 2 — Team Boost: non-captain members' (FSG + V.O.) tripled (3x).
 *   Manual adjustments are NOT multiplied.
 * Chip 3 — Super Captain: captain's (FSG + V.O.) at 4x instead of 2x.
 *   Manual adjustments are NOT multiplied.
 * Chips 4 & 5 — Swap Out / Player Add: roster changes only, no point effect.
 *
 * Captain 2x does NOT apply to manual adjustments OR the Sole Survivor +15 bonus.
 */
export function calculateManagerFantasy(params: {
  teamSurvivorIds: string[];
  captainId: string | null;
  hasCaptainPrivilege: boolean;
  chipPlayed: number | null;
  chipTarget: string | null;
  survivorEpScores: Record<string, { fsgPoints: number; manualAdjustment: number; votedOutBonus: number; isNewlyEliminated: boolean }>;
  // For Chip 1 (Assistant Manager): target manager's fantasy total for this episode
  // computed in a first pass with chipPlayed: null — so it is FSG + voted-out + captain 2x + manual adj,
  // with NO chip bonus from the target (prevents circular stacking).
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
  const {
    teamSurvivorIds,
    captainId,
    hasCaptainPrivilege,
    chipPlayed,
    survivorEpScores,
    assistantManagerTargetScore,
  } = params;

  let baseTeamFsg = 0;          // raw FSG only (clean — used by all multipliers)
  let teamVotedOutBonus = 0;
  let teamManualAdjustment = 0; // flat penalties — never multiplied
  let captainBasePoints = 0;
  let captainBonusPoints = 0;
  let captainLost = false;
  let chipBonusPoints = 0;
  let chipDetail: string | null = null;

  // Step 1: Sum base FSG + V.O. + manual adj for all team members.
  // Note: fsgPoints, votedOutBonus, and manualAdjustment are kept separate.
  // Multipliers (captain 2x, chips) only ever touch fsgPoints + votedOutBonus.
  for (const sid of teamSurvivorIds) {
    const scores = survivorEpScores[sid];
    if (!scores) continue;
    baseTeamFsg += scores.fsgPoints;
    teamVotedOutBonus += scores.votedOutBonus;
    teamManualAdjustment += scores.manualAdjustment;
  }

  // Step 2: Captain 2x — applies to (FSG + V.O.) only, NOT manual adjustments.
  // The extra 1x bonus is stored in captainBonusPoints (the base 1x is already in baseTeam).
  if (captainId && hasCaptainPrivilege && teamSurvivorIds.includes(captainId)) {
    const captainScores = survivorEpScores[captainId];
    if (captainScores) {
      captainBasePoints = captainScores.fsgPoints + captainScores.votedOutBonus;
      captainBonusPoints = captainBasePoints; // +1x extra = 2x total

      if (captainScores.isNewlyEliminated) {
        captainLost = true; // still gets 2x this episode, but privilege is permanently lost
      }
    }
  }

  // Step 3: Chip effects — multipliers act on (FSG + V.O.) only.
  if (chipPlayed) {
    switch (chipPlayed) {
      case 1: {
        // Assistant Manager — add the target manager's full fantasy for this episode
        // (FSG + voted-out + manual adj + captain 2x), excluding whatever chip THEY played.
        if (assistantManagerTargetScore !== undefined) {
          chipBonusPoints = assistantManagerTargetScore;
          chipDetail = `Assistant Manager: +${assistantManagerTargetScore} pts copied from target`;
        } else {
          chipDetail = `Assistant Manager: target score not found (0 pts added)`;
        }
        break;
      }

      case 2: {
        // Team Boost — non-captain members get 3x of (FSG + V.O.) (base 1x + 2x extra).
        // Manual adjustments are NOT multiplied.
        for (const sid of teamSurvivorIds) {
          if (sid === captainId) continue; // captain is handled separately
          const scores = survivorEpScores[sid];
          if (!scores) continue;
          const memberTotal = scores.fsgPoints + scores.votedOutBonus;
          chipBonusPoints += memberTotal * 2; // +2x extra → 3x total
        }
        chipDetail = `Team Boost: non-captain members 3x`;
        break;
      }

      case 3: {
        // Super Captain — captain's (FSG + V.O.) at 4x instead of 2x.
        // Manual adjustments are NOT multiplied.
        if (captainId && hasCaptainPrivilege && captainBasePoints > 0) {
          chipBonusPoints = captainBasePoints * 2;
          chipDetail = `Super Captain: captain at 4x`;
        } else {
          chipDetail = `Super Captain: no effect (captain privilege lost or no captain)`;
        }
        break;
      }

      case 4: {
        chipDetail = `Swap Out: roster updated`;
        break;
      }

      case 5: {
        chipDetail = `Player Add: survivor added`;
        break;
      }
    }
  }

  // Final totals.
  // baseTeamPoints (returned for display in manager_scores.base_team_points)
  // folds in manualAdjustment so the per-episode TEAM card shows the
  // adjusted value, e.g. "TEAM -5 PTS" when an idol penalty applies.
  // fantasyPoints includes manualAdjustment exactly once (via baseTeamPoints).
  const baseTeamPoints = baseTeamFsg + teamManualAdjustment;
  const fantasyPoints =
    baseTeamPoints + teamVotedOutBonus + captainBonusPoints + chipBonusPoints;

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

export function calculatePoolScore(
  weeksSurvived: number,
  totalWeeks: number,
  topFantasyScore: number
): number {
  if (totalWeeks === 0) return 0;
  return (
    Math.round(((weeksSurvived / totalWeeks) * 0.25 * topFantasyScore) * 100) / 100
  );
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
    const pred = predictions.find((p) => p.place === tier.place);
    const actual = actuals.find((a) => a.place === tier.place);
    if (pred && actual && pred.survivorId === actual.survivorId) {
      score = tier.points; // highest sequential tier reached (not cumulative)
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

export function calculateGrandTotal(
  fantasy: number,
  pool: number,
  quinfecta: number,
  net: number
): number {
  return Math.round((fantasy + pool + quinfecta + net) * 100) / 100;
}
