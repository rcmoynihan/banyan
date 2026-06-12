---
name: bn-curate
description: "Consolidate staged candidate lessons into the .banyan/solutions knowledge store via the bn-knowledge-curator. Run manually, or dispatched in the background at the end of a run (e.g. by /bn-grow)."
argument-hint: "[blank = curate all pending across runs | a run-id | --refresh [scope] | --concepts]"
---

# bn-curate

Thin trunk-side entry to the Banyan **sleep-time curator**. This skill does a few cheap
things -- locate the pending candidate lessons, build one envelope with a pre-granted write
scope, and dispatch `bn-knowledge-curator` -- then presents the summary the curator writes. ALL
the consolidation judgment (grep-first dedup, merge-vs-promote, pattern proposals, stale-marking)
lives inside the curator, not here. Keep this procedure small.

This is the "curate at the trunk, asleep" half of fractal compounding: harvesters staged
candidate lessons while subtrees were hot; the curator consolidates them later into the
permanent store. This skill is run **manually**, OR dispatched **in the background** at the end
of a run (e.g. by /bn-grow). The background case is why the write scope is **pre-granted** in the
envelope -- see the permission cliff section.

## Modes

The argument selects the curator's mode:

- **blank or a run-id** → `consolidate` (the default): dedup staged candidates, merge/promote
  (causal claims gated on `claim_type: tested`), mark stale. This is the
  only mode dispatched in the **background**. Steps 1-4 below build this path.
- **`--refresh [scope]`** → `refresh`: reconcile the existing `.banyan/solutions/` store against the
  current codebase — mark-stale / update / report. **Foreground only** (see Step 5). Optional
  scope hint narrows to a category dir, module, or keyword.
- **`--concepts`** → `concepts`: bootstrap `CONCEPTS.md` from the repo's declared domain model.
  **Foreground only** (see Step 6). Normal consolidation never edits it.

`--refresh` and `--concepts` are **never** auto-fired in the background: a background dispatch
auto-denies prompts (permission cliff), and both modes can want a foreground-only escalation (a
user-confirmed delete, a domain-model write). A background dispatch is always plain
`consolidate`.

Read `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md`,
`${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md`,
`${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/knowledge-store.md`, and
`${CLAUDE_PLUGIN_ROOT}/AGENTS.md` (esp. invariant 6
permission cliff, invariant 8 v1 persistence). Skip any already in your context.

## Step 1: Locate the pending candidates

Resolve which `lessons-staging/` dirs the curator will consolidate.

- **Run-id arg given** -> curate exactly that run: `.banyan/runs/<run-id>/lessons-staging/`.
  If the dir is missing or has no candidate `.md` files, there is nothing to curate -- say so
  and stop.
- **No arg** -> sweep **all pending** staging across runs: find every
  `.banyan/runs/*/lessons-staging/` that holds at least one candidate `.md`. Collect those run dirs.
- **Nothing pending anywhere** -> STOP with a clear "no pending candidate lessons" message
  naming where you looked (`.banyan/runs/*/lessons-staging/`). Do not dispatch the curator over an
  empty set.

Do not read or judge the candidates here -- that is the curator's job. This step only finds the
non-empty staging dirs to hand it.

## Step 2: Pick the summary artifact path

The curator writes one summary at the run root (explicitly in its write scope):

- Single run -> `.banyan/runs/<run-id>/curation-summary.md`.
- Multi-run sweep -> the most recent run's `curation-summary.md` (the curator lists per-
  run results inside it). Note the chosen run-id; you read this file back in Step 4.

## Step 3: Build the envelope and dispatch bn-knowledge-curator

Embed this envelope verbatim in the Agent prompt and spawn `bn-knowledge-curator` (one child).
Fill every field. List the staging dirs from Step 1 explicitly. The envelope is the whole
contract -- the curator reads the staging dirs it names, not prose.

```
=== BANYAN ENVELOPE ===
objective:       Consolidate the staged candidate lessons into .banyan/solutions/: dedup
                 against existing docs, merge or promote (gating causal claims on the
                 claim_type rule), propose patterns, mark stale, then empty the staging
                 dirs you consolidated.
mode:            consolidate
staging_dirs:    <one or more .banyan/runs/<run-id>/lessons-staging/ paths from Step 1>
artifact_path:   .banyan/runs/<run-id>/curation-summary.md
output_format:   Curation summary per the curator's template: promoted N, merged M,
                 patterns P, held H (claim_type gate), marked-stale X,
                 staging-empty status, REPORT-ONLY items. Every promoted/merged
                 doc validated.
doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md
boundaries:      WRITE SCOPE (pre-granted) is ONLY: .banyan/solutions/ (promote/merge),
                 clearing the named lessons-staging/ dirs, and this summary artifact.
                 EVERYTHING ELSE IS REPORT-ONLY -- never edit
                 source, config, tests, .banyan/plans, .banyan/brainstorms, or other .banyan/runs
                 artifacts. Strip every staging-only key (`status: candidate`,
                 `claim_type`, `intervention`) on every promotion. Promote/merge a CAUSAL
                 claim only when `claim_type: tested` with a present `intervention:`;
                 otherwise hold in staging and report. Mark staleness in body prose, never
                 frontmatter. NEVER delete a .banyan/solutions/ doc in this mode (or any
                 background pass) -- mark and report. Never write a doc that fails
                 validate-frontmatter.py.
tool_guidance:   Read, Grep, Glob for grep-first 5-dimension overlap detection
                 (module/component/tags/symptoms/problem_type) before reading full
                 docs; Bash to run validate-frontmatter.py on EVERY .banyan/solutions/ doc
                 it writes or edits (promote, merge, AND stale-mark);
                 Edit/Write to update or promote docs and clear staging. Least
                 privilege -- no Agent spawns.
budget:
  max_children:    0
  depth_remaining: 0
effort_class:    standard
=== END ENVELOPE ===
```

