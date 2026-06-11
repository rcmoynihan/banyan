# Run ledger: docs/runs/<run-id>/ (Banyan's stigmergic substrate)

Every Banyan run writes to one directory under `docs/runs/` in the *target repo*
(not the plugin). That directory is the run's shared memory: coordination happens
through files, not through child->parent message prose. A child's final message is
a verdict plus paths; the load-bearing facts live in the ledger and its artifacts
(AGENTS.md invariant 3). Parents READ these files; they do not trust summaries.

Read this before opening a run, writing a progress note, or reading a child's work.

## Run ID format

A run ID is `YYYY-MM-DD-NNN-<slug>`:

- `YYYY-MM-DD` -- the date the run was opened (ISO date).
- `NNN` -- a zero-padded, per-day sequence number, starting at `001`. The second
  run opened on the same day is `002`, and so on. Sequence is per-date, not global.
- `<slug>` -- a kebab-case task name: lowercase, words joined by `-`, no spaces or
  punctuation (e.g. `add-oauth-login`, `fix-flaky-payment-test`).

Examples: `2026-06-10-001-add-oauth-login`, `2026-06-10-002-fix-flaky-payment-test`.

The scaffolder (`scripts/new-run.mjs`) computes `NNN` for you by scanning existing
dirs for the date; see "Opening a run" below.

## The layout

```
docs/runs/<run-id>/
  ledger.md            # task ledger: objective, plan ref, facts, unit-status table, append-only log
  progress/<agent>.md  # per-subtree progress notes (one writer per file)
  findings/            # review findings JSON, one file per reviewer/finding
  briefs/              # research briefs, plan-judge outputs (one file per artifact)
  lessons-staging/     # harvested candidate lessons (consumed by the curator)
  <report>.md          # a lead's single final report at the run root (see below)
```

Run-root **report** artifacts (one per lead/phase, written by the owning lead as its single
synthesized output, and read by the trunk / `/bn-grow` gates — invariant 3, artifacts over prose):

- `review-verdict.md`     -- the review subtree's applied verdict (`bn-review-lead`).
- `delivery-report.md`    -- the delivery subtree's outcome (`bn-delivery-lead`).
- `curation-summary.md`   -- the curator's consolidation summary (`bn-knowledge-curator`).
- `debug-diagnosis.md`    -- the debug subtree's diagnosis (`bn-debug-lead`, investigate mode).
- `debug-fix-report.md`   -- the debug subtree's fix outcome (`bn-debug-lead`, fix mode).

(The research subtree's report is a brief, so it lives under `briefs/research-brief.md`, not the
run root.) Each report is single-writer (the named lead). A `/bn-grow` phase gate is "the next
report file exists + its content passes the gate" — so these run-root files are a defined part of
the layout, not ad-hoc.

- `ledger.md` is the run's spine: objective, plan reference, durable facts, the
  unit-status table, and an append-only event log. One file per run.
- `progress/<agent>.md` is a per-subtree scratch + audit note. The filename is the
  agent that owns it (e.g. `progress/bn-review-lead.md`). On start, a lead echoes
  its delegation envelope here so budget/boundary violations are auditable.
- `findings/` holds one file per review finding (schema-valid JSON; see
  `schemas/findings-schema.json`). Reviewers write here; the lead reads them.
- `briefs/` holds one file per distilled artifact: a research brief, a plan-judge
  score sheet, a synthesis. One artifact = one file.
- `lessons-staging/` holds harvested candidate lessons in the v1 solution format
  (with `status: candidate`); the curator consumes and empties it (see Lifecycle).

## Writer rules (invariant 2: one writer per file set)

Reads parallelize; writes serialize. Every file in the layout has a defined owner:

- **`ledger.md` unit-status table -- single-writer.** Only the lead that owns a unit
  edits that unit's row in the `## Units` table. No other agent rewrites a row it
  does not own. The trunk owns rows for units it runs inline.
- **`ledger.md` `## Log` -- append-only, serialized through the run owner.** The log is
  a strict chronological journal: add to the bottom, never edit above. To honor invariant 2
  (no two writers share a file concurrently), the shared `ledger.md` is updated by **one
  writer at a time** -- the trunk for the run as a whole, or a lead for events within the
  unit it owns. Parallel subtrees do **not** both append to `ledger.md`: each records its
  own activity in its `progress/<agent>.md` (disjoint files, collision-free), and the owning
  lead/trunk folds the salient events into the log when it reads those artifacts. Treat
  `ledger.md` as trunk/lead-owned coordination state, not a free-for-all append target --
  the progress files are where concurrent writers go.
