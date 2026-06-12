---
name: bn-curate
description: "Consolidate staged candidate lessons into the docs/solutions knowledge store via the bn-knowledge-curator. Run manually, or dispatched in the background at the end of a run (e.g. by /bn-grow)."
argument-hint: "[blank = curate all pending lessons-staging across runs | a specific run-id]"
---

# bn-curate

Thin trunk-side entry to the Banyan **sleep-time curator**. This skill does a few cheap
things -- locate the pending candidate lessons, build one envelope with a pre-granted write
scope, and dispatch `bn-knowledge-curator` -- then presents the summary the curator writes. ALL
the consolidation judgment (grep-first dedup, merge-vs-promote, pattern proposals, stale pruning,
discoverability edits) lives inside the curator, not here. Keep this procedure small.

This is the "curate at the trunk, asleep" half of fractal compounding: harvesters staged
candidate lessons while subtrees were hot; the curator consolidates them later into the
permanent store. This skill is run **manually**, OR dispatched **in the background** at the end
of a run (e.g. by /bn-grow). The background case is why the write scope is **pre-granted** in the
envelope -- see the permission cliff section.

Read `skills/bn-conventions/references/envelope.md`,
`skills/bn-conventions/references/ledger.md`,
`skills/bn-conventions/references/knowledge-store.md`, and `AGENTS.md` (esp. invariant 6
permission cliff, invariant 8 v1 persistence).

## Step 1: Locate the pending candidates

Resolve which `lessons-staging/` dirs the curator will consolidate.

- **Run-id arg given** -> curate exactly that run: `docs/runs/<run-id>/lessons-staging/`.
  If the dir is missing or holds only `.gitkeep`, there is nothing to curate -- say so and stop.
- **No arg** -> sweep **all pending** staging across runs: find every
  `docs/runs/*/lessons-staging/` that holds at least one candidate `.md` (i.e. more than a bare
  `.gitkeep`). Collect those run dirs.
- **Nothing pending anywhere** -> STOP with a clear "no pending candidate lessons" message
  naming where you looked (`docs/runs/*/lessons-staging/`). Do not dispatch the curator over an
  empty set.

Do not read or judge the candidates here -- that is the curator's job. This step only finds the
non-empty staging dirs to hand it.

## Step 2: Pick the summary artifact path

The curator writes one summary at the run root (explicitly in its write scope):

- Single run -> `docs/runs/<run-id>/curation-summary.md`.
- Multi-run sweep -> the most recent run's `curation-summary.md` (the curator lists per-
  run results inside it). Note the chosen run-id; you read this file back in Step 4.

## Step 3: Build the envelope and dispatch bn-knowledge-curator

Embed this envelope verbatim in the Agent prompt and spawn `bn-knowledge-curator` (one child).
Fill every field. List the staging dirs from Step 1 explicitly. The envelope is the whole
contract -- the curator reads the staging dirs it names, not prose.

```
=== BANYAN ENVELOPE ===
objective:       Consolidate the staged candidate lessons into docs/solutions/: dedup
                 against existing docs, merge or promote, propose patterns, prune stale,
                 then empty the staging dirs you consolidated.
staging_dirs:    <one or more docs/runs/<run-id>/lessons-staging/ paths from Step 1>
artifact_path:   docs/runs/<run-id>/curation-summary.md
output_format:   Curation summary per the curator's template: promoted N, merged M,
                 patterns P, pruned X, discoverability edits, staging-empty status,
                 REPORT-ONLY items. Every promoted/merged doc validated.
boundaries:      WRITE SCOPE (pre-granted) is ONLY: docs/solutions/ (promote/merge),
                 CONCEPTS.md, CLAUDE.md (minimal discoverability), and clearing the
                 named lessons-staging/ dirs + this summary artifact. EVERYTHING ELSE
                 IS REPORT-ONLY -- never edit source, config, tests, docs/plans,
                 docs/brainstorms, or other docs/runs artifacts. Strip the
                 `status: candidate` key on every promotion. Never write a doc that
                 fails validate-frontmatter.py.
tool_guidance:   Read, Grep, Glob for grep-first 5-dimension overlap detection
                 (module/component/tags/symptoms/problem_type) before reading full
                 docs; Bash to run validate-frontmatter.py on EVERY docs/solutions/ doc
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
  dedup, merge, promote, prune.

## Step 4: Present the summary

When the curator returns, READ the summary artifact (the file, not the curator's final-message
prose -- invariant 3) and present to the user:

- promoted N / merged M / patterns proposed P / pruned-or-marked X;
- whether the staging dir(s) are now empty, and any candidate left behind + why;
- any discoverability edits to CONCEPTS.md / CLAUDE.md;
- the REPORT-ONLY items -- source/config changes a candidate implied that the curator could
  not make (out of scope). These are for the user/trunk to action with live permissions.

Point the user at `docs/solutions/` for the promoted/merged docs and at the summary path for the
full record.

## Permission cliff (invariant 6)

The curator can be dispatched **in the background** at the end of a run. In the background,
permission prompts **auto-deny silently** -- there is no human to approve an edit. So the write
scope is **pre-granted in the envelope** (docs/solutions/, CONCEPTS.md, CLAUDE.md, and clearing
the named lessons-staging/), and **anything outside that scope is report-only**: the curator must
not attempt an out-of-scope write (it would fail quietly and lose the work) -- it surfaces the
need in its summary instead. When run manually in the foreground, the same scope holds; the
report-only items still go to the user to action, because source/config changes belong at the
trunk with live permissions, not inside a sleep-time consolidation pass.
