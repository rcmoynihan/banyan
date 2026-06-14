# Run ledger: .banyan/runs/<run-id>/ (Banyan's stigmergic substrate)

Every Banyan run writes to one directory under `.banyan/runs/` in the *target repo*
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
.banyan/runs/<run-id>/
  ledger.md            # task ledger: objective, plan ref, facts, unit-status table, append-only log
  residuals.md         # grow trunk-owned unresolved state after exhausted recovery
  progress/<agent>.md  # per-subtree progress notes (one writer per file)
  findings/            # review findings JSON, one file per reviewer/finding
  briefs/              # research briefs, plan-judge outputs, direct-work specs
  lessons-staging/     # harvested candidate lessons (consumed by the curator)
  <report>.md          # a lead's single final report at the run root (see below)
```

Run-root **report** artifacts (one per lead/phase, written by the owning lead or trunk as its
single synthesized output, and read by the trunk / `/bn-grow` gates — invariant 3, artifacts over
prose):

- `review-verdict.md`     -- the review subtree's read-only findings report (`bn-review-lead`; nothing applied).
- `delivery-report.md`    -- the delivery subtree's outcome (`bn-delivery-lead`).
- `curation-summary.md`   -- the curator's consolidation summary (`bn-knowledge-curator`).
- `debug-diagnosis.md`    -- the debug subtree's diagnosis (`bn-debug-lead`, investigate mode).
- `debug-fix-report.md`   -- the debug subtree's fix outcome (`bn-debug-lead`, fix mode).
- `onboarding-report.md`  -- the onboarding outcome (`/bn-onboard` trunk).
- `residuals.md`          -- grow trunk-owned unresolved blockers after bounded recovery is
  exhausted. This file is present only when an autonomous grow run exits before the ship gate.

(The research subtree's report is a brief, so it lives under `briefs/research-brief.md`, not the
run root.) Each report is single-writer (the named lead or trunk). A `/bn-grow` phase gate is "the
next report file exists + its content passes the gate" — so these run-root files are a defined part
of the layout, not ad-hoc.

- `ledger.md` is the run's spine: objective, plan reference, durable facts, the
  unit-status table, and an append-only event log. One file per run.
- `progress/<agent>.md` is a per-subtree scratch + audit note. The filename is the
  agent that owns it (e.g. `progress/bn-review-lead.md`). On start, a lead echoes
  its delegation envelope here so budget/boundary violations are auditable.
- `findings/` holds one file per review finding (schema-valid JSON; see
  `schemas/findings-schema.json`). Reviewers write here; the lead reads them.
- `briefs/` holds one file per distilled artifact: a research brief, a plan-judge
  score sheet, a synthesis, or a direct-work spec. One artifact = one file.
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
- **`residuals.md` -- grow trunk only.** Child leads and leaves never write this file. They
  expose blocked reasons and next safe actions in their own artifacts; the grow trunk reads
  those artifacts and writes the single residual summary when recovery is exhausted.
- **`consults/chains/<logical-unit>.json` -- folded by the owning lead/trunk only.** Like the
  `## Log`, the continuation-chain index for a logical unit is coordination state written by a
  **single writer** -- the lead (or trunk) that drives that logical unit's consult loop. Asks
  (`consults/asks/`) and answers (`consults/answers/`) are one-file-per-artifact (the asker writes
  its ask; the answering lead writes its answer; writes never collide), but the **chain index** that
  ties them into one reconstructable logical unit is folded by the driving lead/trunk as each
  physical child returns -- never co-written by the children. See `## Consult artifacts` below.

Parents read these artifacts directly. A lead reads its children's `findings/`,
`briefs/`, and `progress/` files for anything load-bearing -- it does not extract
facts from a child's final-message prose (invariant 3).

## Liveness heartbeat

