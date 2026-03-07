// =============================================================================
// lib/fsg-parser.ts — FSG Score Parser for Survivor OOO Fantasy League
// =============================================================================
// Parses FantasySurvivorGame.com to extract survivor scores.
//
// IMPORTANT: Vercel's fetch() returns RAW HTML (with <table>, <tr>, <td> tags).
// Claude's web_fetch returns markdown-converted text (with | pipe | tables |).
// This parser handles BOTH formats.
//
// Two data sources:
//   1. /survivors/season/50    → Season totals per survivor
//   2. /episode-recap/season/50 → Per-episode action breakdowns
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
  const nicknameMatch = fullName.match(/"([^"]+)"/);
  if (nicknameMatch) return nicknameMatch[1];
  return fullName.split(' ')[0];
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

// Detect whether input is raw HTML or markdown
function isRawHtml(text: string): boolean {
  return text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html');
}

// --- Parser 1: Season Scores -------------------------------------------------

function parseSeasonScoresFromHtml(html: string): FSGSurvivorScore[] {
  const results: FSGSurvivorScore[] = [];

  // Extract all table rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Find survivor links (skip photo-only rows)
    // Pattern: <a href="/survivors/529-Tiffany">Tiffany Ervin</a>
    const links = [...rowHtml.matchAll(/<a[^>]*href="\/survivors\/(\d+-[^"]*)"[^>]*>([^<]+)<\/a>/g)];
    
    // We need at least one link with a real name (not "Survivor cast photo of...")
    const nameLink = links.find(l => !l[2].includes('Survivor cast photo'));
    if (!nameLink) continue;

    const fsgId = nameLink[1];
    const fullName = nameLink[2].trim();

    // Already have this survivor? Skip duplicate rows
    if (results.find(r => r.fsgId === fsgId)) continue;

    // Extract all <td> cell contents
    const cells: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      cells.push(stripHtml(tdMatch[1]));
    }

    // Find tribe name — it's in the cell with the survivor name, after the </a> tag
    // Pattern: ...Tiffany Ervin</a> Kalo ...
    // Or it might be in a separate element
    let tribe = 'Unknown';
    
    // Look for tribe name right after the name link
    const afterNameMatch = rowHtml.match(
      new RegExp(fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '<\\/a>\\s*([A-Za-z]+)')
    );
    if (afterNameMatch && ['Kalo', 'Vatu', 'Cila', 'Out'].includes(afterNameMatch[1])) {
      tribe = afterNameMatch[1];
    } else {
      // Fallback: search cells for tribe name
      for (const cell of cells) {
        const tribeMatch = cell.match(/\b(Kalo|Vatu|Cila|Out)\b/i);
        if (tribeMatch) {
          tribe = tribeMatch[1];
          break;
        }
      }
    }

    // Extract all numeric values and dashes from cells
    const numericValues: (number | null)[] = [];
    for (const cell of cells) {
      const cleaned = cell.replace(/[*\s]/g, '').trim();
      if (cleaned === '—' || cleaned === '-' || cleaned === '') {
        numericValues.push(null);
      } else if (/^\d+$/.test(cleaned)) {
        numericValues.push(parseInt(cleaned, 10));
      }
    }

    // We need at least 7 numbers: Surv Pts, Out Pts, Total Pts, Rew Wins, Imm Wins, Voted Out, Place
    if (numericValues.length < 7) continue;

    // Take the last 7 values
    const stats = numericValues.slice(-7);
    const [survPts, outPts, totalPts, rewardWins, immunityWins, votedOut, place] = stats;

    results.push({
      name: fullName,
      firstName: extractFirstName(fullName),
      tribe: tribe === 'Out' ? 'Out' : tribe,
      fsgId,
      survPts: survPts ?? 0,
      outPts: outPts ?? 0,
      totalPts: totalPts ?? 0,
      rewardWins: rewardWins ?? 0,
      immunityWins: immunityWins ?? 0,
      votedOut: votedOut,
      place: place,
      isEliminated: place !== null,
    });
  }

  return results;
}

function parseSeasonScoresFromMarkdown(text: string): FSGSurvivorScore[] {
  const results: FSGSurvivorScore[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.includes('Surv Pts') || line.match(/^\|\s*---/)) continue;

    const idMatch = line.match(/\/survivors\/(\d+-[^)\]\s]+)/);
    if (!idMatch) continue;

    const nameAndTribeMatch = line.match(
      /\[([^\]]+)\]\(\/survivors\/\d+-[^)\s]+[^)]*\)\s+(Kalo|Vatu|Cila|Out)/
    );
    if (!nameAndTribeMatch) continue;

    const fullName = nameAndTribeMatch[1];
    const fsgId = idMatch[1];
    const tribe = nameAndTribeMatch[2];

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

    if (!results.find((r) => r.fsgId === fsgId)) {
      results.push({
        name: fullName,
        firstName: extractFirstName(fullName),
        tribe,
        fsgId,
        survPts, outPts, totalPts, rewardWins, immunityWins,
        votedOut, place,
        isEliminated: place !== null,
      });
    }
  }

  return results;
}

