---
name: bn-conventions
description: "Banyan's run-ledger, delegation-envelope, and knowledge-store conventions; consult to open a new run, inspect or resume a run ledger, write a progress note or artifact, or look up the docs/solutions schema. The entry point a trunk or lead reads for how Banyan coordinates."
---

# bn-conventions

How Banyan coordinates: a file-based run ledger, delegation envelopes with budgets,
and a v1-compatible knowledge store. Banyan agents coordinate through the
filesystem, not through lossy child->parent message summaries -- a child's final
message is a verdict plus paths, and the load-bearing facts live in files
(AGENTS.md invariant 3). This skill is the index to those conventions and the
how-to for opening a run.

## The convention references

Read the one you need; do not read them all by reflex.

- **`references/ledger.md`** -- the run-ledger spec: the `docs/runs/<run-id>/`
  layout, run-ID format, per-file writer rules (invariant 2), lifecycle/retention,
  the `ledger.md` template, and the grow-owned `residuals.md` template. Read this to
  **open, resume, inspect, or write to a run** -- before creating a run dir, editing
  the unit-status table, appending to the log, writing a progress note, or recording
  exhausted grow recovery.
- **`references/envelope.md`** -- the delegation-envelope spec and template. Read
  this to **construct or honor a spawn envelope**: objective, artifact path, output
  format, resolved doctrine paths, boundaries, tool guidance, and the budget
  (`max_children` / `depth_remaining`). Every lead echoes its envelope into its progress file on start.
  Its companion **`references/envelope-test-plan.md`** is the budget-behavior test
  plan (max_children cap, depth-floor inline, envelope echo, effort scaling),
  exercised against the fixture through the review subtree.
- **`references/knowledge-store.md`** -- the `docs/solutions/` schema (v1-compatible):
  frontmatter contract, the two tracks (bug / knowledge), category taxonomy, and YAML
  safety rules. Read this to **write or curate a solution doc**, or a candidate lesson
  in `lessons-staging/`.

## Opening a new run

A trunk opens a run before dispatching any lead. Preferred path is the scaffolder; a
manual fallback is below for environments without Node.

### Preferred: the scaffolder

```
node scripts/new-run.mjs <slug> [--root <repo-root>] [--date YYYY-MM-DD] [--force]
```

- `<slug>` -- kebab-case task name (e.g. `add-oauth-login`).
- `--root` -- target repo root (default: current working dir). The run dir is created
  under `<root>/docs/runs/`.
- `--date` -- ISO date for the run ID (default: today). Accept it for deterministic
  scaffolding; tests pass an explicit date.
- `--force` -- overwrite an existing run dir for the same ID instead of refusing.

It computes the run ID `<date>-<NNN>-<slug>` (next zero-padded `NNN` for that date),
creates the full layout -- `ledger.md` seeded from the template plus empty
`progress/`, `findings/`, `briefs/`, `lessons-staging/` dirs -- and prints the run ID
and absolute path. After it runs, fill in `## Objective` and the `## Plan` ref, then
append the opening line to `## Log`.

(The script lives at `plugin/skills/bn-conventions/scripts/new-run.mjs`; invoke it by
its path from wherever you are, e.g. `node <plugin>/skills/bn-conventions/scripts/new-run.mjs ...`.)

### Manual fallback (no Node)

1. Pick the run ID: `<date>-<NNN>-<slug>`, where `<NNN>` is the next zero-padded
   sequence for `<date>` -- list `docs/runs/` and add 1 to the highest existing `NNN`
   for that date (start at `001`).
2. Create the layout:

   ```
   mkdir -p docs/runs/<run-id>/progress
   mkdir -p docs/runs/<run-id>/findings
   mkdir -p docs/runs/<run-id>/briefs
   mkdir -p docs/runs/<run-id>/lessons-staging
   ```

3. Create `docs/runs/<run-id>/ledger.md` from the template in `references/ledger.md`
   (`# Run <id>`, `## Objective`, `## Plan`, `## Facts / Context`, `## Units` table,
   `## Log`, `## Open questions`). Fill the objective and plan ref; append the opening
   log line.

## The boundary check

`scripts/check-boundary.mjs` is the delivery subtree's advisory boundary instrument: it
reports which files changed between two refs fall inside or outside an allowed file set.

```
node scripts/check-boundary.mjs --base <ref> [--head <ref>] --allow <paths,dir/**|@file> [--cwd <dir>]
```

Exit 0 = all in-boundary, 1 = violations, 2 = usage/git error. Allow entries are exact
repo-relative paths or `dir/**` prefixes only. `bn-unit-lead`, `bn-delivery-lead`, and
`bn-integrator` run it before commits and merges; violations are adjudicated by the
owning lead (accepted with a recorded rationale, or fixed), never auto-blocked. Its
unit tests live beside it (`check-boundary.test.mjs`, run via `node --test`).

## Reminders

- `docs/runs/` is local run state and is normally gitignored. Durable knowledge belongs in
  `docs/solutions/`; fixture or eval runs belong in explicit fixture/eval paths.
- One writer per file set (invariant 2): own your progress file and your unit's status
  row; append to the log without rewriting others' lines; never co-write a `findings/`
  or `briefs/` file.
