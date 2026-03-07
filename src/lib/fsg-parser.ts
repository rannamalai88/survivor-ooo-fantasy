// =============================================================================
// lib/fsg-parser.ts — FSG Score Parser for Survivor OOO Fantasy League
// =============================================================================
// Parses raw HTML from FantasySurvivorGame.com as received by Vercel fetch().
//
// Season page HTML structure (per survivor row):
//   <tr>
//     <td class="isplaying">...<img alt="A lighted torch">...</td>
//     <td class="TableSurvImg">...<a href="/survivors/529-Tiffany">...</a>...</td>
//     <td class="SurvInfo">
//       <a href="/survivors/529-Tiffany"><span class="survivorname">Tiffany Ervin</span></a>
//       <br><span class="TableTribeName"><span style="color: #00B8AD;">Kalo</span></span>
//     </td>
//     <td>14</td>  <!-- Surv Pts -->
//     <td>0</td>   <!-- Out Pts -->
//     <td>14</td>  <!-- Total Pts -->
//     <td>2</td>   <!-- Rew Wins -->
//     <td>2</td>   <!-- Imm Wins -->
//     <td>&mdash;</td>  <!-- Voted Out (or number) -->
//     <td>&mdash;</td>  <!-- Place (or number) -->
//   </tr>
//
// Episode recap HTML structure:
//   <dt>Win a Tribe Immunity Challenge <span class="points">(3)</span></dt>
//   <dd><span class="text-nowrap">
//     <a href="/survivors/529-Tiffany"><span class="survivorname" title="Tiffany Ervin">Tiffany</span></a>,
//   </span>...</dd>
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
  // Also handle &quot; from HTML
  const htmlQuoteMatch = fullName.match(/&quot;([^&]+)&quot;/);
  if (htmlQuoteMatch) return htmlQuoteMatch[1];
  return fullName.split(' ')[0];
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/&mdash;/g, '—').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
}

// --- Parser 1: Season Scores (Raw HTML) --------------------------------------

