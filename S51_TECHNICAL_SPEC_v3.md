# S51 TECHNICAL SPEC (v3)

Build spec for the Survivor OOO Fantasy Season 51 rebuild. Companion to `CLAUDE.md`.
League-facing rules live in the S51 League Rules doc; this file is the implementation contract.

*v3 — updated 2026-09-29 after the league kickoff.**
Changed since v2: penalties now split pre/post merge, and Reward and MOP penalties are
removed entirely; episode titles auto-pulled from The Futon Critic. Migration 007 applied.

**Database migration is COMPLETE.** Remaining work is application code.

---

## 0. Status and critical path

**Done:**
- S51 season row: `550e8400-e29b-41d4-a716-446655440051`
- 21 castaways seeded with tribes + Jeff (`cast_id` 99, `is_playable=false`)
- 12 managers, 6 couples, 12 pool rows (Alli holds the Dynasty Idol)
- 13 episodes with air dates and lock times
- 66 fixtures across 11 rounds — E7 Couples Week, E12 Rivalry Week
- New tables: `episodes`, `fixtures`, `episode_events`, `episode_outcomes`, `score_lines`, `h2h_results`, all with permissive RLS
- Scoring columns on `manager_scores` and `manager_totals`

**Hard deadline — Wed 2026-09-30, 7:00pm CT (E2 picks lock):**
1. Pick card: 5 slots, uniqueness validation, chip selection, deadline lock
2. `NEXT_PUBLIC_SEASON_ID` flipped in Vercel

**By Thu 2026-10-01 morning:**
3. Parser reading S51 recap into `episode_events` + `episode_outcomes`
4. Scoring engine writing `score_lines`, `manager_scores`, `h2h_results`
5. Breakdown view

**In-season:** standings pages, chips UI, shadow record, superlatives, theming, quinfecta (not needed until E13).

---

## 1. Data model — as it actually exists

### Retired, not dropped
S50 rows must stay readable. These are simply no longer written:

- Tables: `teams`, `draft_picks`
- `weekly_picks`: `captain_id`, `swap_out_ids`, `swap_in_ids`, `player_add_id`, `chip_played`, `chip_target`, `net_pick_id` *(superseded by `title_pick_id`)*
- `manager_scores`: `base_team_points`, `captain_bonus`, `captain_lost`, `voted_out_bonus`, `net_correct`, `chip_played`, `chip_detail`
- `manager_totals`: `net_total`, `sole_survivor_bonus`, `grand_total`

### `survivors`
`fsg_id` (536–556) is the join key to FSG. **Never match on name** — `Angelica "Jelly" Loblack` and `An "Thien An" Nguyen` arrive HTML-encoded.
`original_tribe` is written once at seed and never updated; FSG reports `tribe` as `Out` post-elimination.
`is_playable=false` for Jeff: valid in the Title slot only.

**`elimination_order` is INVERTED relative to FSG.** DB convention is 1 = first out, 21 = winner. FSG's `Place` column is the opposite (Aaliyah is 21st place and `elimination_order = 1`).

```
elimination_order = 22 - fsg_place        -- CAST_SIZE + 1 - place
fsg_place         = 22 - elimination_order
```

Getting this backwards silently inverts the quinfecta. Write a unit test.

### `weekly_picks`
Five new pick columns plus `chip`, `chip_slot`, `hedge_alt_id`. A unique partial index enforces one use of each chip per manager per season. **Slot uniqueness across the four roster picks is enforced in application code**, not the database.

### `survivor_scores`
`scored_actions` **already holds itemized FSG actions** in this shape:

```json
{"source":"fsg_auto",
 "actions":[{"action":"Win a Tribe Reward Challenge","points":2},
            {"action":"Win a Tribe Immunity Challenge","points":3}],
 "pulled_at":"2026-03-12T19:55:07.374Z"}
```

Empty weeks are `{"source":"fsg_auto","actions":[],"no_actions":true}`. Keep writing this for continuity, **and** write normalized rows into `episode_events` — MOP computation and category filtering are far cleaner in SQL.

### `quinfecta_predictions`
`place_1_id` … `place_5_id` added. The old `place_20_id`–`place_24_id` columns and the separate `quinfecta_submissions` table are S50 artifacts; confirm by grep which the code reads before wiring anything.

---

## 2. Constants