export function parseSeasonScores(text: string): FSGSurvivorScore[] {
  if (isRawHtml(text)) {
    return parseSeasonScoresFromHtml(text);
  }
  return parseSeasonScoresFromMarkdown(text);
}

// --- Parser 2: Episode Recap -------------------------------------------------

function parseEpisodeRecapFromHtml(html: string): FSGEpisodeData[] {
  const episodes: FSGEpisodeData[] = [];

  // The episode recap uses <dl> (definition lists) for actions:
  //   <dt>Action Name (points)</dt>
  //   <dd><a href="/survivors/ID">Name</a>, ...</dd>
  // And sections for each episode.
  // But the structure can vary, so we'll use a robust approach:
  // Convert HTML to a simplified text format, then parse that.

  // Step 1: Extract meaningful text while preserving structure markers
  let simplified = html
    // Mark episode headers
    .replace(/<h\d[^>]*>\s*Episode\s+(\d+)\s*<\/h\d>/gi, '\n###EPISODE $1###\n')
    // Mark definition terms (action names)
    .replace(/<dt[^>]*>([\s\S]*?)<\/dt>/gi, '\n###DT###$1###/DT###\n')
    // Mark definition data (survivor lists)
    .replace(/<dd[^>]*>([\s\S]*?)<\/dd>/gi, '\n###DD###$1###/DD###\n')
    // Preserve survivor links
    .replace(/<a[^>]*href="\/survivors\/([^"]*)"[^>]*>([^<]*)<\/a>/gi, '###LINK###$2###/LINK###')
    // Strip remaining HTML
    .replace(/<[^>]+>/g, ' ')
    // Clean whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Step 2: Split by episode markers
  const epParts = simplified.split('###EPISODE ');

  for (const part of epParts) {
    const epNumMatch = part.match(/^(\d+)###/);
    if (!epNumMatch) continue;

    const episodeNumber = parseInt(epNumMatch[1], 10);
    const votedOut: string[] = [];
    const quitEvac: string[] = [];
    const actions: FSGEpisodeAction[] = [];

    // Find all DT/DD pairs
    const dtRegex = /###DT###([\s\S]*?)###\/DT###\s*###DD###([\s\S]*?)###\/DD###/g;
    let dtMatch;

    while ((dtMatch = dtRegex.exec(part)) !== null) {
      const dtText = dtMatch[1].replace(/###[^#]*###/g, '').trim();
      const ddText = dtMatch[2];

      // Extract survivor names from links in DD
      const names: string[] = [];
      const linkRegex = /###LINK###([^#]+)###\/LINK###/g;
      let linkMatch;
      while ((linkMatch = linkRegex.exec(ddText)) !== null) {
        names.push(linkMatch[1].trim());
      }

      // Check if this is a "Voted out" or "Quit/Evac" section
      if (dtText.toLowerCase().includes('voted out')) {
        votedOut.push(...names);
        continue;
      }
      if (dtText.toLowerCase().includes('quit') || dtText.toLowerCase().includes('evac')) {
        quitEvac.push(...names);
        continue;
      }

      // Parse action name and points: "Win a Tribe Immunity Challenge (3)"
      const actionMatch = dtText.match(/^(.+?)\s*\((\d+)\)\s*$/);
      if (actionMatch && names.length > 0) {
        actions.push({
          actionName: actionMatch[1].trim(),
          pointValue: parseInt(actionMatch[2], 10),
          survivors: names,
        });
      }
    }

    // Fallback: if no DT/DD found, the HTML might use a different structure
    // Try looking for "Voted out" text directly
    if (votedOut.length === 0) {
      const votedOutMatch = part.match(/[Vv]oted\s+[Oo]ut[\s\S]*?###LINK###([^#]+)###\/LINK###/);
      if (votedOutMatch) {
        votedOut.push(votedOutMatch[1].trim());
      }
    }

    if (actions.length > 0 || votedOut.length > 0) {
      episodes.push({ episodeNumber, votedOut, quitEvac, actions });
    }
  }

  return episodes;
}

function parseEpisodeRecapFromMarkdown(text: string): FSGEpisodeData[] {
  const episodes: FSGEpisodeData[] = [];
  const episodeSections = text.split(/#{3,6}\s*Episode\s+/i);

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

      if (trimmed.match(/^Voted out$/i)) {
        if (currentAction && currentSurvivors.length > 0) {
          actions.push({ actionName: currentAction.name, pointValue: currentAction.points, survivors: [...currentSurvivors] });
          currentAction = null; currentSurvivors = [];
        }
        inVotedOut = true; inQuitEvac = false; continue;
      }

      if (trimmed.match(/^Quit\/Evac$/i)) {
        if (currentAction && currentSurvivors.length > 0) {
          actions.push({ actionName: currentAction.name, pointValue: currentAction.points, survivors: [...currentSurvivors] });
          currentAction = null; currentSurvivors = [];
        }
        inVotedOut = false; inQuitEvac = true; continue;
      }

      const actionHeaderMatch = trimmed.match(/^([A-Z][^(]+?)\s*\((\d+)\)\s*$/);
      if (actionHeaderMatch) {
        if (currentAction && currentSurvivors.length > 0) {
          actions.push({ actionName: currentAction.name, pointValue: currentAction.points, survivors: [...currentSurvivors] });
        }
        currentAction = { name: actionHeaderMatch[1].trim(), points: parseInt(actionHeaderMatch[2], 10) };
        currentSurvivors = [];
        inVotedOut = false; inQuitEvac = false; continue;
      }

      const nameLinks = [...trimmed.matchAll(/\[([^\]]+)\]\(\/survivors\/[^)]+\)/g)];
      if (nameLinks.length > 0) {
        for (const nameLink of nameLinks) {
          const name = nameLink[1];
          if (inVotedOut) votedOut.push(name);
          else if (inQuitEvac) quitEvac.push(name);
          else if (currentAction) currentSurvivors.push(name);
        }
      }
    }

    if (currentAction && currentSurvivors.length > 0) {
      actions.push({ actionName: currentAction.name, pointValue: currentAction.points, survivors: [...currentSurvivors] });
    }

    episodes.push({ episodeNumber, votedOut, quitEvac, actions });
  }

  return episodes;
}

