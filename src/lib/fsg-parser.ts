// =============================================================================
// lib/fsg-parser.ts — FSG Score Parser for Survivor OOO Fantasy League
// =============================================================================
// Parses FantasySurvivorGame.com HTML to extract survivor scores.
//
// Two data sources:
//   1. /survivors/season/50    → Season totals per survivor
//   2. /episode-recap/season/50 → Per-episode action breakdowns
//
// FSG serves server-rendered HTML (not JS-rendered SPA), so a simple
// fetch() from Vercel serverless functions gets the full data.
// =============================================================================

// --- Types -------------------------------------------------------------------

export interface FSGSurvivorScore {
  name: string;
  firstName: string;
  tribe: string;
  fsgId: string;
  survPts: number;
  outPts: number;
  totalPts: number;
  rewardWins: number;
  immunityWins: number;
  votedOut: number | null;
  place: number | null;
  isEliminated: boolean;
}

export interface FSGEpisodeAction {
  actionName: string;
  pointValue: number;
  survivors: string[];
}

export interface FSGEpisodeData {
  episodeNumber: number;
  votedOut: string[];
  quitEvac: string[];
  actions: FSGEpisodeAction[];
}

export interface SurvivorEpisodeScore {
  survivorName: string;
  episode: number;
  fsgPoints: number;
  scoredActions: { action: string; points: number }[];
}

// --- Helpers -----------------------------------------------------------------

function extractFirstName(fullName: string): string {
  // Handle quoted nicknames: Quintavius "Q" Burdette → Q
  // Benjamin "Coach" Wade → Coach
  const nicknameMatch = fullName.match(/"([^"]+)"/);
  if (nicknameMatch) return nicknameMatch[1];
  return fullName.split(' ')[0];
}

// --- Parser 1: Season Scores -------------------------------------------------
// Parses the table at /survivors/season/{N}
// Each row: | torch | [photo] | [Name](/survivors/ID) Tribe | survPts | outPts | totalPts | rewWins | immWins | votedOut | place |

export function parseSeasonScores(html: string): FSGSurvivorScore[] {
  const results: FSGSurvivorScore[] = [];
  const lines = html.split('\n');

  for (const line of lines) {
    // Skip header/separator lines
    if (line.includes('Surv Pts') || line.match(/^\|\s*---/)) continue;

    // Find survivor ID in link (handles quotes in IDs like 527-"Q")
    const idMatch = line.match(/\/survivors\/(\d+-[^)\]\s]+)/);
    if (!idMatch) continue;

    // Find name + tribe: [Full Name](/survivors/ID)   Tribe
    const nameAndTribeMatch = line.match(
      /\[([^\]]+)\]\(\/survivors\/\d+-[^)\s]+[^)]*\)\s+(Kalo|Vatu|Cila|Out)/
    );
    if (!nameAndTribeMatch) continue;

    const fullName = nameAndTribeMatch[1];
    const fsgId = idMatch[1];
    const tribe = nameAndTribeMatch[2];

    // Extract the 7 stat columns after the tribe name
    const afterTribe = line.substring(
      line.indexOf(nameAndTribeMatch[2]) + nameAndTribeMatch[2].length
    );
    const numbers = afterTribe.match(
      /\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([—\d*]+)\s*\|\s*([—\d]+)\s*\|?/
    );
    if (!numbers) continue;

    const survPts = parseInt(numbers[1], 10);
    const outPts = parseInt(numbers[2], 10);
    const totalPts = parseInt(numbers[3], 10);
    const rewardWins = parseInt(numbers[4], 10);
    const immunityWins = parseInt(numbers[5], 10);
    const votedOutStr = numbers[6];
    const placeStr = numbers[7];

    const votedOut = votedOutStr === '—' ? null : parseInt(votedOutStr.replace('*', ''), 10);
    const place = placeStr === '—' ? null : parseInt(placeStr, 10);

    // Deduplicate (photo link + name link both match)
    if (!results.find((r) => r.fsgId === fsgId)) {
      results.push({
        name: fullName,
        firstName: extractFirstName(fullName),
        tribe,
        fsgId,
        survPts,
        outPts,
        totalPts,
        rewardWins,
        immunityWins,
        votedOut,
        place,
        isEliminated: place !== null,
      });
    }
  }

  return results;
}

// --- Parser 2: Episode Recap -------------------------------------------------
// Parses the definition-list format at /episode-recap/season/{N}
// Structure per episode:
//   ##### Episode N
//   Action Name (points)
//   :   [Survivor1](/link), [Survivor2](/link), ...
//   Voted out
//   :   [Name](/link) (Nth place)