```ts
export const SEASON_NUMBER = 51;
export const CAST_SIZE = 21;
export const TRIBES = ['Savu', 'Toka'] as const;
export const H2H_ROUNDS = 11;

export const SLOT_BONUS_GOING_HOME = 5;
export const SLOT_BONUS_TITLE = 1;
// Penalties key off episodes.is_post_merge. Reward and MOP are NEVER penalised.
export const PENALTY_IMMUNITY_BOOTED   = -5; // both rulesets
export const PENALTY_GOING_HOME_IMMUNE = -5; // post-merge only

export const QUINFECTA_EXACT = 5;
export const QUINFECTA_ADJACENT = 2;
export const QUINFECTA_PERFECT_BONUS = 10;

export const PLACEMENT_CURVE = [12,10,9,8,7,6,5,4,3,2,1,0];
export const WEIGHTS = { fantasy: 3, pool: 1.5, quinfecta: 1 } as const;
```

`CAST_SIZE` must be referenced everywhere, never inlined. Scattered `24`s are what made this migration expensive.

---

## 3. FSG parser

Sources (public, server-rendered, no auth):
- `https://www.fantasysurvivorgame.com/survivors/season/51`
- `https://www.fantasysurvivorgame.com/episode-recap/season/51`

### 3.1 The whitelist

Only these four strings are challenge wins:

| Category | Exact string |
|---|---|
| `reward` | `Win a Tribe Reward Challenge` |
| `reward` | `Win an Individual Reward Challenge` |
| `immunity` | `Win a Tribe Immunity Challenge` |
| `immunity` | `Win an Individual Immunity Challenge` |

Everything else is `other`. Known strings across S50 and S51 E1:

`Read Tree Mail` · `Strategize at the Water Well` · `Make Fire at Camp` · `Find Food` · `Negotiate for Supplies` · `Go to Exile Island` · `Go on a Journey` · `Win a Journey Challenge` · `Island Challenge` · `Gain an Immunity Idol` · `Gain an Advantage` · `Play an Idol or Advantage` · `Play Shot in the Dark` · `Survivor Auction` · `Love from Home` · `Merge` · `Win the Fire Making Challenge` · `Win the Marooning Challenge` · `Win the Supply Challenge`

**Never substring-match "immunity" or "reward".** `Gain an Immunity Idol` is not a challenge win. Loose matching credits every idol-finder with an immunity win and corrupts both the Immunity slot and MOP.

**Unknown action → classify `other`, log an error, surface it in the admin panel.** The Open Era will produce new actions.

### 3.2 Point values are read, never assumed

FSG re-tuned values between seasons: `Read Tree Mail`, `Make Fire at Camp` and `Play Shot in the Dark` all went from 2 to 1. Challenge values were unchanged (tribe reward 2, tribe immunity 3). Always parse the integer in the parentheses.

### 3.3 Cross-check

Recaps carry summary headers (`Immunity: Savu`, `Reward: …`, `Voted Out: …`) independent of the itemized list. Parse both, assert agreement, surface mismatches rather than scoring silently.

`Surv Pts` on the stats page is cumulative — diff week-over-week and assert the diff equals the sum of parsed actions. **Ignore `Out Pts` entirely**; it is FSG's longevity currency and reintroduces the elimination bias we retired.

### 3.4 Episode titles — a SEPARATE source

FSG publishes recaps only **after** an episode airs, but the Title slot needs the title
**before** picks lock. Source is CBS's press releases, mirrored by The Futon Critic:

```
http://www.thefutoncritic.com/showatch/survivor/listings/
```

Verified 2026-09-29: the 9/30/26 row already read `Weaponized Honesty`, posted six days
ahead. E1 reads `(#5101-120) Permanent Uncertainty`. Everything from 10/7 reads `TBA`.

- Rows are `M/D/YY (Day) 8:00 PM CBS <title>`
- **Strip any `(#NNNN-NNN) ` production-code prefix** — E1 has one, E2 does not
- **Skip titles ending in `(R)`** — hundreds of S50-and-earlier rerun rows
- **Skip `TBA`**
- **Dedupe by date, preferring the non-`(R)` row** — CBS reissues press releases
- Match on **air date** against `episodes.air_date`; never parse episode numbers
- Write `episodes.title`, `title_source='thefutoncritic'`, `title_fetched_at`
- **Never overwrite a commissioner-set title**: fill only when `title is null` or
  `title_source = 'thefutoncritic'`
- Parse failure → log loudly, write nothing; never a partial result

Daily cron plus a manual button on the admin page. Fall back to the Wikipedia
`Survivor 51` season-summary table if the markup changes.

### 3.4b Deriving `episode_outcomes`