A long-running subtree is invisible from outside until it returns — invariant 3 gives a child no
upward channel mid-work — so a healthy-but-slow deep agent is indistinguishable from a hung one.
To close that gap, every lead and worker appends a one-line heartbeat to a single shared,
tailable file at each significant step (spawn, phase start, tests run, mini-review start/done,
commit, return):

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/heartbeat.mjs <run-dir> <actor> "<one line>"
```

- One file per run: `<run-dir>/activity.log`, append-only, `<ISO-8601>\t<actor>\t<message>`.
- Use the **absolute** run-dir path carried in the envelope, so agents in isolated worktrees write
  to the one canonical log rather than a per-worktree copy.
- This is a write to shared run state, not an upward return, so it does not violate invariant 3.
- A heartbeat must never break the work it reports: the helper exits 0 even if the append fails.
- Observe with `tail -f <run-dir>/activity.log`. The log distinguishes the two failure modes:
  recent lines from anywhere in the tree mean it is alive (a slow deep review is normal); **no new
  line tree-wide for several minutes means suspect a real hang**, not slow progress.

## Consult artifacts

The recursive consult-upward loop (redispatch — see `references/consult-protocol.md`) writes its
artifacts under a `consults/` subtree of the run dir, seeded from scaffold time by
`scripts/new-run.mjs` so no consult artifact is ever un-housed (un-auditable):

```
.banyan/runs/<run-id>/
  consults/
    asks/<ask_id>.json            # bounded asks written by askers (schemas/consult-ask.schema.json)
    answers/<answer_id>.json       # answers written by answering leads (schemas/consult-answer.schema.json)
    chains/<logical-unit>.json     # continuation-chain index per logical unit (schemas/consult-chain.schema.json)
    absorbed/answer-absorbed-<id>.json # continuation's answer-absorbed note: restated answer + plan delta (R10 fresh-witness proof; a produced_artifact in consult-chain.schema.json)
    aborts/<id>.json               # thrash/cost abort records (U5; rides the existing blocked path)
    metrics/                       # per-run consult metric roll-up (U13/R29 writes here)
```

(`consults/metrics/` is seeded at scaffold time alongside `asks/`, `answers/`, `chains/`,
`absorbed/`, and `aborts/`; the deferred U13 roll-up (R29) only *writes into* that
already-scaffolded dir, it does not create it.)

**The three artifact families:**

- **ask** -- a single asker's bounded, strong brief: the blocking question, the asker's
  recommendation, the alternatives, evidence lines with file/tool refs, a classification proof
  (goal/intent vs local), what would change the recommendation, and the U2 transcript pointer to the
  asker's own transcript (R14). One file per ask; the asker writes it.
- **answer** -- the answering lead's response, written from the ask alone after the required
  goal-recheck, carrying a basis, decision owner, and scope (R8/R24). One file per answer; the
  answering lead writes it.
- **chain** -- the continuation-chain index for one **logical unit**: a chain of physical children,
  each entry linking to its predecessor, the ask it raised, the answer id it acted on, the artifact
  it produced, and the files it touched (R23). This is what makes one logical unit reconstructable
  from files alone, proven executably by `scripts/check-consult-chain.mjs`.

**Per-child attribution rule (R23).** One logical unit spans many physical children (the original
asker, then one or more same-type continuations). **Each physical child contributes one chain
entry** attributing exactly its own work: its `physical_agent_id`, its direct
`predecessor_agent_id`, the `input_ask_id` it raised (if any), the `acted_on_answer_id` it absorbed
(every continuation has one), its `produced_artifact`, its `files_touched`, and the transcript
pointer to its own transcript. No child's entry claims another child's work; the chain is the
disjoint union of per-child attributions. The chain index itself is **folded by the owning
lead/trunk only** (see the `consults/chains/...` Writer rules entry above): the children return
their per-child facts as artifacts, and the driving lead/trunk records them into the chain as each
child completes -- the children never co-write the chain file.

## Lifecycle and retention

- **`.banyan/runs/` is local run state.** It is the run's audit trail and the basis for
  resumability while the working tree is active: a halted run can be resumed from its
  ledger, and a user can watch a run live by tailing `ledger.md`. Repositories normally
  gitignore raw run directories.
- **Durable knowledge is promoted.** Lessons worth keeping are curated into
  `.banyan/solutions/`; plans, decisions, fixtures, eval goldens, and examples live in their
  explicit project locations instead of raw run directories.
- **`lessons-staging/` is curator feedstock.** It holds candidates between harvest and
  promotion. The knowledge curator reads each candidate, promotes the keepers into
  `.banyan/solutions/` (stripping `status: candidate`), and empties the staging dir.

## ledger.md template

A fresh `ledger.md` looks like this (the scaffolder seeds it; fill the placeholders):

```
# Run 2026-06-10-001-add-oauth-login

