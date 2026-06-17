# Consult thrash/cost budget

The deterministic per-logical-unit budget meter for the recursive consult-upward loop. It is
the circuit-breaker that aborts a thrashing or runaway logical unit to `blocked` (the abort
rides the existing `blocked` path — **R2**), before the loop burns unbounded cost. The meter
is pure, LLM-free, and reconstructable from files alone (**R21**, **R22**, **R23**).

- **Code:** `plugin/skills/bn-conventions/scripts/consult-budget.mjs`
- **Schema:** `plugin/schemas/consult-budget.schema.json`
- **Test:** `node --test plugin/skills/bn-conventions/scripts/consult-budget.test.mjs`

A **logical unit** is one chain of physical continuation children (one ask → answer →
continuation → answer-absorbed → … sequence). The meter is fed the chain's accumulated
counters, not any single child's.

## Independence from the spawn budget (R22)

This budget is **independent of `max_children` and `depth_remaining`**. A unit can have spawn
budget remaining and still be aborted here; conversely, exhausting `max_children` is a
separate concern handled by the spawn machinery. `max_children` / `depth_remaining` are **not
dimensions** of this meter and must not influence its verdict. The transcript-ancestry depth
and total transcript bytes per logical unit are capped here **separately** from
`depth_remaining` (R22), as two of the meter's own dimensions.

## The verdict

```js
import { evaluate } from './consult-budget.mjs';
const { trip, dimension, ceiling_hit, score, counters } = evaluate(liveCounters, config);
```

- `trip` — abort the logical unit to `blocked` when `true`.
- `dimension` — the first dimension that tripped (stable check order, below), or
  `"hard_ceiling"` when only the composite ceiling fired, or `null` when not tripped.
- `ceiling_hit` — the absolute composite ceiling fired (independent of any single dimension).
- `score` — the weighted composite cost score (recorded in the abort record).
- `counters` — the resolved per-dimension counter values; the near-duplicate count is the
  **derived** value when a raw `questions` history was passed.

## Dimensions, caps, and weights (the fixed constants)

These are the documented constants. The requirements doc defers the exact values to planning;
they are settled here as the single source of truth and mirrored in `DEFAULT_CONFIG` in
`consult-budget.mjs`. A caller may override individual values via the `config` argument.

| Dimension | Cap (`>=` trips) | Weight | What it catches |
|---|---|---|---|
| `respawn_count` | 6 | 1 | Endless continuation respawns of one logical unit. |
| `cumulative_tokens` | 400000 | 1 | Total model tokens burned across the whole chain. |
| `repeated_reread_count` | 8 | 1 | The same file re-read over and over (spinning). |
| `no_progress_diff_count` | 3 | 1.5 | Consecutive continuations producing no measurable diff. |
| `near_duplicate_question_count` | 3 | 1.5 | Reworded re-asks of an already-asked question. |
| `transcript_ancestry_depth` | 8 | 1 | R22 — depth of the continuation chain, capped separately. |
| `total_transcript_bytes` | 8000000 | 1 | R22 — total raw transcript bytes carried laterally. |

The two thrash-of-intent dimensions (`no_progress_diff_count`, `near_duplicate_question_count`)
carry the higher weight (1.5): re-asking the same question while making no progress is the
loop's core failure mode (rubber-stamp thrash) and should pull the composite score up fastest.

### Check order (stable verdicts)

Per-dimension caps are checked in this order, so the reported `dimension` is deterministic when
several trip at once:

```
respawn_count → cumulative_tokens → repeated_reread_count → no_progress_diff_count
→ near_duplicate_question_count → transcript_ancestry_depth → total_transcript_bytes
```

## The absolute hard ceiling (the unconditional backstop)

Beyond the per-dimension caps, the meter computes a **composite weighted cost score**:

```
score = Σ over dimensions ( counter / cap ) * weight
```

When `score >= hard_ceiling` the meter trips **regardless of which dimension** — this is the
backstop a unit cannot reason away by staying just under every individual cap while grinding on
every axis at once.

- **`hard_ceiling` = 4.**

The sum of all weights is `1+1+1+1.5+1.5+1+1 = 8`, so the ceiling of 4 fires when the chain is,
on aggregate, roughly half-way to saturating every dimension — well before any single cap is
necessarily reached. When only the ceiling fires (no single dimension at its cap), `dimension`
is reported as `"hard_ceiling"`.

## Near-duplicate question detection (deterministic, no LLM)

Near-duplicate detection is a pure normalized-token fingerprint — no model call:

1. **Normalize** each question: lowercase, strip punctuation, collapse whitespace, drop a small
   fixed stop-list of filler/connective words ("please", "again", "should", "which", …) that
   reworders swap in and out.
2. **Fingerprint** = the order-free, deduplicated, sorted set of remaining content tokens.
3. **Similarity** = Jaccard overlap `|A ∩ B| / |A ∪ B|` between two fingerprints (two empty
   fingerprints count as identical — content-free re-asks are maximally near-duplicate).
4. **Count** = the number of questions (after the first) that are near-duplicate
   (similarity `>= near_duplicate_similarity_threshold`) to **any** earlier question.

- **`near_duplicate_similarity_threshold` = 0.6.** Measured: four reworded variants of one
  question overlap at ~0.67 (caught), while a genuinely different follow-up overlaps at ~0.1
  (not caught). 0.6 sits cleanly between.

This is the **AE6** case: four reworded re-asks of the same goal/intent question with no diff
progress yield a near-duplicate count of 3 — at the cap — so the unit trips on
`no_progress_diff_count` / `near_duplicate_question_count` rather than spinning forever.

The live counter may be supplied directly (`near_duplicate_question_count`) or derived from the
raw ordered `questions` history; an explicit count takes precedence.

## The abort record (reconstructable, R23)

When the meter trips, the owning lead/trunk writes a `buildAbortRecord(logicalUnit, result,
{ last_progress_ref, reason })` record to `consults/aborts/` (the subdir scaffolded by the run
machinery). It conforms to the `abort_record` definition in `consult-budget.schema.json` and
carries the tripped dimension, whether the ceiling fired, the full counter values, the
composite score, a pointer to the last progress artifact, and a human-readable reason — so the
abort of a logical unit is reconstructable from files alone.

## Verification

`node --test plugin/skills/bn-conventions/scripts/consult-budget.test.mjs` covers AE6 (four
near-duplicate reworded questions with no diff progress trip), the absolute ceiling tripping
regardless of dimension, a healthy unit not tripping, R22 independence from
`max_children`/`depth_remaining`, determinism, and the CLI. This prose itself is
`UNVERIFIED (no test command)`; the constants above are the documented mirror of
`DEFAULT_CONFIG`.
