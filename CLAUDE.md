# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview

A private fantasy league app for a 12-manager "Survivor OOO" group (6 couples), running alongside CBS's Survivor. Next.js 14 App Router + TypeScript + Tailwind, with Supabase (Postgres + realtime) as the only backend. Deployed on Vercel via `git push` to `main` (production: https://survivor-ooo-fantasy.vercel.app).

**Season 51 is live.** `S51_TECHNICAL_SPEC_v2.md` is the implementation contract; read it before changing scoring, the parser, or the pick card. S50 rows stay in the database and must remain readable, but nothing S50-specific is written any more.

## Commands

```bash
npm run dev     # local dev server (http://localhost:3000)
npm run build   # production build — also the ONLY type check
npm run lint    # next lint (not configured; prompts interactively)
```

There is no test suite. `npm run build` is the type check. **Don't run `npm run build` while `npm run dev` is running** — both write `.next/` and the dev server breaks. `npx tsc --noEmit -p .` type-checks without touching `.next/`.

The parser and scoring rules have a regression self-test: `GET /api/scoring/preview-fsg?selftest=1` (also a button on the admin Tools tab). It re-reads FSG live and asserts the spec §8 Episode 1 results plus unit checks on the rules. Run it after touching `fsg-parser.ts` or `scoring.ts`.