## Objective

<one paragraph: what this run is trying to achieve and the done condition>

## Plan

Plan ref: .banyan/plans/2026-06-10-001-feat-add-oauth-login-plan.md
(or "none -- direct work spec .banyan/runs/<run-id>/briefs/direct-work-plan.md" for
`/bn-work` direct mode, or "none -- ad hoc run" for non-delivery runs)

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
- 2026-06-10T14:31:09Z bn-review-lead: U1 done; 3 findings written (read-only report)

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

## residuals.md template

`residuals.md` exists only for a grow run that has exhausted bounded recovery before the ship
gate. The grow trunk writes it once when exiting early and updates it when resuming the same run.
Use this structure:

```markdown
# Residuals -- <run-id>

**Status:** active | resolved
**Phase:** intake | research | spec-stress | plan | deliver | review | ship-gate
**Resume from:** <phase name and owning skill/lead>

## Blockers

- R1. <short blocker title>
  - **Class:** permission-cliff | no-safe-default | missing-external-authority |
    unsafe-working-tree | recovery-exhausted
  - **Evidence:** <artifact path and section/line if available>
  - **Recovery attempted:** <attempts made, with artifact paths>
  - **Next safe action:** <what a resumed trunk or user should do>

## Terminal decisions

The consult-loop `/bn-grow` carve-out (R25): the topmost grow answering layer **decides** one rung
below the human rather than escalating mid-run, recording each terminal decision here. A
terminal-decision entry is a decision made and recorded for later review — **not** a hard-stop. The
narrow hard-stop class (R26) is recorded under **Blockers** instead, using `Class: no-safe-default`
(R26a — irreversible / high-blast-radius product decision with no defensible default) or
`Class: missing-external-authority` (R26b — work blocked on access wholly outside the agent, e.g.
secrets/credentials/vendor state).

- TD1. <short decision title>
  - **Assumption decided:** <the call made, in one sentence>
  - **Alternatives rejected:** <the options considered and why not>
  - **Blast radius:** <what this affects>
  - **Reversibility:** reversible | hard-to-reverse | irreversible
  - **Files likely affected:** <paths or "none yet">
  - **Recorded from consult:** <consults/answers/<answer_id>.json, or "n/a">

## Safe assumptions already made

- <assumption and where it was recorded, or "none">

## Resume notes

- <phase-specific state needed to resume, or "none">
```

When writing `residuals.md`, the grow trunk also appends one `## Log` line and adds or updates one
`## Open questions` bullet that points at `.banyan/runs/<run-id>/residuals.md`. On resume, the trunk
reads `ledger.md`, `residuals.md`, and the evidence artifacts before choosing the resume phase. When
the residual is resolved, mark `**Status:** resolved`, append the resolution to `## Resume notes`,
remove or rewrite the matching `## Open questions` bullet, and continue the run.

## Artifact-backed re-entry

User decisions are represented as artifacts, not as in-memory pauses. A lead that needs user
authority writes its blocker state into its report or progress file, returns `needs-user` with
that path, and stops. The trunk reads the artifact, asks the user, then spawns a fresh lead with
the same run ID and the answer as resume context. The resumed lead reconstructs state from
`ledger.md`, its report/progress files, and any phase artifacts before writing the durable
resolution.

`AskUserQuestion` is trunk-only. Leads and leaves do not assume a user-question tool is
available, and background nested agents treat user interaction as unavailable. Sparse boundary
touchpoints are valid trunk work: intake before dispatch, approval after a gate artifact, and
permission-cliff decisions.

## How a run flows

1. **The owning trunk or procedure lead opens the run.** It runs the scaffolder (or does the
   manual fallback in the bn-conventions skill), writes the `## Objective`, sets the `## Plan`
   ref, and appends the opening line to `## Log`.
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
   `.banyan/solutions/`, and empties staging. The rest of the run dir stays local run
   state unless the user explicitly exports specific artifacts elsewhere.

The whole point: the next agent -- a resumed trunk, a parent reading a child, a user
tailing the file -- reconstructs run state from these files alone, never from a
chain of lossy summaries.
