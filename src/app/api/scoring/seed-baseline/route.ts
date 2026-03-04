// src/app/api/scoring/seed-baseline/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseFSGPage } from '@/lib/scoring';

const FSG_URL = 'https://www.fantasysurvivorgame.com/survivors/season/50';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
    const { seasonId } = await request.json();

    if (!seasonId) {
      return NextResponse.json({ error: 'Missing seasonId' }, { status: 400 });
    }

    // Fetch current FSG data (this IS the Episode 1 cumulative baseline)
    const fsgResponse = await fetch(FSG_URL, { cache: 'no-store' });
    const fsgText = await fsgResponse.text();
    const fsgData = parseFSGPage(fsgText);

    if (fsgData.length === 0) {
 // Return a snippet of what we got so we can debug the parser
      return NextResponse.json(
        { 
          error: 'Failed to parse FSG data',
          debug: fsgText.substring(0, 2000),
          textLength: fsgText.length,
        },
        { status: 500 }
      );
    }

    // Get DB survivors
    const { data: dbSurvivors } = await supabase
      .from('survivors')
      .select('id, name, full_name')
      .eq('season_id', seasonId);

    if (!dbSurvivors) {
      return NextResponse.json({ error: 'No survivors found' }, { status: 500 });
    }

    const nameToId: Record<string, string> = {};
    for (const s of dbSurvivors) {
      nameToId[s.full_name] = s.id;
      nameToId[s.name] = s.id;
      if (s.name.startsWith('"')) nameToId[s.name.replace(/"/g, '')] = s.id;
    }

    // Create Episode 1 rows with FSG cumulative data
    // Episode points for ep 1 = the full cumulative (since there's no ep 0)
    const rows: any[] = [];
    for (const fsg of fsgData) {
      const survivorId = nameToId[fsg.fullName] || nameToId[fsg.name];
      if (!survivorId) continue;

      // For episode 1 baseline: the episode points ARE the cumulative
      // Voted out bonus for ep 1 eliminations
      let votedOutBonus = 0;
      if (fsg.place !== null) {
        votedOutBonus = 24 - fsg.place + 1;
      }

      rows.push({
        season_id: seasonId,
        survivor_id: survivorId,
        episode: 1,
        fsg_points: fsg.survPts,
        fsg_cumulative: fsg.survPts,
        voted_out_bonus: votedOutBonus,
        manual_adjustment: 0,
        final_points: fsg.survPts + votedOutBonus,
        scored_actions: {
          surv_pts_cumulative: fsg.survPts,
          surv_pts_this_episode: fsg.survPts,
          rew_wins: fsg.rewWins,
          imm_wins: fsg.immWins,
          place: fsg.place,
          baseline_seed: true,
        },
      });
    }

    const { error } = await supabase
      .from('survivor_scores')
      .upsert(rows, { onConflict: 'season_id,survivor_id,episode' });

    if (error) {
      return NextResponse.json({ error: `Failed to seed: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Seeded Episode 1 baseline for ${rows.length} survivors`,
      survivors: rows.map(r => ({
        survivorId: r.survivor_id,
        cumulative: r.fsg_cumulative,
        votedOutBonus: r.voted_out_bonus,
      })),
    });

  } catch (error: any) {
    return NextResponse.json({ error: `Seed failed: ${error.message}` }, { status: 500 });
  }
}