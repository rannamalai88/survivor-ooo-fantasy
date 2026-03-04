// src/app/api/scoring/scrape-fsg/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseFSGPage } from '@/lib/scoring';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FSG_URL = 'https://www.fantasysurvivorgame.com/survivors/season/50';

export async function POST(request: NextRequest) {
  try {
    const { episode, seasonId } = await request.json();

    if (!episode || !seasonId) {
      return NextResponse.json({ error: 'Missing episode or seasonId' }, { status: 400 });
    }

    // 1. Fetch and parse FSG page
    const fsgResponse = await fetch(FSG_URL, { cache: 'no-store' });
    const fsgText = await fsgResponse.text();
    const fsgData = parseFSGPage(fsgText);

    if (fsgData.length === 0) {
      return NextResponse.json(
        { error: 'Failed to parse FSG data. The page format may have changed — check manually.' },
        { status: 500 }
      );
    }

    // 2. Get our survivors from DB for name → UUID mapping
    const { data: dbSurvivors } = await supabase
      .from('survivors')
      .select('id, name, full_name, cast_id, is_active, eliminated_episode')
      .eq('season_id', seasonId);

    if (!dbSurvivors || dbSurvivors.length === 0) {
      return NextResponse.json({ error: 'No survivors found in database for this season' }, { status: 500 });
    }

    // Build name → UUID lookup (try full_name first, then first name)
    const nameToSurvivor: Record<string, typeof dbSurvivors[0]> = {};
    for (const s of dbSurvivors) {
      nameToSurvivor[s.full_name] = s;
      nameToSurvivor[s.name] = s;
      // Also handle "Q" → Quintavius etc.
      if (s.name.startsWith('"')) {
        nameToSurvivor[s.name.replace(/"/g, '')] = s;
      }
    }

    // 3. Get previous episode's cumulative scores for diffing
    let previousCumulative: Record<string, number> = {}; // survivorId → cumulative survPts
    if (episode > 1) {
      const { data: prevScores } = await supabase
        .from('survivor_scores')
        .select('survivor_id, fsg_cumulative')
        .eq('season_id', seasonId)
        .eq('episode', episode - 1);

      if (prevScores) {
        for (const ps of prevScores) {
          previousCumulative[ps.survivor_id] = ps.fsg_cumulative || 0;
        }
      }
    }

    // 4. Calculate episode scores and build upsert rows
    const scoreRows: any[] = [];
    const eliminationUpdates: any[] = [];

    for (const fsg of fsgData) {
      const dbSurvivor = nameToSurvivor[fsg.fullName] || nameToSurvivor[fsg.name];
      if (!dbSurvivor) {
        console.warn(`⚠ Could not match FSG survivor "${fsg.fullName}" to database`);
        continue;
      }

      const prevCum = previousCumulative[dbSurvivor.id] || 0;
      const episodePoints = fsg.survPts - prevCum;

      // Voted out bonus — only if NEWLY eliminated this episode
      let votedOutBonus = 0;
      const isNewlyEliminated = fsg.place !== null && dbSurvivor.is_active !== false && !dbSurvivor.eliminated_episode;
      // More reliable: check if previous cumulative exists but place was null
      const wasAlreadyEliminated = dbSurvivor.eliminated_episode !== null && dbSurvivor.eliminated_episode < episode;

      if (fsg.place !== null && !wasAlreadyEliminated) {
        votedOutBonus = 24 - fsg.place + 1;
      }

      scoreRows.push({
        season_id: seasonId,
        survivor_id: dbSurvivor.id,
        episode,
        fsg_points: Math.max(0, episodePoints),
        fsg_cumulative: fsg.survPts,
        voted_out_bonus: votedOutBonus,
        manual_adjustment: 0,
        final_points: Math.max(0, episodePoints) + votedOutBonus,
        scored_actions: {
          surv_pts_cumulative: fsg.survPts,
          surv_pts_this_episode: episodePoints,
          rew_wins: fsg.rewWins,
          imm_wins: fsg.immWins,
          place: fsg.place,
          voted_out_count: fsg.votedOut,
        },
      });

      // Track new eliminations
      if (fsg.place !== null && !wasAlreadyEliminated) {
        eliminationUpdates.push({
          id: dbSurvivor.id,
          name: dbSurvivor.name,
          is_active: false,
          eliminated_episode: episode,
          elimination_order: 24 - fsg.place + 1,
          place: fsg.place,
        });
      }
    }

    // 5. Upsert scores
    const { error: upsertError } = await supabase
      .from('survivor_scores')
      .upsert(scoreRows, { onConflict: 'season_id,survivor_id,episode' });

    if (upsertError) {
      return NextResponse.json(
        { error: `Failed to save scores: ${upsertError.message}` },
        { status: 500 }
      );
    }

    // 6. Update elimination statuses
    for (const elim of eliminationUpdates) {
      await supabase
        .from('survivors')
        .update({
          is_active: false,
          eliminated_episode: elim.eliminated_episode,
          elimination_order: elim.elimination_order,
        })
        .eq('id', elim.id);
    }

    return NextResponse.json({
      success: true,
      episode,
      survivorsScored: scoreRows.length,
      eliminations: eliminationUpdates.map(e => ({ name: e.name, place: e.place, bonus: 24 - e.place + 1 })),
      scores: scoreRows.map(s => ({
        survivorId: s.survivor_id,
        episodePoints: s.fsg_points,
        cumulative: s.fsg_cumulative,
        votedOutBonus: s.voted_out_bonus,
        finalPoints: s.final_points,
      })),
    });

  } catch (error: any) {
    console.error('FSG scrape error:', error);
    return NextResponse.json({ error: `Scrape failed: ${error.message}` }, { status: 500 });
  }
}