```
reward_happened   = any event category 'reward'
immunity_happened = any event category 'immunity'
reward_winners    = survivors with a 'reward' event
immunity_winners  = survivors with an 'immunity' event
departures        = 'Voted out' + 'Quit/Evac' + 'Out of game' lines
other_points(s)   = sum of s's 'other' events
mop_winners       = argmax(other_points) where > 0    -- ARRAY, ties included
```

Departures include quits and medevacs — S50 E1 had a vote-out and a quit in the same episode.

---

## 4. Scoring engine

`POST /api/scoring/calculate { episode, seasonId }`. Idempotent: deletes and rewrites all derived rows for the episode. Re-running is the normal fix.

```
1. Load episode_events, episode_outcomes, all weekly_picks for the episode
2. Per manager:
   a. HEDGE (chip): if played, the named slot uses whichever of
      {pick, hedge_alt} gives the better slot outcome. Resolve FIRST.
   b. For each roster slot in [reward, immunity, going_home, mop]:
        base    = sum of that survivor's episode_events points
        hit     = slot condition satisfied (see below)
        mult    = hit ? 2 : 1
        if chip == 'triple_down' and chip_slot == slot and hit: mult = 3
        bonus   = (slot == 'going_home' and hit) ? 5 : 0
        penalty = 0
        if slot == 'immunity' and survivor in departures:
            penalty = -5                     # both rulesets
        if slot == 'going_home' and episode.is_post_merge
               and survivor in immunity_winners:
            penalty = -5                     # post-merge only
        # Reward and MOP carry no penalty in either ruleset.
        total   = base * mult + bonus + penalty
        -> write score_lines row with a plain-English `reason`
   c. Title slot: +1 if title_pick_id matches net_answers.correct_survivor_id
   d. manual_adjustment passes through UNMULTIPLIED (slot='adjustment')
3. card_total = sum of score_lines (MAY BE NEGATIVE)
4. Resolve fixtures -> h2h_results; apply double_fixture / point_shield
5. shadow_beat = count of the other 11 managers this manager outscored
6. Rebuild pool_status by walking from E2 (unchanged from S50)
7. Recompute standings and championship points
```

**Slot hit conditions:**

| Slot | Hit when |
|---|---|
| reward | `reward_happened` AND pick ∈ `reward_winners` |
| immunity | `immunity_happened` AND pick ∈ `immunity_winners` |
| going_home | pick ∈ `departures` |
| mop | pick ∈ `mop_winners` |

### 4.1 Invariants

- **`manual_adjustment` is never multiplied.** Carried from S50.
- **No-event rule:** `reward_happened == false` → base only, no double, **no penalty**. E1 had no reward challenge; expect this to recur.
- **MOP ties pay everyone** in the array.
- **Penalties are uncapped.** Multi-boot weeks can stack them; S50 E6 was a triple elimination. Negative card totals are legal and the UI must render them.
- **`is_post_merge` flips on the episode AFTER the merge airs, never during it.** Picks lock before the episode, so a manager must never be scored under a rule that was not visible at submission. The parser sets `merge_aired = true` on the episode whose recap contains the `Merge` action, then `is_post_merge = true` on every later episode. Commissioner can override both from the admin page.
- **The pick card must state the live ruleset.** Pre-merge: only a wrong Immunity pick is penalised.
- **Going Home pays if *any* departure matches.**
- **Chip ordering:** Hedge → slot scoring → Triple Down → fixture resolution → Double Fixture / Point Shield.
- **Chips are E2–E12 only**, one per episode, one use each per season. Validate on submit *and* at scoring time.

### 4.2 H2H

3 / 1 / 0. **Double Fixture** doubles only the player's own points (6/2/0); the opponent scores normally. **Point Shield** converts that manager's loss to a draw (0 → 1). Both can apply in the same fixture, independently.

Season tiebreak: **cumulative raw card points** (`manager_totals.raw_card_points`). The old "highest placing draft pick" tiebreak is dead.

### 4.3 Quinfecta (E13)

```
for position p in 1..5:
  actual = survivor who finished at p
  if prediction[p] == actual:                 +5
  else if prediction[p] finished at p±1:      +2
if all five exact:                            +10
```

Max 35. Finale placements come from the recap's `Sole survivor (1st place)` / `Out of game (Nth place)` / `Voted out (Nth place)` lines — **FSG place numbering, not `elimination_order`.**

### 4.4 Championship

Rank each game independently → map to `PLACEMENT_CURVE` → multiply by weight → sum. Ties split the pooled points evenly. Max 66 (Fantasy 36, Pool 18, Quinfecta 12).

Couples standings = sum of both partners' championship points. Pot: 60 / 20 / 10 / 10.

---

## 5. Pick card — the Wednesday deadline