- **`progress/<agent>.md` -- exactly one writer.** The agent named in the filename is
  the only writer. Other agents may read it; none may write it. This is how a parent
  audits a child without a message round-trip.
- **`findings/` and `briefs/` -- one file per artifact, never a shared file.** Each
  reviewer/finding/brief gets its own path. No two writers share a file, so writes
  never collide. The lead aggregates by READING the directory, not by having
  children co-write one file.
- **`lessons-staging/` -- one file per candidate.** Each harvester drops distinct
  candidate files; the curator is the single reader/consumer.

Parents read these artifacts directly. A lead reads its children's `findings/`,
`briefs/`, and `progress/` files for anything load-bearing -- it does not extract
facts from a child's final-message prose (invariant 3).

## Lifecycle and retention

- **`docs/runs/` IS committed.** It is the run's audit trail and the basis for
  resumability: a halted run can be resumed from its ledger, and a user can watch a
  run live by tailing `ledger.md`. Committing it is deliberate, not accidental
  exhaust. (It is also a protected artifact -- AGENTS.md section 5 -- so no agent may
  delete or gitignore it.)
- **`lessons-staging/` is the one transient area.** It holds candidates between
  harvest and promotion. The knowledge curator reads each candidate, promotes
  the keepers into `docs/solutions/` (stripping `status: candidate`), and empties the
  staging dir. Everything else under `docs/runs/<run-id>/` persists indefinitely.
- A fresh run dir is seeded with `.gitkeep` files in the empty subdirs so the layout
  commits even before artifacts land.

## ledger.md template

A fresh `ledger.md` looks like this (the scaffolder seeds it; fill the placeholders):

```
# Run 2026-06-10-001-add-oauth-login

## Objective

<one paragraph: what this run is trying to achieve and the done condition>

## Plan

Plan ref: docs/plans/2026-06-10-001-feat-add-oauth-login-plan.md
(or "none -- ad hoc run" if there is no plan doc)

## Facts / Context

- <durable fact discovered or supplied: a path, a constraint, a decision>
- <one fact per line; append as facts are established; do not delete>

## Units

| unit | owner (lead)    | status      | artifact                          |
|------|-----------------|-------------|-----------------------------------|
| U1   | bn-review-lead  | pending     | findings/                         |
| U2   | trunk           | in-progress | briefs/research-brief.md          |

Statuses: pending | in-progress | blocked | done | abandoned

## Log

- 2026-06-10T14:02:11Z trunk: opened run; objective set
- 2026-06-10T14:05:40Z bn-review-lead: envelope echoed to progress/bn-review-lead.md
- 2026-06-10T14:31:09Z bn-review-lead: U1 done; 3 findings written, 2 fixed

## Open questions

- <unresolved question that blocks or risks the run; remove when answered>
```

Notes on the template:

- `# Run <id>` -- the heading is the run ID exactly.
- `## Units` table columns are `unit | owner (lead) | status | artifact`. `owner` is
  the single writer of that row. `artifact` points at the file or dir holding the
  unit's output (a `findings/` dir, a `briefs/<name>.md`, etc.).
- Statuses are exactly: `pending`, `in-progress`, `blocked`, `done`, `abandoned`.
- `## Log` lines are `- <ISO8601> <agent>: <event>` -- append only.
- `## Open questions` is a living list: add when blocked, remove when resolved.

## How a run flows

1. **Trunk opens the run.** It runs the scaffolder (or does the manual fallback in
   the bn-conventions skill), writes the `## Objective`, sets the `## Plan` ref, and
   appends the opening line to `## Log`.
2. **Trunk dispatches leads** with delegation envelopes (see `references/envelope.md`).
   Each lead's envelope names its artifact paths under this run dir.
3. **Each lead echoes its envelope** into `progress/<lead>.md` on start, so its
   budget and boundaries are auditable from the ledger without asking the lead.
4. **Leads (and their children) write artifacts** under `findings/` and `briefs/` --
   one file per artifact, never a shared file. Leads aggregate by reading those dirs.
5. **The owning lead updates its unit's row** in the `## Units` table (single-writer)
   and **appends** an event line to `## Log` as the unit advances.
6. **Before returning, each lead spawns a harvester** that drops candidate lessons
   into `lessons-staging/` (fractal compounding). The lead never edits another
   lead's progress file or another unit's status row.
7. **Later, the curator** consumes `lessons-staging/`, promotes keepers to
   `docs/solutions/`, and empties staging. The rest of the run dir is committed and
   kept as the permanent record.

The whole point: the next agent -- a resumed trunk, a parent reading a child, a user
tailing the file -- reconstructs run state from these files alone, never from a
chain of lossy summaries.
