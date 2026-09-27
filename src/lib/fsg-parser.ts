// =============================================================================
// lib/fsg-parser.ts — FantasySurvivorGame.com parser (S51)
// =============================================================================
// Pure functions: HTML in, structured data out. No database access.
//
// Survivors are identified by the numeric FSG id in every link
// (href="/survivors/536-Aaliyah" → 536). NEVER match on names: nicknames
// arrive HTML-encoded (Angelica &quot;Jelly&quot; Loblack) and slugs contain
// spaces (538-Thien An).
//
// Episode recap structure (per episode):
//   <h5 ... id="episode1">Episode 1</h5>
//   summary boxes:  <h6 class="mb-0">Immunity</h6><div>Savu</div>
//   <dl>
//     <dt class="col-sm-4 outplaycolor" title="...">Read Tree Mail <span class="points">(1)</span></dt>
//     <dd>...<a href="/survivors/555-Rob">...</a>, ... and ...</dd>
//     <dt class="col-sm-4 outwitcolor" title="Survivor was voted out">Voted out</dt>
//     <dd><a href="/survivors/536-Aaliyah">...</a> <span class="place">(21st place)</span></dd>
//     <dt class="col-sm-4 outlastcolor" ...>Sole survivor</dt>
//     <dd><a href="/survivors/518-Aubry">...</a> (1st place)</dd>
//   </dl>
//
// The parser FAILS LOUDLY: anything it cannot classify is reported in
// `errors` (blocks writes) or `warnings` (written, but surfaced to the admin).
// The Open Era may add new FSG actions mid-season.
// =============================================================================

export type EventCategory = 'reward' | 'immunity' | 'other' | 'departure';
export type DepartureKind = 'Voted out' | 'Quit/Evac' | 'Out of game';

// The ONLY four strings that count as challenge wins (spec §3.1).
// Never substring-match "immunity"/"reward": "Gain an Immunity Idol" is not a win.
export const CHALLENGE_WHITELIST: Record<string, 'reward' | 'immunity'> = {
  'Win a Tribe Reward Challenge': 'reward',
  'Win an Individual Reward Challenge': 'reward',
  'Win a Tribe Immunity Challenge': 'immunity',
  'Win an Individual Immunity Challenge': 'immunity',
};

// Known non-challenge actions (S50 + S51). Anything else is still scored as
// 'other' but raised as a warning so a human looks at it.
export const KNOWN_OTHER_ACTIONS = new Set([
  'Read Tree Mail', 'Strategize at the Water Well', 'Make Fire at Camp', 'Find Food',
  'Negotiate for Supplies', 'Go to Exile Island', 'Go on a Journey', 'Win a Journey Challenge',
  'Island Challenge', 'Gain an Immunity Idol', 'Gain an Advantage', 'Play an Idol or Advantage',
  'Play Shot in the Dark', 'Survivor Auction', 'Love from Home', 'Merge',
  'Win the Fire Making Challenge', 'Win the Marooning Challenge', 'Win the Supply Challenge',
  'Flip Mr. Beast Gold Coin',
]);

const DEPARTURE_KINDS: DepartureKind[] = ['Voted out', 'Quit/Evac', 'Out of game'];

export function classifyAction(action: string): { category: EventCategory; known: boolean } {
  const challenge = CHALLENGE_WHITELIST[action];
  if (challenge) return { category: challenge, known: true };
  return { category: 'other', known: KNOWN_OTHER_ACTIONS.has(action) };
}

// --- Types -------------------------------------------------------------------

export interface ParsedEvent {
  fsgId: number;
  action: string;          // verbatim FSG string
  points: number;          // verbatim value from the page (0 for departures)
  category: EventCategory;
}

export interface ParsedDeparture {
  fsgId: number;
  kind: DepartureKind;
  place: number | null;    // FSG place (1 = winner). Null if FSG omitted it.
}

export interface ParsedEpisode {
  episode: number;
  events: ParsedEvent[];              // includes one 'departure' row per departure
  departures: ParsedDeparture[];
  soleSurvivor: { fsgId: number; place: number | null } | null;
  summary: { label: string; values: string[] }[];   // header boxes, decoded text
  unknownActions: string[];
  errors: string[];
  warnings: string[];
}

export interface ParsedSeasonRow {
  fsgId: number;
  name: string;            // decoded full name
  tribe: string;           // FSG's current tribe (e.g. "Savu", or "Out")
  survPts: number;         // cumulative FSG survival points
  place: number | null;    // FSG place once out of the game
}

// --- Helpers -----------------------------------------------------------------

export function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function fsgIdsIn(html: string): number[] {
  const ids: number[] = [];
  const re = /href="\/survivors\/(\d+)-[^"]*"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = parseInt(m[1], 10);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function placeIn(html: string): number | null {
  const m = stripTags(html).match(/\((\d+)(?:st|nd|rd|th) place\)/i);
  return m ? parseInt(m[1], 10) : null;
}

// --- Episode recap -------------------------------------------------------------

export function parseRecap(html: string): ParsedEpisode[] {
  const headerRe = /<h5[^>]*id="episode(\d+)"[^>]*>/g;
  const heads: { episode: number; index: number }[] = [];
  let hm;
  while ((hm = headerRe.exec(html)) !== null) {
    heads.push({ episode: parseInt(hm[1], 10), index: hm.index });
  }

  return heads.map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : html.length;
    return parseEpisodeSection(h.episode, html.substring(h.index, end));
  }).sort((a, b) => a.episode - b.episode);
}

