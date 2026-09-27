// =============================================================================
// lib/pool.ts — the canonical Survivor Pool walk (pure function)
// =============================================================================
// Used by the calculate route (writes pool_status) and the Pool page (display),
// so both always agree.
//
// Rules (unchanged from S50 except where noted):
//   - The walk starts at E2 every time and replays the full picks history.
//     It is idempotent; weeks_survived caps at episode − 1.
//   - Active + pool pick survives the episode → weeks_survived + 1.
//   - Active + pool pick eliminated → Drowned.
//   - Active + NO pool pick → Drowned ("No pick submitted = auto-eliminated").
//     [S51 fix: the S50 walk skipped missing picks, silently undoing the
//     Advance button's auto-drown on the next calculate.]
//   - Drowned + backdoor pick eliminated that episode → Active again, WITHOUT
//     incrementing weeks_survived.
//   - Dynasty Immunity Idol [S51: now automated]: the holder's first eliminated
//     pool pick while Active does not drown them. They stay Active, the week
//     counts as survived, and the idol is used up. It does not cover a
//     missing pick. Derived on every walk, so re-running is safe.
// =============================================================================

export type PoolWeekType = 'safe' | 'idol' | 'drowned' | 'missed' | 'backdoor_hit' | 'backdoor_miss' | 'none';

export interface PoolWeek { episode: number; type: PoolWeekType; survivorId: string | null }

export interface PoolWalkResult {
  status: 'active' | 'drowned';
  weeksSurvived: number;
  drownedEpisode: number | null;
  idolUsed: boolean;
  idolEpisode: number | null;
  weeks: PoolWeek[];
}

export interface PoolSurvivor { id: string; is_active: boolean; eliminated_episode: number | null }
export interface PoolPick { pool_pick_id: string | null; pool_backdoor_id: string | null }

export const POOL_FIRST_EPISODE = 2;

export function walkPool(
  picksByEpisode: Record<number, PoolPick | undefined>,
  survivors: Map<string, PoolSurvivor>,
  hasIdol: boolean,
  throughEpisode: number,
): PoolWalkResult {
  let status: 'active' | 'drowned' = 'active';
  let weeksSurvived = 0;
  let drownedEpisode: number | null = null;
  let idolUsed = false;
  let idolEpisode: number | null = null;
  const weeks: PoolWeek[] = [];

  for (let ep = POOL_FIRST_EPISODE; ep <= throughEpisode; ep++) {
    const pick = picksByEpisode[ep];

    if (status === 'active') {
      if (!pick?.pool_pick_id) {
        status = 'drowned';
        drownedEpisode = ep;
        weeks.push({ episode: ep, type: 'missed', survivorId: null });
        continue;
      }
      const s = survivors.get(pick.pool_pick_id);
      const eliminatedThisEpOrEarlier = !!s && !s.is_active && s.eliminated_episode !== null && s.eliminated_episode <= ep;
      if (!eliminatedThisEpOrEarlier) {
        weeksSurvived += 1;
        weeks.push({ episode: ep, type: 'safe', survivorId: pick.pool_pick_id });
      } else if (hasIdol && !idolUsed) {
        idolUsed = true;
        idolEpisode = ep;
        weeksSurvived += 1;
        weeks.push({ episode: ep, type: 'idol', survivorId: pick.pool_pick_id });
      } else {
        status = 'drowned';
        drownedEpisode = ep;
        weeks.push({ episode: ep, type: 'drowned', survivorId: pick.pool_pick_id });
      }
    } else if (pick?.pool_backdoor_id) {
      const s = survivors.get(pick.pool_backdoor_id);
      const guessedCorrectly = !!s && !s.is_active && s.eliminated_episode === ep;
      if (guessedCorrectly) { status = 'active'; drownedEpisode = null; }
      weeks.push({ episode: ep, type: guessedCorrectly ? 'backdoor_hit' : 'backdoor_miss', survivorId: pick.pool_backdoor_id });
    } else {
      weeks.push({ episode: ep, type: 'none', survivorId: null });
    }
  }

  return { status, weeksSurvived, drownedEpisode, idolUsed, idolEpisode, weeks };
}
