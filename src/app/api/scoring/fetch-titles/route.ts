// src/app/api/scoring/fetch-titles/route.ts
// ============================================================
// Pulls episode titles from The Futon Critic (CBS press releases) and writes
// them to episodes.title so managers see the title before picks lock.
//
//   GET  — daily Vercel cron (vercel.json). If CRON_SECRET is set in Vercel,
//          requests must carry "Authorization: Bearer <CRON_SECRET>".
//   POST — the admin "Fetch titles" button.
//
// Matches on episodes.air_date (never episode numbers). Only fills episodes
// whose title is empty or was itself scraped (title_source = 'thefutoncritic');
// a commissioner-set title is never overwritten. If the page can't be parsed,
// nothing is written.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { SEASON_ID } from '@/lib/constants';
import { fetchFutonTitlesPage, parseFutonTitles } from '@/lib/title-parser';

export const dynamic = 'force-dynamic';

async function run(seasonId: string) {
  const supabase = createServiceClient();

  // Parse first — any failure here aborts before a single write.
  let parsed;
  try {
    parsed = parseFutonTitles(await fetchFutonTitlesPage());
  } catch (err: any) {
    console.error('[fetch-titles] PARSE FAILURE — nothing written:', err.message);
    await supabase.from('activity_log').insert({ season_id: seasonId, type: 'admin', message: `Title fetch FAILED — nothing written: ${err.message}`, metadata: { kind: 'title_fetch_error' } });
    return NextResponse.json({ success: false, error: `Title fetch failed, nothing written: ${err.message}` }, { status: 502 });
  }

  const { data: episodes, error } = await supabase.from('episodes')
    .select('id, number, air_date, title, title_source').eq('season_id', seasonId).order('number');
  if (error) throw error;

  const byDate = new Map(parsed.map(p => [p.airDate, p.title]));
  const updates: { id: string; number: number; title: string }[] = [];
  const skipped: string[] = [];
  for (const ep of episodes || []) {
    const title = byDate.get(ep.air_date);
    if (!title) continue;
    if (ep.title && ep.title_source !== 'thefutoncritic') { if (ep.title !== title) skipped.push(`E${ep.number} (commissioner title kept)`); continue; }
    if (ep.title === title) continue;
    updates.push({ id: ep.id, number: ep.number, title });
  }

  const now = new Date().toISOString();
  for (const u of updates) {
    const { error: upErr } = await supabase.from('episodes')
      .update({ title: u.title, title_source: 'thefutoncritic', title_fetched_at: now }).eq('id', u.id);
    if (upErr) throw upErr;
  }
  if (updates.length) {
    await supabase.from('activity_log').insert({ season_id: seasonId, type: 'admin', message: `Episode titles fetched: ${updates.map(u => `E${u.number} "${u.title}"`).join(', ')}`, metadata: { kind: 'title_fetch' } });
  }

  return NextResponse.json({
    success: true,
    updated: updates.map(u => ({ episode: u.number, title: u.title })),
    skipped,
    seasonTitlesFound: (episodes || []).filter(e => byDate.has(e.air_date)).map(e => ({ episode: e.number, title: byDate.get(e.air_date) })),
  });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try { return await run(SEASON_ID); }
  catch (err: any) { console.error('[fetch-titles]', err); return NextResponse.json({ success: false, error: err.message }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  try { return await run(body.seasonId || SEASON_ID); }
  catch (err: any) { console.error('[fetch-titles]', err); return NextResponse.json({ success: false, error: err.message }, { status: 500 }); }
}
