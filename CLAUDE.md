# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview

A private fantasy league app for a 12-manager "Survivor OOO" group (6 couples), running alongside CBS's Survivor. Next.js 14 App Router + TypeScript + Tailwind, with Supabase (Postgres + realtime) as the only backend. Deployed on Vercel via `git push` to `main`.

**Currently migrating from Season 50 → Season 51.** See the S51 Migration section below; it is the active workstream and takes precedence over anything else in this file that still describes S50 behavior.

## Commands

```bash
npm run dev     # local dev server (http://localhost:3000)
npm run build   # production build — also the ONLY type check
npm run lint    # next lint
```

There is no test suite. `npm run build` is the type check. Verify behavior by exercising the relevant page against the live Supabase project.

Required env vars (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SEASON_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `COMMISSIONER_PIN`.

`COMMISSIONER_PIN` is server-only (no `NEXT_PUBLIC_` prefix) and is checked by `POST /api/auth/commissioner`; never inline it in client code. `NEXT_PUBLIC_*` values are baked in at build time, so changing one in Vercel needs a redeploy.

## Working conventions

These are not optional; they exist because violating them has cost real debugging time.

1. **Schema before code.** Always write and run the migration SQL in the Supabase SQL editor *before* pushing the TypeScript that depends on it. Pushing first means a live 500 on Vercel.
2. **Verify-before / verify-after on every destructive or mutating SQL.** Emit a `SELECT` that shows current state, then the mutation, then a `SELECT` that confirms it. Run them as separate statements so the user can read the output between each.
3. **Never commit secrets.** No API keys, service-role keys, or commissioner PINs in tracked files. If a credential appears in conversation, tell the user to rotate it immediately and do not use it.
4. **The live database is the source of truth.** `supabase/migrations/001_initial_schema.sql` is stale. Read the live schema before assuming a column exists.
5. **Full file replacements over patches** when the change is substantial. The user reviews whole files.
6. **Re-running an episode is the normal fix.** The `calculate` route is idempotent by design. When a score looks wrong, fix the input and re-run the episode rather than hand-editing derived rows.

## Architecture

**Two Supabase access paths.**
- Pages are all client components (`'use client'`), querying Supabase directly through the anon-key client in `src/lib/supabase/client.ts`.
- API routes under `src/app/api/scoring/*` create their own service-role client. All scoring writes go through these routes, called only from the commissioner page (`src/app/admin/page.tsx`).

**Auth is name-only, not real auth.** `AuthContext` loads every `managers` row; "login" picks a name and saves it to localStorage (`survivor-ooo-manager`). `AuthGuard requireAdmin` gates on `managers.is_commissioner`. RLS is fully permissive, so the anon client can write anything. This is a deliberate tradeoff for a 12-person private league — do not spend effort hardening it unless asked.

**Weekly scoring flow** (commissioner, from the admin page):

1. **`scrape-fsg`** — fetches FantasySurvivorGame.com season and recap HTML, parses with `src/lib/fsg-parser.ts`, upserts per-survivor `survivor_scores.fsg_points`.
2. **`override`** — manual fixes: `manual_adjustment` on a survivor-episode (e.g. an idol-in-pocket penalty) and other admin actions.
3. **`calculate`** (`{ episode, seasonId }`) — recomputes everything for that episode and rewrites the derived tables:
   - builds each manager's effective roster (drafted `teams` plus chip 4/5 swaps from `weekly_picks`)
   - **first pass with no chips**, so chip 1 (Assistant Manager) can copy a target's non-chip score without circular stacking
   - **second pass with chips**, upserts `manager_scores`
   - recomputes `chips_used`, rebuilds `pool_status` from the full picks history
   - works out quinfecta actuals, then `manager_totals` and `rank`

**Debug endpoints** exist for parser development (e.g. `/api/scoring/preview-fsg`) to inspect raw HTML and parsed output without writing to the database. Use them before changing parser regexes.

## Scoring invariants

`src/lib/scoring.ts` holds the rules and its doc comments are the spec. These invariants are expensive to re-derive and must not be broken:

- **Multipliers never touch `manual_adjustment`.** Captain 2×, Team Boost 3×, and Super Captain 4× apply to FSG points and the voted-out bonus only.
- **Captain loss is permanent.** Once a manager's captain is eliminated, `manager_scores.captain_lost` is the source of truth and the privilege never returns. The captain UI is replaced with a tombstone card. *(S51 note: the league is actively debating changing this — see Open Rules Decisions.)*
- **Voted-out bonus equals `elimination_order`.** On the finale run (`episode === total_episodes`), the Sole Survivor receives a voted-out bonus equal to the full cast size. **This was 24 for S50 and must become 21 for S51.**
- **Pool recomputation is idempotent.** The canonical walk starts at E2 every time and replays the full picks history. Never blindly increment `weeks_survived`; it caps at `episode - 1`.
- **Backdoor reactivation does not increment.** After processing active managers, check each drowned manager's `pool_backdoor_id` against the current episode's elimination. On a correct guess, flip status to active *without* incrementing `weeks_survived`.
- **Chip 5 (Player Add) is excluded from the permanent team** for purposes of the Sole Survivor bonus.
- **Sole Survivor identification**: `is_active = true` at finale, with a fallback to `elimination_order === <cast size>` for backward compatibility. The hardcoded fallback value must track cast size per season.
- **Grand total** = fantasy + pool + quinfecta + NET.
  - Pool = `weeksSurvived / (totalEpisodes − 1) × 0.25 × topFantasyTotal`
  - NET = 3 per correct guess
  - Quinfecta = highest *sequential* tier matched across the place columns

<!-- VERIFY: scoring.ts may also contain a separate flat Sole Survivor bonus (+15) applied to the permanent team only. Confirm against the code before relying on either value. -->

## FSG parser

Source: `https://www.fantasysurvivorgame.com`. Server-rendered HTML — Vercel's native `fetch()` works, no headless browser needed. **No login and no FSG "group" is required**; the pages used are public.

- Season/stats page: `/survivors/season/{N}`
- Episode recaps: `/episode-recap/season/{N}`

HTML structure the parser depends on:
- Survivor names in `<span class="survivorname">`
- Tribes in `<span class="TableTribeName">`
- Episode recap actions as `<dt>`/`<dd>` pairs with `<span class="points">(N)</span>`
- The stats table columns: Surv Pts, Out Pts, Total Pts, Rew Wins, Imm Wins, Voted Out, Place

Parsing rules:
- **`Surv Pts` is cumulative.** Diff week-over-week to get per-episode points.
- **`Place` gives elimination order.**
- **Names need HTML entity decoding.** Nicknames come through encoded (`Angelica &quot;Jelly&quot; Loblack`).
- **Survivor slugs need URL encoding.** Some contain literal spaces (`/survivors/538-Thien An`).
- The parser is regex/structure based and will break if FSG changes markup. Fail loudly rather than silently dropping actions — S51 is the "Open Era" and FSG may add scoring categories mid-season.

## Database

Run migrations by hand in the Supabase SQL editor. There is no migration tooling. The checked-in schema is stale; the code uses columns and tables absent from it, including:
- `weekly_picks.swap_out_ids` / `swap_in_ids` / `player_add_id`
- `manager_scores.captain_lost` / `base_team_points`
- the `quinfecta_predictions` and `dynasty_rankings` tables

When changing the schema, write the SQL for the user to run **and** add it as a new numbered migration file so the repo catches up over time.

**Dynasty**: `dynasty_rankings` is a *view* backed by a `dynasty` table with columns `manager_name`, `season_number`, `final_rank`. The view aliases these to `manager_id`, `season_label` (e.g. `'S50'`), and `rank`.

Next.js `images.remotePatterns` allows survivor photos from `www.fantasysurvivorgame.com/images/**`.

## S51 Migration

Season 51 — "The Open Era." Premieres Wed 2026-09-23. League draft Mon 2026-09-28. 13 episodes, Wednesdays.

**Breaking changes from S50:**

| Change | S50 | S51 | Blast radius |
|---|---|---|---|
| Cast size | 24 | **21** | quinfecta place columns, sole-survivor fallback, voted-out bonus ceiling, draft math, `cast_id` range |
| Tribes | 3 (Vatu/Kalo/Cila) | **2** | `survivors.tribe` CHECK constraint, tribe enums, every UI color reference |
| FSG season | 50 | 51 | `fetchFSGSeasonPage()`, `fetchFSGRecapPage()` |
| FSG survivor IDs | — | **536–556** (21, sequential) | seed script |

**Cast (21, FSG IDs 536–556):** Aaliyah Puglia, Alexis Levine, An "Thien An" Nguyen, Ana Sani, Angelica "Jelly" Loblack, Brady Booker, Carter Krull, Cristian Chavez, Danny Kilby, Devin Way, Eric Macksoud, Jenna Doore, Kristin Flickinger, Lewis Kelly, Linnea Capobianco, Maggie Nestor, Mike Pinsky, Ori Jean-Charles, Patt Cannaday, Rob Antonson, Sharonda Cox.

**Photo URL patterns:** `/images/51/thumbs/{key}SOLE.jpg` and `/images/51/draftpics/{key}DFT.jpg`, where `{key}` is the lowercase short name. `thien an` contains a space and must be encoded as `%20`.

**Tribe data is not available until after the premiere airs.** As of pre-premiere, FSG reports every survivor's tribe as `Unknown`. Build the seed script now; run it after 2026-09-23.

**Migration checklist:**

- [x] Flip S50 `seasons.status` to `completed`
- [ ] Create S51 `seasons` row; update `NEXT_PUBLIC_SEASON_ID`
- [ ] Update `survivors.tribe` CHECK constraint to the two S51 tribe names
- [ ] Re-seed `managers`, `couples`, `pool_status` for the new `season_id` (these tables are season-scoped)
- [ ] Seed 21 survivors post-premiere with real tribes
- [ ] Update `src/lib/constants.ts`: draft order, R5 partner pairings, couples, tribe names/colors, chip windows
- [ ] Update FSG season number to 51 in `scrape-fsg`
- [ ] Replace cast-size constants (24 → 21) everywhere, including the sole-survivor `elimination_order` fallback and the finale voted-out bonus
- [ ] Rework quinfecta place columns (S50 used `place_20th`–`place_24th`)
- [ ] Assign the dynasty immunity idol to the S50 champion
- [ ] Verify `isPicksLocked()` against the S51 calendar (Wed 7pm CT deadline; E2 is 2026-09-30)

## Open Rules Decisions

Not yet locked. **Do not hardcode around these until the commissioner confirms.** Driven by S50 exit-survey feedback:

- **Team size** — S50 used 5 per manager because of the expanded 24-person cast. Reverting to 4 is under consideration.
- **Chip windows** — currently chips are assigned to fixed weeks. Managers want more agency over timing, with guardrails against playing everything at once.
- **Captain re-designation** — managers want to name any active player as captain, which conflicts with the permanent `captain_lost` rule.
- **Quinfecta scoring** — the 50-point Sole Survivor award is considered too swingy and gameable via betting markets. A graduated final-5 structure is under consideration. This interacts with the 21-cast place-column change.
- **NET** — adding Jeff Probst as a selectable option has been requested.
- **Score explainability** — at least one manager could not reconcile their own total and disengaged rather than audit it. A per-manager score breakdown view is a likely addition.

The Pool game received uniformly positive feedback, including the backdoor mechanic. **Do not change the Pool.**
