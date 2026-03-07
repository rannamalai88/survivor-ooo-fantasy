// src/app/api/scoring/preview-fsg/route.ts
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

    if (source === 'season' || source === 'both') {
      const seasonHtml = await fetchFSGSeasonPage(50);
      const seasonScores = parseSeasonScores(seasonHtml);
      result.seasonScores = {
        count: seasonScores.length,
        survivors: seasonScores.map((s) => ({
          name: s.firstName,
          fullName: s.name,
          tribe: s.tribe,
          survPts: s.survPts,
          outPts: s.outPts,
          totalPts: s.totalPts,
          place: s.place,
          eliminated: s.isEliminated,
        })),
      };

      // Dump raw TR rows that contain survivor links
      const trMatches = seasonHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      const survivorRows = trMatches.filter(r => r.includes('/survivors/'));
      
      result.debug = {
        seasonPageLength: seasonHtml.length,
        totalTrTags: trMatches.length,
        survivorRowCount: survivorRows.length,
        firstSurvivorRow: survivorRows[0]?.substring(0, 800) || 'NONE FOUND',
        secondSurvivorRow: survivorRows[1]?.substring(0, 800) || 'NONE FOUND',
        lastSurvivorRow: survivorRows[survivorRows.length - 1]?.substring(0, 800) || 'NONE FOUND',
      };
    }

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

      // Dump raw dt/dd elements
      const dtMatches = recapHtml.match(/<dt[^>]*>[\s\S]*?<\/dt>/gi) || [];
      const ddMatches = recapHtml.match(/<dd[^>]*>[\s\S]*?<\/dd>/gi) || [];
      
      result.recapDebug = {
        recapPageLength: recapHtml.length,
        dtCount: dtMatches.length,
        ddCount: ddMatches.length,
        firstDt: dtMatches[0]?.substring(0, 300) || 'NONE',
        firstDd: ddMatches[0]?.substring(0, 500) || 'NONE',
        secondDt: dtMatches[1]?.substring(0, 300) || 'NONE',
        firstSurvivorLinkContext: (() => {
          const idx = recapHtml.indexOf('/survivors/');
          return idx >= 0 ? recapHtml.substring(Math.max(0, idx - 100), idx + 200) : 'NOT FOUND';
        })(),
      };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[FSG Preview] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