- `max_children: 0` and `depth_remaining: 0` make the curator a leaf -- it consolidates inline
  and spawns nothing (it has no `Agent(...)` allowlist either).
- The curator runs at its pinned `model: opus`: consolidation is a real judgment call --
  dedup, merge, promote, hold.

## Step 4: Present the summary

When the curator returns, READ the summary artifact (the file, not the curator's final-message
prose -- invariant 3) and present to the user:

- promoted N / merged M / patterns proposed P / held H (claim_type gate) / marked-stale X;
- whether the staging dir(s) are now empty, and any candidate left behind + why (including
  candidates held by the causal-claim gate, which stay staged for a future tested run);
- any `RECOMMEND-DELETE` lines (refresh mode) for the user to action;
- the REPORT-ONLY items -- source/config changes a candidate implied that the curator could
  not make (out of scope). These are for the user/trunk to action with live permissions.

Point the user at `.banyan/solutions/` for the promoted/merged docs and at the summary path for the
full record.

## Step 5: `--refresh` (foreground only)

When the argument is `--refresh [scope]`, dispatch the curator in **`refresh` mode** instead of
consolidate. Refresh reconciles the existing `.banyan/solutions/` store against the current codebase
and does **mark-stale / update / report** — it does **not** ingest staging candidates. It is
**foreground only**: never dispatch refresh from a background run.

Build the envelope as in Step 3 with these differences: `mode: refresh`; drop `staging_dirs` and
instead pass `refresh_scope: <the scope hint, or "whole store">`; objective is "reconcile
.banyan/solutions/ against the codebase: keep / update-in-place / consolidate-superseded /
mark-stale (body prose) / report". Pick the summary artifact path under the most recent run (or a
path the user names). If `.banyan/solutions/` is empty or the scope matches nothing, the curator
reports "nothing to refresh" and stops.

**The delete carve-out (two passes).** Refresh's **first** pass **marks and reports** only — it
never deletes. The curator emits `RECOMMEND-DELETE <path>` lines, each with an inbound-link count.
Deletion of a protected `.banyan/solutions/` doc is permitted only when all three hold: a
**foreground** run, the **curator** is the actor, and the **user has confirmed that specific doc**.
A single leaf curator cannot prompt the user mid-run, so deletion is a **second pass**: after the
first pass returns, present each `RECOMMEND-DELETE` line (with its inbound-link count) and ask the
user to confirm per doc. Then re-dispatch `bn-knowledge-curator` in `refresh` mode with
`confirmed_delete_paths: [<the per-doc-confirmed paths>]` added to the envelope; that pass deletes
exactly those docs (now all three conditions hold) and nothing else. If the user confirms none,
there is no second pass. Background/sleep-time curation **never** deletes. (This matches the
AGENTS.md section 5 curator-only, foreground, user-confirmed carve-out.)

Present the refresh summary as in Step 4 (reviewed / updated / marked-stale / RECOMMEND-DELETE).

## Step 6: `--concepts` (foreground only)

When the argument is `--concepts`, dispatch the curator in **`concepts` mode** to bootstrap
`CONCEPTS.md` from the repo's declared domain model (schema, core types, primary models,
top-level domain docs), per the curator's CONCEPTS doctrine. This is the **only** path that
creates or updates `CONCEPTS.md`. Normal consolidation never edits it. It is **foreground only**.

Build the envelope as in Step 3 with `mode: concepts`, no `staging_dirs`, an objective of
"bootstrap/seed CONCEPTS.md from the declared domain model per concepts-vocabulary.md", and the
summary artifact path. Present the result by pointing the user at the seeded `CONCEPTS.md`.

## Permission cliff (invariant 6)

Only the `consolidate` mode can be dispatched **in the background** at the end of a run. In the
background, permission prompts **auto-deny silently** -- there is no human to approve an edit. So
the write scope is **pre-granted in the envelope** (.banyan/solutions/, clearing the named
lessons-staging/, and the summary artifact), and **anything outside that scope is report-only**: the
curator must not attempt an out-of-scope write (it would fail quietly and lose the work) -- it
surfaces the need in its summary instead. When run manually in the foreground, the same scope
holds; the report-only items still go to the user to action, because source/config changes belong
at the trunk with live permissions, not inside a sleep-time consolidation pass.

`--refresh` and `--concepts` are **foreground only** for exactly this reason: refresh's delete
carve-out is a prompt-worthy operation that must sit past the permission cliff (curator-only,
foreground, per-doc user-confirmed), and concepts-mode writes to `CONCEPTS.md` are an explicit
foreground act, never a background side effect. Never dispatch either mode from a background run.
