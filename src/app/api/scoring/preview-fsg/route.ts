// =============================================================================
// app/api/scoring/preview-fsg/route.ts
// =============================================================================
// API route: GET /api/scoring/preview-fsg?episode=2
//
// Debug/preview endpoint — fetches and parses FSG data but does NOT write
// to the database. Use this to verify the parser is working before committing.
//
// Query params:
//   ?episode=N   — optional; filter to specific episode
//   ?source=season|recap|both  — which page to parse (default: both)
// =============================================================================

import { NextResponse } from 'next/server';
import {
  fetchFSGSeasonPage,
  fetchFSGRecapPage,
  parseSeasonScores,
  parseEpisodeRecap,
  calculateEpisodeScores,
} from '@/lib/fsg-parser';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const episodeFilter = searchParams.get('episode');
    const source = searchParams.get('source') || 'both';

    const result: any = {
      success: true,
      fetchedAt: new Date().toISOString(),
    };

    // Fetch season scores page
    if (source === 'season' || source === 'both') {
      const seasonHtml = await fetchFSGSeasonPage(50);
      const seasonScores = parseSeasonScores(seasonHtml);
      result.seasonScores = {
        count: seasonScores.length,
        survivors: seasonScores.map((s) => ({
          name: s.firstName,
          fullName: s.name,
          tribe: s.tribe,
          fsgId: s.fsgId,
          survPts: s.survPts,
          outPts: s.outPts,
          totalPts: s.totalPts,
          place: s.place,
          eliminated: s.isEliminated,
        })),
      };
      result.htmlPreview = {
        seasonPageLength: seasonHtml.length,
        firstChars: seasonHtml.substring(0, 200),
      };
    }

    // Fetch episode recap page
    if (source === 'recap' || source === 'both') {
      const recapHtml = await fetchFSGRecapPage(50);
      const episodes = parseEpisodeRecap(recapHtml);
      const scores = calculateEpisodeScores(episodes);

      let filteredScores = scores;
      if (episodeFilter) {
        const epNum = parseInt(episodeFilter, 10);
        filteredScores = scores.filter((s) => s.episode === epNum);
      }

      result.episodeRecap = {
        totalEpisodes: episodes.length,
        episodeNumbers: episodes.map((e) => e.episodeNumber),
        episodes: episodes.map((ep) => ({
          episode: ep.episodeNumber,
          votedOut: ep.votedOut,
          quitEvac: ep.quitEvac,
          actionCount: ep.actions.length,
          actions: ep.actions.map((a) => ({
            action: a.actionName,
            points: a.pointValue,
            survivorCount: a.survivors.length,
            survivors: a.survivors,
          })),
        })),
      };

      result.calculatedScores = {
        totalEntries: filteredScores.length,
        scores: filteredScores
          .sort((a, b) => b.fsgPoints - a.fsgPoints)
          .map((s) => ({
            survivor: s.survivorName,
            episode: s.episode,
            points: s.fsgPoints,
            actions: s.scoredActions,
          })),
      };

      result.htmlPreview = {
        ...result.htmlPreview,
        recapPageLength: recapHtml.length,
      };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[FSG Preview] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
