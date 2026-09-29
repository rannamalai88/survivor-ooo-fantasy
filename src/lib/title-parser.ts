// =============================================================================
// lib/title-parser.ts — episode titles from The Futon Critic (pure function)
// =============================================================================
// FSG only publishes recaps after an episode airs, but the Title slot needs the
// title BEFORE picks lock. CBS press releases (mirrored by The Futon Critic)
// carry it about a week ahead. Spec v3 §3.4.
//
// Listing rows look like:
//   <tr><td>9/30/26 (We.)</td><td>8:00 PM</td><td>CBS</td><td><a …>Weaponized Honesty</a></td></tr>
//   <tr><td>9/23/26 (We.)</td>…<td><a …>(#5101-120) Permanent Uncertainty</a></td></tr>
//   <tr><td>10/7/26 (We.)</td>…<td>TBA</td></tr>
//   …plus hundreds of older rerun rows whose titles end in "(R)".
//
// Rules: strip a "(#NNNN-NNN) " production-code prefix; skip "(R)" reruns and
// "TBA"; dedupe by air date preferring the non-rerun row. Matching to our
// episodes is by AIR DATE only — episode numbers are never parsed.
// Throws if the page doesn't look like a listings table, so the caller writes
// nothing rather than a partial result.
// =============================================================================

export const FUTON_CRITIC_URL = 'http://www.thefutoncritic.com/showatch/survivor/listings/';

export interface ParsedTitle { airDate: string; title: string }   // airDate = YYYY-MM-DD

function decode(s: string) {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseFutonTitles(html: string): ParsedTitle[] {
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const byDate = new Map<string, { title: string; rerun: boolean }>();
  let listingRows = 0;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => decode(c[1]));
    if (cells.length < 4) continue;
    const d = cells[0].match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\b/);
    if (!d) continue;
    listingRows++;
    const airDate = `20${d[3]}-${d[1].padStart(2, '0')}-${d[2].padStart(2, '0')}`;
    let title = cells[cells.length - 1];
    const rerun = /\(R\)\s*$/.test(title);
    title = title.replace(/^\(#[\d-]+\)\s*/, '').replace(/\s*\(R\)\s*$/, '').trim();
    if (!title || /^TBA$/i.test(title)) continue;
    const existing = byDate.get(airDate);
    // Prefer the non-rerun row when CBS reissues a date
    if (!existing || (existing.rerun && !rerun)) byDate.set(airDate, { title, rerun });
  }
  if (listingRows === 0) throw new Error('Futon Critic page has no listing rows (M/D/YY … title) — markup may have changed.');
  return [...byDate.entries()].filter(([, v]) => !v.rerun).map(([airDate, v]) => ({ airDate, title: v.title }));
}

export async function fetchFutonTitlesPage(): Promise<string> {
  const res = await fetch(FUTON_CRITIC_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurvivorOOOFantasy/1.0)', Accept: 'text/html' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Futon Critic fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}