export function parseSeasonScores(html: string): FSGSurvivorScore[] {
  const results: FSGSurvivorScore[] = [];

  // Extract all <tr>...</tr> blocks
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Must contain a survivorname span
    if (!rowHtml.includes('survivorname')) continue;

    // Extract survivor name from <span class="survivorname">Full Name</span>
    const nameMatch = rowHtml.match(/<span\s+class="survivorname"[^>]*>([^<]+)<\/span>/);
    if (!nameMatch) continue;
    const fullName = nameMatch[1].trim();

    // Extract FSG ID from href="/survivors/529-Tiffany"
    const idMatch = rowHtml.match(/href="\/survivors\/(\d+-[^"]+)"/);
    if (!idMatch) continue;
    const fsgId = idMatch[1];

    // Skip duplicates
    if (results.find(r => r.fsgId === fsgId)) continue;

    // Extract tribe from TableTribeName span
    // Pattern: <span class="TableTribeName">...<span style="color: ...;">Kalo</span>...</span>
    let tribe = 'Unknown';
    const tribeMatch = rowHtml.match(/class="TableTribeName"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/);
    if (tribeMatch) {
      tribe = tribeMatch[1].trim();
    }

    // Extract all <td> contents (strip HTML from each)
    const tdValues: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
      tdValues.push(stripHtml(tdMatch[1]));
    }

    // Find numeric values and dashes from the td cells
    // The stats are in the last 7 <td> cells: SurvPts, OutPts, TotalPts, RewWins, ImmWins, VotedOut, Place
    const numericValues: (number | null)[] = [];
    for (const val of tdValues) {
      const cleaned = val.replace(/[*\s]/g, '').trim();
      if (cleaned === '—' || cleaned === '-' || cleaned === '') {
        numericValues.push(null);
      } else if (/^\d+$/.test(cleaned)) {
        numericValues.push(parseInt(cleaned, 10));
      }
      // Skip non-numeric cells (like the image cell, name cell, etc.)
    }

    // We need at least 7 numeric/null values
    if (numericValues.length < 7) continue;

    // Take the last 7
    const stats = numericValues.slice(-7);
    const [survPts, outPts, totalPts, rewardWins, immunityWins, votedOut, place] = stats;

    results.push({
      name: fullName,
      firstName: extractFirstName(fullName),
      tribe,
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

// --- Parser 2: Episode Recap (Raw HTML) --------------------------------------

export function parseEpisodeRecap(html: string): FSGEpisodeData[] {
  const episodes: FSGEpisodeData[] = [];

  // Split by episode sections
  // Episode headers look like: <h5>Episode 1</h5> or similar
  // But we can also split on a pattern that includes "Episode N"
  const epSplitRegex = /Episode\s+(\d+)/gi;
  const epPositions: { epNum: number; index: number }[] = [];
  let epSplitMatch;

  while ((epSplitMatch = epSplitRegex.exec(html)) !== null) {
    const epNum = parseInt(epSplitMatch[1], 10);
    // Avoid duplicate episode numbers (the word "Episode" appears in nav too)
    if (!epPositions.find(p => p.epNum === epNum)) {
      epPositions.push({ epNum, index: epSplitMatch.index });
    }
  }

  for (let i = 0; i < epPositions.length; i++) {
    const { epNum, index: startIdx } = epPositions[i];
    const endIdx = i + 1 < epPositions.length ? epPositions[i + 1].index : html.length;
    const section = html.substring(startIdx, endIdx);

    const votedOut: string[] = [];
    const quitEvac: string[] = [];
    const actions: FSGEpisodeAction[] = [];

    // Find all <dt>...</dt> and <dd>...</dd> pairs in this section
    // Build an array of dt/dd pairs in order
    const dlItemRegex = /<(dt|dd)[^>]*>([\s\S]*?)<\/\1>/gi;
    const items: { type: string; content: string }[] = [];
    let dlMatch;

    while ((dlMatch = dlItemRegex.exec(section)) !== null) {
      items.push({ type: dlMatch[1].toLowerCase(), content: dlMatch[2] });
    }

    // Process dt/dd pairs
    let currentDt: string | null = null;

    for (const item of items) {
      if (item.type === 'dt') {
        currentDt = item.content;
        continue;
      }

      if (item.type === 'dd' && currentDt !== null) {
        const dtText = stripHtml(currentDt);
        const ddHtml = item.content;

        // Extract survivor names from dd
        // Pattern: <span class="survivorname" title="Full Name">FirstName</span>
        // or: <a href="/survivors/..."><span class="survivorname"...>Name</span></a>
        const names: string[] = [];
        const nameRegex = /<span\s+class="survivorname"[^>]*>([^<]+)<\/span>/gi;
        let nameMatch;
        while ((nameMatch = nameRegex.exec(ddHtml)) !== null) {
          names.push(nameMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim());
        }

        // If no survivorname spans, try plain <a> links to /survivors/
        if (names.length === 0) {
          const linkRegex = /<a[^>]*href="\/survivors\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
          let linkMatch;
          while ((linkMatch = linkRegex.exec(ddHtml)) !== null) {
            const name = linkMatch[1].trim();
            if (!name.includes('Survivor cast photo')) {
              names.push(name);
            }
          }
        }

        // Determine if this is voted out, quit/evac, or a scoring action
        const dtLower = dtText.toLowerCase();
        if (dtLower.includes('voted out')) {
          votedOut.push(...names);
          currentDt = null;
          continue;
        }
        if (dtLower.includes('quit') || dtLower.includes('evac')) {
          quitEvac.push(...names);
          currentDt = null;
          continue;
        }

        // Parse action name and points
        // DT HTML: Win a Tribe Immunity Challenge <span class="points">(3)</span>
        // After stripping HTML, dtText = "Win a Tribe Immunity Challenge (3)"
        const actionMatch = dtText.match(/^(.+?)\s*\((\d+)\)\s*$/);
        if (actionMatch && names.length > 0) {
          actions.push({
            actionName: actionMatch[1].trim(),
            pointValue: parseInt(actionMatch[2], 10),
            survivors: names,
          });
        }

        currentDt = null;
      }
    }

    if (actions.length > 0 || votedOut.length > 0 || quitEvac.length > 0) {
      episodes.push({ episodeNumber: epNum, votedOut, quitEvac, actions });
    }
  }

  return episodes;
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
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivorOOOFantasy/1.0)', Accept: 'text/html' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`FSG fetch failed: ${response.status} ${response.statusText}`);
  return response.text();
}

export async function fetchFSGRecapPage(seasonNumber: number = 50): Promise<string> {
  const url = `${FSG_BASE_URL}/episode-recap/season/${seasonNumber}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivorOOOFantasy/1.0)', Accept: 'text/html' },
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
