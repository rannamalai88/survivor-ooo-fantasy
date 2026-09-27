// src/app/api/scoring/override/route.ts
// Commissioner fixes. Actions: adjust_survivor_score, idol_penalty,
// set_net_answer (Title answer), update_pool_status. Scores themselves are
// never overridden here — fix the input and re-run Calculate.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const body = await request.json();
    const { action, seasonId } = body;

    if (!action || !seasonId) {
      return NextResponse.json({ error: 'Missing action or seasonId' }, { status: 400 });
    }

    switch (action) {
      // --- Adjust a survivor's score for a specific episode ---
      case 'adjust_survivor_score': {
        const { survivorId, episode, adjustment, reason } = body;
        const { error } = await supabase
          .from('survivor_scores')
          .update({ 
            manual_adjustment: adjustment,
            final_points: undefined, // Will be recalculated
          })
          .eq('season_id', seasonId)
          .eq('survivor_id', survivorId)
          .eq('episode', episode);

        // Recalculate final_points
        const { data: score } = await supabase
          .from('survivor_scores')
          .select('fsg_points, manual_adjustment, voted_out_bonus')
          .eq('season_id', seasonId)
          .eq('survivor_id', survivorId)
          .eq('episode', episode)
          .single();

        if (score) {
          await supabase
            .from('survivor_scores')
            .update({ final_points: (score.fsg_points || 0) + (score.manual_adjustment || 0) + (score.voted_out_bonus || 0) })
            .eq('season_id', seasonId)
            .eq('survivor_id', survivorId)
            .eq('episode', episode);
        }

        // Log it
        await supabase.from('activity_log').insert({
          season_id: seasonId,
          type: 'admin',
          message: `Score adjustment: survivor ${survivorId} ep ${episode}: ${adjustment > 0 ? '+' : ''}${adjustment} (${reason || 'manual'})`,
          metadata: { survivorId, episode, adjustment, reason },
        });

        return NextResponse.json({ success: true, message: `Adjustment of ${adjustment} applied` });
      }

      case 'idol_penalty': {
        const { survivorId, episode } = body;
        // Add -5 to the survivor's manual_adjustment
        const { data: current } = await supabase
          .from('survivor_scores')
          .select('manual_adjustment')
          .eq('season_id', seasonId)
          .eq('survivor_id', survivorId)
          .eq('episode', episode)
          .single();

        const newAdj = (current?.manual_adjustment || 0) - 5;
        await supabase
          .from('survivor_scores')
          .update({ manual_adjustment: newAdj })
          .eq('season_id', seasonId)
          .eq('survivor_id', survivorId)
          .eq('episode', episode);

        await supabase.from('activity_log').insert({
          season_id: seasonId,
          type: 'admin',
          message: `Idol-in-pocket penalty: -5 applied to survivor ${survivorId} ep ${episode}`,
          metadata: { survivorId, episode, penalty: -5 },
        });

        return NextResponse.json({ success: true, message: 'Idol penalty (-5) applied' });
      }

      // --- Set NET answer for an episode ---
      case 'set_net_answer': {
        const { episode, correctSurvivorId, episodeTitle } = body;
        await supabase.from('net_answers').upsert({
          season_id: seasonId,
          episode,
          correct_survivor_id: correctSurvivorId,
          episode_title: episodeTitle || null,
        }, { onConflict: 'season_id,episode' });

        await supabase.from('activity_log').insert({
          season_id: seasonId,
          type: 'admin',
          message: `NET answer set for ep ${episode}: ${correctSurvivorId}`,
          metadata: { episode, correctSurvivorId, episodeTitle },
        });

        return NextResponse.json({ success: true });
      }

      // --- Update pool status ---
      case 'update_pool_status': {
        const { managerId, status, drownedEpisode } = body;
        const updates: any = { status };
        if (status === 'drowned' && drownedEpisode) {
          updates.drowned_episode = drownedEpisode;
        }

        await supabase
          .from('pool_status')
          .update(updates)
          .eq('season_id', seasonId)
          .eq('manager_id', managerId);

        await supabase.from('activity_log').insert({
          season_id: seasonId,
          type: 'pool',
          message: `Pool status: ${managerId} → ${status}`,
          manager_id: managerId,
          metadata: { status, drownedEpisode },
        });

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Override error:', error);
    return NextResponse.json({ error: `Override failed: ${error.message}` }, { status: 500 });
  }
}