Route: `/picks`. **The only thing that must work by 9/30 7pm CT.**

- Five selectors: Reward, Immunity, Going Home, MOP, Title
- Shows `episodes.title` above the Title slot ("This week: *Weaponized Honesty* — who says it?"); if null, say it hasn't been announced and keep the slot selectable
- States the live penalty ruleset explicitly
- Roster slots filter to `is_active = true AND is_playable = true`
- Title slot includes Jeff and has no uniqueness constraint
- **Client-side uniqueness validation** across the four roster slots, with a human error message
- Pool pick and backdoor (unchanged from S50)
- Optional chip + target slot; hide chips already used; block a second chip in the same episode; disable entirely outside E2–E12
- Lock at `episodes.lock_at`; after lock the card is read-only and `/reveals` opens
- Show the current fixture and opponent prominently — the H2H matchup is the emotional hook

---

## 6. Breakdown view

Highest-priority build after the pick card. Route `/breakdown/[managerId]/[episode]`, linked from every score everywhere.

Per slot: the pick with photo and tribe, their itemized actions from `episode_events` with individual point values, whether the slot hit, the `reason` string verbatim, multiplier, bonus, penalty, slot total. Then episode total, fixture result, shadow record.

Plus a link to the FSG recap for that episode and a "this looks wrong" button that pings the commissioner.

**Constraint: a manager who does not understand the rules should be able to read this page and work out why they scored what they scored.** No unexplained numbers. This exists because a S50 manager disengaged rather than audit her score.

---

## 7. Design tokens

Toka = yellow `#f0c624`. Savu = purple `#6f119d`. Blue `#05a9e6` is season branding and the **only** interactive colour.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#ffffff` | `#0e0f12` |
| `--surface` | `#f7f7f8` | `#16181d` |
| `--text` | `#16161a` | `#f2f3f5` |
| `--text-muted` | `#5c5f66` | `#9aa0a8` |
| `--border` | `#e3e4e8` | `#2a2d34` |
| `--accent` | `#0b7fae` | `#3fc0f0` |
| `--accent-fill` | `#05a9e6` | `#05a9e6` |
| `--tribe-savu` | `#6f119d` | `#8b2bc0` |
| `--tribe-savu-on` | `#ffffff` | `#ffffff` |
| `--tribe-toka` | `#f0c624` | `#f0c624` |
| `--tribe-toka-on` | `#16161a` | `#16161a` |
| `--tribe-merge` | *reserved* | *reserved* |
| `--positive` | `#15803d` | `#4ade80` |
| `--negative` | `#b91c1c` | `#f87171` |

Rules: tribe colours are for tribe identity only. Raw `#f0c624` (1.6:1 on white) and `#05a9e6` (2.7:1) can never carry text on a light background — use the paired `-on` token on fills and `--accent` for links. **Yellow is no longer available as a warning colour.** Mode toggle: `data-theme` on `<html>`, default from `prefers-color-scheme`, override persisted, applied pre-paint.

---

## 8. Test fixture — E1

E1 is unscored but fully parsed. Use it as the parser's regression test.

| Survivor | Total | Actions | Other |
|---|---|---|---|
| Rob | 6 | tribe immunity 3, tree mail 1, water well 1, **idol 1** | 3 |
| Kristin | 6 | tribe immunity 3, water well 1, fire 1, negotiate 1 | 3 |
| Eric | 5 | tribe immunity 3, water well 1, find food 1 | 2 |
| Cristian | 5 | tribe immunity 3, tree mail 1, water well 1 | 2 |
| Lewis | 2 | island challenge 1, exile 1 | 2 |
| Aaliyah | 1 | shot in the dark 1 | 1 |

Assertions:
- `reward_happened == false`
- `immunity_winners` = all 10 Savu, **Rob included**
- `mop_winners == [Rob, Kristin]`, both at 3 — a tie in week one
- Rob's idol is `other`, not `immunity`
- Aaliyah: FSG place 21 → `elimination_order = 1`
- Every survivor's parsed sum equals their `Surv Pts`

Best possible card: Eric reward (5, no double), Rob immunity (12), Aaliyah going home (7), Kristin MOP (12) = **36**.

---

## 9. Open items

- **Merge tribe colour** — unknown until the merge airs; token reserved
- **Episode count** — 13 assumed, unconfirmed by CBS; Nov 25 preemption would shift everything after Nov 18. `episodes` holds real dates, so correct the table rather than the code
- **Dark-mode tribe tints** — verify contrast before shipping
- **`quinfecta_predictions` vs `quinfecta_submissions`** — grep which the code reads