export function parseEpisodeRecap(text: string): FSGEpisodeData[] {
  if (isRawHtml(text)) {
    return parseEpisodeRecapFromHtml(text);
  }
  return parseEpisodeRecapFromMarkdown(text);
}

// --- Score Calculator --------------------------------------------------------

export function calculateEpisodeScores(recapData: FSGEpisodeData[]): SurvivorEpisodeScore[] {
  const scores: SurvivorEpisodeScore[] = [];

  for (const episode of recapData) {
    const survivorActions: Record<string, { action: string; points: number }[]> = {};

    for (const action of episode.actions) {
      for (const survivorName of action.survivors) {
        if (!survivorActions[survivorName]) survivorActions[survivorName] = [];
        survivorActions[survivorName].push({ action: action.actionName, points: action.pointValue });
      }
    }

    for (const [name, actionsList] of Object.entries(survivorActions)) {
      scores.push({
        survivorName: name,
        episode: episode.episodeNumber,
        fsgPoints: actionsList.reduce((sum, a) => sum + a.points, 0),
        scoredActions: actionsList,
      });
    }
  }

  return scores;
}

// --- Fetcher -----------------------------------------------------------------

const FSG_BASE_URL = 'https://www.fantasysurvivorgame.com';

export async function fetchFSGSeasonPage(seasonNumber: number = 50): Promise<string> {
  const url = `${FSG_BASE_URL}/survivors/season/${seasonNumber}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivorOOOFantasy/1.0)', Accept: 'text/html,application/xhtml+xml' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`FSG fetch failed: ${response.status} ${response.statusText}`);
  return response.text();
}

export async function fetchFSGRecapPage(seasonNumber: number = 50): Promise<string> {
  const url = `${FSG_BASE_URL}/episode-recap/season/${seasonNumber}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivorOOOFantasy/1.0)', Accept: 'text/html,application/xhtml+xml' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`FSG episode recap fetch failed: ${response.status} ${response.statusText}`);
  return response.text();
}

export async function fetchAndParseSeasonScores(seasonNumber: number = 50): Promise<FSGSurvivorScore[]> {
  const html = await fetchFSGSeasonPage(seasonNumber);
  return parseSeasonScores(html);
}

export async function fetchAndParseEpisodeRecap(seasonNumber: number = 50): Promise<FSGEpisodeData[]> {
  const html = await fetchFSGRecapPage(seasonNumber);
  return parseEpisodeRecap(html);
}