function parseEpisodeSection(episode: number, section: string): ParsedEpisode {
  const out: ParsedEpisode = {
    episode, events: [], departures: [], soleSurvivor: null,
    summary: [], unknownActions: [], errors: [], warnings: [],
  };

  // Summary boxes (independent of the itemized list — used for cross-checks)
  const boxRe = /<h6 class="mb-0">([^<]*)<\/h6>\s*<div>([\s\S]*?)<\/div>/g;
  let bm;
  while ((bm = boxRe.exec(section)) !== null) {
    const label = decodeEntities(bm[1]).trim();
    const values = stripTags(bm[2]).split(/,|\//).map(s => s.trim()).filter(Boolean);
    out.summary.push({ label, values });
  }

  // Itemized <dt>/<dd> pairs
  const pairRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  let pm;
  while ((pm = pairRe.exec(section)) !== null) {
    const dtHtml = pm[1];
    const ddHtml = pm[2];
    const ids = fsgIdsIn(ddHtml);
    const pointsMatch = dtHtml.match(/<span class="points">\((-?\d+)\)<\/span>/);
    const label = stripTags(dtHtml.replace(/<span class="points">[\s\S]*?<\/span>/, ''));

    if (ids.length === 0) {
      out.errors.push(`Episode ${episode}: "${label}" lists no survivors — FSG markup may have changed.`);
      continue;
    }

    if (pointsMatch) {
      const points = parseInt(pointsMatch[1], 10);
      const { category, known } = classifyAction(label);
      if (!known) {
        if (!out.unknownActions.includes(label)) out.unknownActions.push(label);
        out.warnings.push(`Episode ${episode}: unknown FSG action "${label}" (${points}) — scored as Other. Check it isn't a challenge win.`);
      }
      for (const fsgId of ids) out.events.push({ fsgId, action: label, points, category });
      continue;
    }

    if ((DEPARTURE_KINDS as string[]).includes(label)) {
      const kind = label as DepartureKind;
      // One departure line can in theory carry several survivors; FSG shows one
      // place per survivor, so split the dd by survivor link when needed.
      const chunks = ddHtml.split(/(?=<a href="\/survivors\/)/).filter(c => /\/survivors\/\d+-/.test(c));
      for (const chunk of chunks) {
        const fsgId = fsgIdsIn(chunk)[0];
        const place = placeIn(chunk);
        if (place === null && kind === 'Voted out') {
          out.warnings.push(`Episode ${episode}: no place shown for voted-out survivor ${fsgId}.`);
        }
        out.departures.push({ fsgId, kind, place });
        out.events.push({ fsgId, action: kind, points: 0, category: 'departure' });
      }
      continue;
    }

    if (label === 'Sole survivor') {
      out.soleSurvivor = { fsgId: ids[0], place: placeIn(ddHtml) ?? 1 };
      continue;
    }

    out.errors.push(`Episode ${episode}: unrecognised line "${label}" with no point value — FSG markup may have changed.`);
  }

  if (out.events.length === 0 && !out.soleSurvivor) {
    out.errors.push(`Episode ${episode}: no actions or departures parsed.`);
  }
  return out;
}

// --- Season stats page ---------------------------------------------------------
// Columns (last 7 cells): Surv Pts, Out Pts, Total Pts, Rew Wins, Imm Wins, Voted Out, Place.
// Out Pts is deliberately ignored (spec §3.3).

export function parseSeasonStats(html: string): ParsedSeasonRow[] {
  const rows: ParsedSeasonRow[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm;
  while ((rm = rowRe.exec(html)) !== null) {
    const rowHtml = rm[1];
    if (!rowHtml.includes('survivorname')) continue;
    const fsgId = fsgIdsIn(rowHtml)[0];
    const nameMatch = rowHtml.match(/<span\s+class="survivorname"[^>]*>([^<]+)<\/span>/);
    if (!fsgId || !nameMatch || rows.some(r => r.fsgId === fsgId)) continue;

    const tribeMatch = rowHtml.match(/class="TableTribeName"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/);

    const cells: (number | null)[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tm;
    while ((tm = tdRe.exec(rowHtml)) !== null) {
      const v = stripTags(tm[1]).replace(/[*\s]/g, '');
      if (v === '—' || v === '-' || v === '') cells.push(null);
      else if (/^-?\d+$/.test(v)) cells.push(parseInt(v, 10));
    }
    if (cells.length < 7) continue;
    const [survPts, , , , , , place] = cells.slice(-7);

    rows.push({
      fsgId,
      name: decodeEntities(nameMatch[1]).trim(),
      tribe: tribeMatch ? decodeEntities(tribeMatch[1]).trim() : 'Unknown',
      survPts: survPts ?? 0,
      place,
    });
  }
  return rows;
}

// --- Fetchers --------------------------------------------------------------------

const FSG_BASE_URL = 'https://www.fantasysurvivorgame.com';

async function fetchFSG(path: string): Promise<string> {
  const res = await fetch(`${FSG_BASE_URL}${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivorOOOFantasy/1.0)', Accept: 'text/html' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`FSG fetch ${path} failed: ${res.status} ${res.statusText}`);
  return res.text();
}

export const fetchFSGRecapPage = (seasonNumber: number) => fetchFSG(`/episode-recap/season/${seasonNumber}`);
export const fetchFSGSeasonPage = (seasonNumber: number) => fetchFSG(`/survivors/season/${seasonNumber}`);
export const fsgRecapUrl = (seasonNumber: number, episode?: number) =>
  `${FSG_BASE_URL}/episode-recap/season/${seasonNumber}${episode ? `#episode${episode}` : ''}`;
