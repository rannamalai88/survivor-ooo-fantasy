// src/app/api/scoring/scrape-fsg/route.ts
// ============================================================
// Fetches scores from FantasySurvivorGame.com, parses them,
// and upserts into survivor_scores table.
//
// Called by admin panel "Pull Scores from FSG" button.
// POST body: { episode: number, seasonId: string }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  fetchFSGSeasonPage,
  fetchFSGRecapPage,
  parseSeasonScores,
  parseEpisodeRecap,
  calculateEpisodeScores,
} from '@/lib/fsg-parser';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { episode, seasonId } = await request.json();

    if (!episode || !seasonId) {
      return NextResponse.json(
        { error: 'Missing episode or seasonId' },
        { status: 400 }
      );
    }

    // ----------------------------------------------------------------
    // 1. Fetch and parse BOTH FSG pages
    // ----------------------------------------------------------------
    const [seasonHtml, recapHtml] = await Promise.all([
      fetchFSGSeasonPage(50),
      fetchFSGRecapPage(50),
    ]);

    const seasonScores = parseSeasonScores(seasonHtml);
    const episodeRecap = parseEpisodeRecap(recapHtml);
    const allEpisodeScores = calculateEpisodeScores(episodeRecap);

    // Filter to the requested episode
    const thisEpScores = allEpisodeScores.filter(
      (s) => s.episode === episode
    );

    if (seasonScores.length === 0) {
      return NextResponse.json(
        {
          error:
            'Failed to parse FSG data — 0 survivors found. The page format may have changed.',
          debug: {
            seasonHtmlLength: seasonHtml.length,
            recapHtmlLength: recapHtml.length,
          },
        },
        { status: 500 }
      );
    }

    // Check if the requested episode exists in the recap
    const epExists = episodeRecap.find((e) => e.episodeNumber === episode);
    if (!epExists) {
      return NextResponse.json({
        success: false,
        error: `Episode ${episode} not found in FSG recap. FSG may not have updated yet.`,
        availableEpisodes: episodeRecap.map((e) => e.episodeNumber),
      });
    }

    // ----------------------------------------------------------------
    // 2. Get our survivors from DB for name → UUID mapping
    // ----------------------------------------------------------------
    const { data: dbSurvivors } = await supabase
      .from('survivors')
      .select(
        'id, name, full_name, cast_id, is_active, eliminated_episode, elimination_order'
      )
      .eq('season_id', seasonId);

    if (!dbSurvivors || dbSurvivors.length === 0) {
      return NextResponse.json(
        { error: 'No survivors found in database for this season' },
        { status: 500 }
      );
    }

    // Build name lookup: FSG name → DB survivor
    // FSG episode recap uses first names like "Tiffany", "Coach", "Q"
    const nameToSurvivor: Record<string, (typeof dbSurvivors)[0]> = {};
    for (const s of dbSurvivors) {
      nameToSurvivor[s.full_name] = s;
      nameToSurvivor[s.name] = s;
      // Handle quoted names: DB might have "Q" or Q
      if (s.name.startsWith('"')) {
        nameToSurvivor[s.name.replace(/"/g, '')] = s;
      }
      // Also add lowercase variants
      nameToSurvivor[s.name.toLowerCase()] = s;
    }

    // Helper to find a DB survivor from an FSG name
    function findSurvivor(fsgName: string) {
      const clean = fsgName.replace(/^"|"$/g, '');
      return (
        nameToSurvivor[fsgName] ||
        nameToSurvivor[clean] ||
        nameToSurvivor[clean.toLowerCase()] ||
        nameToSurvivor[fsgName.toLowerCase()] ||
        // Try partial match as last resort
        dbSurvivors!.find(
          (s) =>
            s.name.toLowerCase() === clean.toLowerCase() ||
            s.full_name.toLowerCase().includes(clean.toLowerCase())
        )
      );
    }

    // ----------------------------------------------------------------
    // 3. Build score rows from episode recap data
    // ----------------------------------------------------------------
    const scoreRows: any[] = [];
    const warnings: string[] = [];

    // Build a map of episode scores: survivorName → score data
    const epScoreMap: Record<
      string,
      { fsgPoints: number; scoredActions: any[] }
    > = {};
    for (const score of thisEpScores) {
      epScoreMap[score.survivorName] = {
        fsgPoints: score.fsgPoints,
        scoredActions: score.scoredActions,
      };
    }

    // Also get cumulative totals from the season page for the fsg_cumulative column
    const cumulativeMap: Record<string, number> = {};
    for (const ss of seasonScores) {
      cumulativeMap[ss.firstName] = ss.survPts;
    }

    // Process every DB survivor (not just those who scored this episode)
    // Survivors who didn't score get 0 points for the episode
    for (const dbSurvivor of dbSurvivors) {
      const epData = epScoreMap[dbSurvivor.name] ||
        epScoreMap[`"${dbSurvivor.name}"`] ||
        null;

      const fsgPoints = epData?.fsgPoints ?? 0;
      const cumulative =
        cumulativeMap[dbSurvivor.name] ??
        cumulativeMap[dbSurvivor.name.replace(/"/g, '')] ??
        0;

      scoreRows.push({
        season_id: seasonId,
        survivor_id: dbSurvivor.id,
        episode,
        fsg_points: fsgPoints,
        fsg_cumulative: cumulative,
        manual_adjustment: 0,
        final_points: fsgPoints,
        scored_actions: epData
          ? {
              actions: epData.scoredActions,
              source: 'fsg_auto',
              pulled_at: new Date().toISOString(),
            }
          : { actions: [], source: 'fsg_auto', no_actions: true },
      });
    }

    // Check for FSG names we couldn't match
    for (const score of thisEpScores) {
      const matched = findSurvivor(score.survivorName);
      if (!matched) {
        warnings.push(
          `Could not match FSG name "${score.survivorName}" to database`
        );
      }
    }

    // ----------------------------------------------------------------
    // 4. Preserve existing manual adjustments
    // ----------------------------------------------------------------
    const { data: existingScores } = await supabase
      .from('survivor_scores')
      .select('survivor_id, manual_adjustment')
      .eq('season_id', seasonId)
      .eq('episode', episode);

    if (existingScores) {
      const adjMap: Record<string, number> = {};
      for (const es of existingScores) {
        adjMap[es.survivor_id] = es.manual_adjustment || 0;
      }
      for (const row of scoreRows) {
        const existingAdj = adjMap[row.survivor_id] || 0;
        row.manual_adjustment = existingAdj;
        row.final_points = row.fsg_points + existingAdj;
      }
    }

    // ----------------------------------------------------------------
    // 5. Upsert scores
    // ----------------------------------------------------------------
    const { error: upsertError } = await supabase
      .from('survivor_scores')
      .upsert(scoreRows, { onConflict: 'season_id,survivor_id,episode' });

    if (upsertError) {
      return NextResponse.json(
        { error: `Failed to save scores: ${upsertError.message}` },
        { status: 500 }
      );
    }

    // ----------------------------------------------------------------
    // 6. Update elimination statuses from season page
    // ----------------------------------------------------------------
    const eliminationUpdates: any[] = [];

    for (const fsg of seasonScores) {
      if (fsg.place === null) continue; // Still in the game

      const dbSurvivor = findSurvivor(fsg.firstName);
      if (!dbSurvivor) continue;

      // Only update if DB still thinks they're active
      const wasAlreadyEliminated =
        dbSurvivor.eliminated_episode !== null &&
        dbSurvivor.eliminated_episode !== undefined;

      if (!wasAlreadyEliminated) {
        const eliminationOrder = 24 - fsg.place + 1;

        await supabase
          .from('survivors')
          .update({
            is_active: false,
            eliminated_episode: episode,
            elimination_order: eliminationOrder,
          })
          .eq('id', dbSurvivor.id);

        eliminationUpdates.push({
          name: dbSurvivor.name,
          place: fsg.place,
          bonus: eliminationOrder,
        });
      }
    }

    // ----------------------------------------------------------------
    // 7. Return results
    // ----------------------------------------------------------------
    // Only include survivors who actually scored for the response summary
    const scoredSurvivors = scoreRows
      .filter((s) => s.fsg_points > 0)
      .map((s) => {
        const surv = dbSurvivors.find((d) => d.id === s.survivor_id);
        return {
          name: surv?.name || 'Unknown',
          episodePoints: s.fsg_points,
          cumulative: s.fsg_cumulative,
          finalPoints: s.final_points,
          actions: s.scored_actions?.actions || [],
        };
      })
      .sort((a, b) => b.episodePoints - a.episodePoints);

    return NextResponse.json({
      success: true,
      episode,
      survivorsScored: scoreRows.length,
      survivorsWithPoints: scoredSurvivors.length,
      eliminations: eliminationUpdates,
      scores: scoredSurvivors,
      availableEpisodes: episodeRecap.map((e) => e.episodeNumber),
      warnings,
    });
  } catch (error: any) {
    console.error('FSG scrape error:', error);
    return NextResponse.json(
      { error: `Scrape failed: ${error.message}` },
      { status: 500 }
    );
  }
}