export function parseEpisodeRecap(html: string): FSGEpisodeData[] {
  const episodes: FSGEpisodeData[] = [];
  const episodeSections = html.split(/#{3,6}\s*Episode\s+/i);

  for (const section of episodeSections) {
    const epNumMatch = section.match(/^(\d+)/);
    if (!epNumMatch) continue;

    const episodeNumber = parseInt(epNumMatch[1], 10);
    const votedOut: string[] = [];
    const quitEvac: string[] = [];
    const actions: FSGEpisodeAction[] = [];

    const lines = section.split('\n');
    let currentAction: { name: string; points: number } | null = null;
    let currentSurvivors: string[] = [];
    let inVotedOut = false;
    let inQuitEvac = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Section markers
      if (trimmed.match(/^Voted out$/i)) {
        if (currentAction && currentSurvivors.length > 0) {
          actions.push({
            actionName: currentAction.name,
            pointValue: currentAction.points,
            survivors: [...currentSurvivors],
          });
          currentAction = null;
          currentSurvivors = [];
        }
        inVotedOut = true;
        inQuitEvac = false;
        continue;
      }

      if (trimmed.match(/^Quit\/Evac$/i)) {
        if (currentAction && currentSurvivors.length > 0) {
          actions.push({
            actionName: currentAction.name,
            pointValue: currentAction.points,
            survivors: [...currentSurvivors],
          });
          currentAction = null;
          currentSurvivors = [];
        }
        inVotedOut = false;
        inQuitEvac = true;
        continue;
      }

      // Action header: "Action Name (N)"
      const actionHeaderMatch = trimmed.match(/^([A-Z][^(]+?)\s*\((\d+)\)\s*$/);
      if (actionHeaderMatch) {
        if (currentAction && currentSurvivors.length > 0) {
          actions.push({
            actionName: currentAction.name,
            pointValue: currentAction.points,
            survivors: [...currentSurvivors],
          });
        }
        currentAction = {
          name: actionHeaderMatch[1].trim(),
          points: parseInt(actionHeaderMatch[2], 10),
        };
        currentSurvivors = [];
        inVotedOut = false;
        inQuitEvac = false;
        continue;
      }

      // Extract survivor links
      const nameLinks = [...trimmed.matchAll(/\[([^\]]+)\]\(\/survivors\/[^)]+\)/g)];
      if (nameLinks.length > 0) {
        for (const nameLink of nameLinks) {
          const name = nameLink[1];
          if (inVotedOut) {
            votedOut.push(name);
          } else if (inQuitEvac) {
            quitEvac.push(name);
          } else if (currentAction) {
            currentSurvivors.push(name);
          }
        }
      }
    }

    // Don't forget the last action
    if (currentAction && currentSurvivors.length > 0) {
      actions.push({
        actionName: currentAction.name,
        pointValue: currentAction.points,
        survivors: [...currentSurvivors],
      });
    }

    episodes.push({ episodeNumber, votedOut, quitEvac, actions });
  }

  return episodes;
}

// --- Score Calculator --------------------------------------------------------
// Combines episode actions into per-survivor, per-episode point totals

export function calculateEpisodeScores(
  recapData: FSGEpisodeData[]
): SurvivorEpisodeScore[] {
  const scores: SurvivorEpisodeScore[] = [];

  for (const episode of recapData) {
    const survivorActions: Record<string, { action: string; points: number }[]> = {};

    for (const action of episode.actions) {
      for (const survivorName of action.survivors) {
        if (!survivorActions[survivorName]) {
          survivorActions[survivorName] = [];
        }
        survivorActions[survivorName].push({
          action: action.actionName,
          points: action.pointValue,
        });
      }
    }

    for (const [name, actionsList] of Object.entries(survivorActions)) {
      const totalPts = actionsList.reduce((sum, a) => sum + a.points, 0);
      scores.push({
        survivorName: name,
        episode: episode.episodeNumber,
        fsgPoints: totalPts,
        scoredActions: actionsList,
      });
    }
  }

  return scores;
}

// --- Fetcher -----------------------------------------------------------------
// Pulls HTML from FSG and parses it

const FSG_BASE_URL = 'https://www.fantasysurvivorgame.com';

export async function fetchFSGSeasonPage(
  seasonNumber: number = 50
): Promise<string> {
  const url = `${FSG_BASE_URL}/survivors/season/${seasonNumber}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SurvivorOOOFantasy/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
    // Vercel serverless: ensure no stale cache
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`FSG fetch failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

export async function fetchFSGRecapPage(
  seasonNumber: number = 50
): Promise<string> {
  const url = `${FSG_BASE_URL}/episode-recap/season/${seasonNumber}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SurvivorOOOFantasy/1.0)',
      Accept: 'text/html,application/xhtml+xml',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      `FSG episode recap fetch failed: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

export async function fetchAndParseSeasonScores(
  seasonNumber: number = 50
): Promise<FSGSurvivorScore[]> {
  const html = await fetchFSGSeasonPage(seasonNumber);
  return parseSeasonScores(html);
}

export async function fetchAndParseEpisodeRecap(
  seasonNumber: number = 50
): Promise<FSGEpisodeData[]> {
  const html = await fetchFSGRecapPage(seasonNumber);
  return parseEpisodeRecap(html);
}