Required env vars (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SEASON_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `COMMISSIONER_PIN`.

`COMMISSIONER_PIN` is server-only (no `NEXT_PUBLIC_` prefix) and is checked by `POST /api/auth/commissioner`; never inline it in client code. `NEXT_PUBLIC_*` values are baked in at build time, so changing one in Vercel needs a redeploy.

## Working conventions

These are not optional; they exist because violating them has cost real debugging time.

1. **Schema before code.** Always write and run the migration SQL in the Supabase SQL editor *before* pushing the TypeScript that depends on it. Pushing first means a live 500 on Vercel.
2. **Verify-before / verify-after on every destructive or mutating SQL.** Emit a `SELECT` that shows current state, then the mutation, then a `SELECT` that confirms it. Run them as separate statements so the user can read the output between each.
3. **Never commit secrets.** No API keys, service-role keys, or commissioner PINs in tracked files. If a credential appears in conversation, tell the user to rotate it immediately and do not use it.
4. **The live database is the source of truth.** `supabase/migrations/001_initial_schema.sql` is stale. Read the live schema before assuming a column exists.
5. **Full file replacements over patches** when the change is substantial. The user reviews whole files.
6. **Re-running an episode is the normal fix.** `scrape-fsg` and `calculate` are idempotent by design. When a score looks wrong, fix the input (FSG pull, manual adjustment, title answer) and re-run the episode rather than hand-editing derived rows.

## Architecture

**Two Supabase access paths.**
- Pages are all client components (`'use client'`), querying Supabase directly through the anon-key client in `src/lib/supabase/client.ts`.
- API routes under `src/app/api/scoring/*` use the service-role client from `src/lib/supabase/server.ts`. All scoring writes go through these routes, called only from the commissioner page (`src/app/admin/page.tsx`).

**Auth is name-only, not real auth.** `AuthContext` loads the `managers` rows for `NEXT_PUBLIC_SEASON_ID` (managers are season-scoped and names repeat across seasons — never load them unfiltered); "login" picks a name and saves it to localStorage (`survivor-ooo-manager`). `AuthGuard requireAdmin` gates on `managers.is_commissioner`. RLS is fully permissive, so the anon client can write anything. This is a deliberate tradeoff for a 12-person private league — do not spend effort hardening it unless asked.

**The game.** No draft, rosters, keepers or captains. Every episode each manager fills a 5-slot card (`/picks`): Reward, Immunity, Going Home, Most Other Points, Title. The card total decides a Head-to-Head fixture (`fixtures`, keyed by round; `episodes.h2h_round` maps episode → round). The Pool runs alongside, unchanged from S50. Picks lock at `episodes.lock_at` — always read it from the table, never compute it from a weekday.

**Weekly commissioner flow** (`/admin`):

1. **Pull from FSG** → `scrape-fsg { episode, seasonId }`: parses the recap by FSG id, writes `episode_events`, `episode_outcomes`, `survivor_scores` (continuity, manual adjustments preserved), survivor eliminations (the Pool walk reads `is_active`/`eliminated_episode`), tribe changes, `episodes.status = aired`. Refuses to write on parser errors or unmapped FSG ids; returns warnings for unknown actions and cross-check mismatches.
2. **Title answer** → `override { action: 'set_net_answer' }` writes `net_answers` (Jeff selectable).
3. **Adjustments** → `survivor_scores.manual_adjustment` (never multiplied).
4. **Preview / Calculate** → `calculate { episode, seasonId, dryRun? }`: scores every card into `score_lines` (plain-English `reason` per line), `manager_scores`, fixtures into `h2h_results`, rebuilds `pool_status`, recomputes `manager_totals` (standings + championship points), `episodes.status = scored`. `dryRun` writes nothing. Rejects episodes with no H2H round that aren't the finale (E1 is parsed, never scored).
5. **Advance** → bumps `seasons.current_episode`. Auto-drowns active Pool managers with no pool pick for the episode just finished (only from E2 on), after a confirm dialog listing them.

**Pages:** `/` home, `/picks`, `/reveals` (cards appear after lock), `/leaderboard` (Standings), `/breakdown/[managerId]/[episode]` (linked from every score), `/my-team` (My Season), `/scoreboard` (Survivor points), `/pool`, `/chips`, `/rules`, `/dynasty`, `/admin`. `/draft` and `/net` are retired notice pages. Shared standings loader: `src/lib/standings.ts`.

## Scoring invariants

`src/lib/scoring.ts` holds the rules as pure functions; its doc comments are the spec (mirrors spec §4). All numbers live in `src/lib/constants.ts` — `CAST_SIZE`, `PENALTY`, `PLACEMENT_CURVE`, etc. Reference them; never inline `21`, `51`, or point values. The rules page reads the same constants.

- **Slot:** `base × (hit ? 2 : 1) + bonus + penalty`. Going Home hit +5. Penalty when a non-Going-Home pick leaves: Immunity −5, Reward −3, MOP −3, uncapped. Card totals may be negative.
- **No-event rule:** no reward challenge → Reward slot scores base only, no double, no penalty. Applied the same way to Immunity (no immunity challenge) and MOP (nobody scored Other points).
- **`manual_adjustment` is never multiplied** — it is its own `adjustment` score line.
- **MOP ties pay everyone.** Going Home pays on any departure (voted out, quit/evac, out of game).
- **Chip order:** Hedge → slot scoring → Triple Down → fixture → Double Fixture / Point Shield. E2–E12 only, one per episode, one use each per season (DB unique index + checked again at scoring time).
- **H2H:** 3/1/0. Double Fixture doubles only the player's own points; Point Shield turns that player's loss into a draw. Standings tiebreak = cumulative raw card points.
- **Championship:** rank each game (Fantasy = H2H points then card points; Pool = weeks survived; Quinfecta = finale only), map to `PLACEMENT_CURVE`, × `WEIGHTS`; ties split pooled curve points.
- **Quinfecta:** per place exact +5, one off +2, all five exact +10. Uses FSG place numbering (1 = winner).
- **`elimination_order` is inverted relative to FSG `Place`:** `elimination_order = CAST_SIZE + 1 − place` (`eliminationOrderFromPlace`). Getting this backwards silently inverts the quinfecta.
- **Pool recomputation is idempotent.** One walk in `src/lib/pool.ts` (`walkPool`) is used by both `calculate` and the Pool page. It starts at E2 every time and replays the full picks history; `weeks_survived` caps at `episode − 1`. A missed pool pick while active drowns (matches the rule; S50's walk skipped it). Backdoor reactivation does not increment. **Dynasty Idol:** the `has_immunity_idol` holder's first eliminated pick while active doesn't drown them — the week counts, `idol_used` becomes true; it doesn't cover a missed pick. `burnt` managers are skipped.

## FSG parser

Source: `https://www.fantasysurvivorgame.com`, public server-rendered HTML (no login, no FSG group). `src/lib/fsg-parser.ts` is pure (HTML in, data out); `src/lib/fsg-load.ts` fetches both pages and maps FSG ids to `survivors.fsg_id`; `src/lib/fsg-checks.ts` cross-checks.

- Recap: `/episode-recap/season/{N}` — episodes are `<h5 id="episodeN">`; summary boxes `<h6 class="mb-0">Immunity</h6><div>Savu</div>`; actions are `<dt>` with `<span class="points">(N)</span>` and a `<dd>` of survivor links; departures are `<dt>` `Voted out` / `Quit/Evac` / `Out of game` with a place `(21st place)`; finale has `Sole survivor`.
- Stats: `/survivors/season/{N}` — last 7 cells: Surv Pts (cumulative), Out Pts (**ignored**), Total, Rew Wins, Imm Wins, Voted Out, Place.

Rules:
- **Identify survivors by the numeric id in `href="/survivors/536-Aaliyah"`. Never match on names.**
- **Only four strings are challenge wins** (`CHALLENGE_WHITELIST`). Never substring-match "immunity"/"reward" — "Gain an Immunity Idol" is Other.
- Point values are read from the page, never assumed (FSG re-tunes them between seasons).
- Unknown actions are scored as Other and surfaced as warnings in the admin panel. Unparseable lines and unmapped ids **block** the write.
- Cross-checks: summary headers vs itemized list, and each survivor's summed recap points vs cumulative Surv Pts.

## Database

Run migrations by hand in the Supabase SQL editor. There is no migration tooling. The checked-in `001` schema is stale; S51 tables and columns are in `002`–`005`. S51 derived tables: `episode_events`, `episode_outcomes`, `score_lines`, `h2h_results`; scoring columns on `manager_scores` / `manager_totals`. Retired S50 columns (captain, swaps, `chip_played`, `net_pick_id`, `grand_total`, …) are kept for history and not written, except `fantasy_points`, `grand_total` and `pool_score`, which `calculate` still fills for continuity.

`survivors.tribe` has a CHECK constraint (`Vatu, Kalo, Cila, Savu, Toka, Merge, Host`). If FSG names the merged tribe something else, scrape warns; extend the constraint, then re-pull.

When changing the schema, write the SQL for the user to run **and** add it as a new numbered migration file so the repo catches up over time.

**Dynasty**: `dynasty_rankings` is a *view* backed by a `dynasty` table with columns `manager_name`, `season_number`, `final_rank`. The view aliases these to `manager_id`, `season_label` (e.g. `'S50'`), and `rank`.

Next.js `images.remotePatterns` allows survivor photos from `www.fantasysurvivorgame.com/images/**`.

## S51 facts

Season 51 — "The Open Era." `seasons.id` `550e8400-e29b-41d4-a716-446655440051`. 13 episodes (dates in `episodes`; correct the table, not the code, if CBS shifts the schedule). 21 castaways, FSG ids 536–556, plus Jeff (`cast_id` 99, `is_playable = false`, Title slot only). Tribes Savu / Toka; merge colour unknown until it airs. E7 = Couples Week (round 6), E12 = Rivalry Week (round 11). Alli holds the Dynasty Idol.

## Open items

- **Quinfecta entry** isn't on the pick card yet (needed for E13; writes `quinfecta_predictions.place_1_id…place_5_id`).
- **Theming** (spec §7 tokens, light/dark mode) not started.

The Pool game received uniformly positive feedback, including the backdoor mechanic. **Do not change the Pool.**
