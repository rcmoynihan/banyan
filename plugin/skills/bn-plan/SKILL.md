---
name: bn-plan
description: "Produce a v1-compatible implementation plan. For standard/deep efforts, generate 2-3 approach drafts with different priors, score them with a cheap judge panel, and synthesize the winner; lightweight efforts draft directly. Reads a requirements document and research brief when present. Use to turn a feature/task description, requirements doc, or research brief into a plan doc with stable U-IDs."
argument-hint: "[feature/task description | path to requirements doc | path to research brief]"
---

# bn-plan

The trunk's planning procedure. The TRUNK is the **single writer of the plan** (invariant 2)
— there is no plan-lead agent. This skill has the trunk orchestrate a panel directly: spawn
approach **generators** with different priors, score their drafts with a **judge panel**,
then the trunk **synthesizes the winner and writes the plan itself**. Independent judges
provide the external signal a plan needs — an agent rereading its own draft does not.

Lightweight efforts **skip the panel entirely** — the trunk drafts directly. The effort
classification *must* change the spawn count (0 vs. 5+), and that is observable in the ledger.

Read `skills/bn-conventions/references/envelope.md`,
`skills/bn-conventions/references/ledger.md`, and `AGENTS.md` §5 (protected artifacts).
The trunk produces and consumes these artifacts.

## Step 1 — Inputs and grounding

Take the argument as the **task** (a feature/task description), a **path to a requirements
document** (`docs/brainstorms/*-requirements.md`), OR a **path to a research brief**
(`docs/runs/<run-id>/briefs/*.md`). Then:

- **Resolve the primary input.** If the argument is a requirements document path, READ it in
  full and use it as the scope authority. If it has a non-empty `Resolve Before Planning`
  section or equivalent planning blocker, STOP and surface those blockers. If the argument is
  a research brief path, READ it as the initial research grounding. Otherwise treat the
  argument as the task description.
- **Locate the run.** If you are already in a run (this skill was reached from `/bn-grow` or a
  prior step), reuse that run dir. If the argument path is under `docs/runs/<run-id>/`, reuse
  that run dir. Otherwise open one via the scaffolder (see `bn-conventions`):
  ```
  node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs plan-<slug> --root <repo-root>
  ```
  Capture the printed run ID and absolute run dir. Fill `ledger.md`'s `## Objective` (produce
  a plan for this task), set the `## Plan` ref to the plan path you will write, and append the
  opening `## Log` line. Add a `U1 | trunk | in-progress | docs/plans/<...>-plan.md` row.
- **Find the research grounding.** If the argument was a brief path, use it as the research
  brief. Otherwise look for `docs/runs/<run-id>/briefs/research-brief.md` (written by
  `bn-research-lead`). READ it if it exists — it is the factual grounding for the plan. If a
  requirements document references `docs/runs/<run-id>/briefs/brainstorm-grounding.md` or
  another `docs/runs/*/briefs/*.md` grounding path, READ that as supplemental grounding. If no
  brief exists, note "no brief — planning from task/requirements + repo" in the ledger; the
  generators will do a light grounding pass themselves.
- **Detect repo facts for the envelopes:** the repo root (`git rev-parse --show-toplevel`) and
  the test command (`package.json scripts.test`, else `node --test` / `pytest` / `cargo test`
  / `go test ./...`). Record what you found.

## Step 2 — Effort classification (the spawn dial)

Classify the effort by task size and risk; this **decides whether the panel runs**:

- **`lightweight`** — small, well-understood, low-risk (a one-file helper, a config change, a
  task fully specified by a thorough brief). **Skip the panel.** The trunk drafts the plan
  directly and goes to **Step 5**. Spawn count for planning: **0**.
- **`standard`** — a normal feature with real decomposition. Run the panel with **2
  generators** (priors `mvp-first`, `risk-first`) + **3 judges**.
- **`deep`** — large, cross-cutting, or high-risk (touches auth/payments/migrations, or the
  brief surfaced contradictions/unknowns). Run the panel with **3 generators** (`mvp-first`,
  `risk-first`, `ops-first`) + **3 judges**.

Record the chosen `effort_class` in the ledger **before spawning**, so the spawn count is
auditable. The rule that must hold: a `lightweight` plan spawns strictly fewer agents than
`standard`, and `standard` no more than `deep`. If effort does not change the spawn count, it
is not being honored.

## Step 3 — Generator panel (spawn in parallel)

Spawn the generators **in parallel** (one message, multiple `Agent` calls), each a
`bn-plan-generator` carrying a **different prior**. Each runs at the model pinned in its
frontmatter (invariant 7 — the envelope carries no model field). For each generator embed
this envelope verbatim, filling the prior and the draft path:

```
=== BANYAN ENVELOPE ===
objective:       Draft a full v1-compatible implementation plan for the task, biased by
                 your assigned prior.
artifact_path:   docs/runs/<run-id>/briefs/plan-draft-<prior>.md
output_format:   A v1-compatible plan: ## Requirements (tagged R-IDs: [confirmed] or
                 [assumed] with inline (confirm by: ...) clauses); ## Implementation Units with stable
                 U-IDs, each with Goal/Dependencies/Files/Approach/Verification;
                 ## Sequencing; ## Verification (whole feature). Design invariants if warranted.
inputs:
  task:            <the task description>
  requirements_doc: <docs/brainstorms/...-requirements.md, or "none">
  prior:           <mvp-first | risk-first | ops-first>   # one per generator
  research_brief:  <docs/runs/.../briefs/research-brief.md, or "none">
  supplemental_grounding: <docs/runs/.../briefs/brainstorm-grounding.md, or "none">
  repo_root:       <repo root>
boundaries:      Read-only against the repo except your one artifact. Do NOT edit source,
                 switch branches, or touch protected artifacts docs/brainstorms, docs/plans,
                 docs/solutions, docs/runs (except your own artifact_path). Never write a
                 sibling generator's draft file. One writer per file set.
tool_guidance:   Read, Grep, Glob and read-only Bash (git, ls) to ground units in real files;
                 Write only to artifact_path. No Agent spawns — you are a leaf.
budget:
  max_children:    0
  depth_remaining: 1
effort_class:    <standard | deep>
=== END ENVELOPE ===
```

- **standard → 2 generators**: priors `mvp-first`, `risk-first`.
- **deep → 3 generators**: priors `mvp-first`, `risk-first`, `ops-first`.

The prior must visibly shape each draft's unit ordering and emphasis (mvp-first = smallest
shippable slice first; risk-first = retire the biggest unknowns first; ops-first =
observability/rollback/migration safety first). Each generator writes a full plan DRAFT to its
`plan-draft-<prior>.md` and returns a verdict plus path.

## Step 4 — Judge panel (spawn in parallel), then pick the winner

When the drafts are written, spawn **3** `bn-plan-judge` agents **in parallel**, each
scoring **ALL** drafts independently (fresh context per judge — that independence is the
PoLL-style panel's whole value). Each runs at the model pinned in its frontmatter
(invariant 7 — the envelope carries no model field). For each judge `<n>` ∈ {1,2,3}:

```
=== BANYAN ENVELOPE ===
objective:       Independently score every candidate plan draft on the rubric and name the
                 strongest draft plus the best idea from each.
artifact_path:   docs/runs/<run-id>/briefs/plan-judge-<n>.md
output_format:   Score sheet: a table scoring each draft 1-5 on feasibility, coherence, scope
                 discipline, verification quality (with one-line justifications) + total, then
                 a one-paragraph comparative verdict (strongest draft; best idea from each;
                 any fatal flaw).
inputs:
  task:            <the task description>
  requirements_doc: <docs/brainstorms/...-requirements.md, or "none">
  draft_paths:     docs/runs/<run-id>/briefs/plan-draft-mvp-first.md, ...-risk-first.md[, ...-ops-first.md]
  research_brief:  <docs/runs/.../briefs/research-brief.md, or "none">
  supplemental_grounding: <docs/runs/.../briefs/brainstorm-grounding.md, or "none">
  repo_root:       <repo root>
boundaries:      Read-only. Do NOT edit source or touch protected artifacts docs/brainstorms,
                 docs/plans, docs/solutions, docs/runs (except your own artifact_path). Never
                 write another judge's or a generator's file.
tool_guidance:   Read, Grep, Glob to read drafts and spot-check named files against the repo;
                 Write only to artifact_path. No Agent spawns — you are a leaf.
budget:
  max_children:    0
  depth_remaining: 1
effort_class:    <standard | deep>
=== END ENVELOPE ===
```

When the judges return, **READ all three `plan-judge-<n>.md` score sheets** (the files, not
the judges' final-message prose — invariant 3). Then:

1. **Pick the winning draft** = the draft with the **highest mean total** across the three
   judges. On a tie, prefer the draft no judge flagged with a fatal flaw; if still tied,
   prefer the higher mean on **verification quality**, then **feasibility**.
2. **Note the graft list** = the "best idea from each draft" the judges named for the
   runner-up drafts, minus any idea a judge flagged as a fatal flaw.

Why opus judges: plan critique is real reasoning, and a weaker model rewards length over
soundness — that corrupts the panel signal (see `bn-plan-judge`). The panel is three
*independent* reads precisely so no single judge's bias decides the plan.

## Step 4.5 — Ground the winning draft against the repo (standard/deep only)

Before synthesizing, the trunk dispatches **one** `bn-plan-checker` to re-run the repo
against the **winning draft's** specific claims and emit a typed, evidence-bearing gap list.
The judges scored the drafts comparatively; the checker does something different — it
*executes* lookups (grep, glob, `git ls-files`, data-flow tracing) against the named files
and units of the one draft that won, and emits only findings each backed by a re-runnable
command. This is the brownfield/shadow-path grounding that otherwise first surfaces at review
time, after code is written.

**Gating (the optionality contract):**

- **Effort:** runs on **`standard` and `deep` only**. **`lightweight` skips it** — the trunk
  drafts directly and never reaches this step, keeping the lightweight spawn count below
  standard.
- **Opt-out / force-on:** a `precheck: on|off` flag (a `/bn-plan` arg or a plan-frontmatter
  setting) overrides the effort default at `standard`/`deep`: `precheck: off` suppresses the
  checker (e.g. a greenfield repo where every `already-exists` check is trivially empty);
  `precheck: on` forces it where some other signal would skip it. The checker runs against the
  panel's **winning draft**, so it has no effect at `lightweight` — which drafts directly and
  produces no winning-draft artifact to check; a lightweight task that needs this grounding
  should be classified `standard`. When suppressed, record `precheck: off` in the ledger and go
  to Step 5.

Dispatch one `bn-plan-checker`. It runs at the model pinned in its frontmatter (invariant 7 —
the envelope carries no model field):

```
=== BANYAN ENVELOPE ===
objective:       Ground every load-bearing claim of the winning plan draft against the real
                 repo and emit a typed, evidence-bearing gap list.
artifact_path:   docs/runs/<run-id>/briefs/plan-check.md
output_format:   A plan-check brief: a typed findings list where each finding is one of
                 already-exists | untraced-path | infeasible-claim and carries a one-line
                 method: naming the re-runnable command/lookup that proves it; plus a
                 ## Unverifiable section for claims with no runnable surface, and a
                 residual line when nothing concrete remained to check.
inputs:
  task:            <the task description>
  requirements_doc: <docs/brainstorms/...-requirements.md, or "none">
  winning_draft_path: docs/runs/<run-id>/briefs/plan-draft-<winning-prior>.md
  graft_list:      <the runner-up ideas the trunk plans to graft, or "none">
  research_brief:  <docs/runs/.../briefs/research-brief.md, or "none">
  supplemental_grounding: <docs/runs/.../briefs/brainstorm-grounding.md, or "none">
  repo_root:       <repo root>
  test_command:    <the detected test command, or "none detected">
boundaries:      Read-only against the repo except your one artifact. Do NOT edit source,
                 switch branches, or touch protected artifacts docs/brainstorms, docs/plans,
                 docs/solutions, docs/runs (except your own artifact_path). Never write a
                 draft, score sheet, or the plan.
tool_guidance:   Read, Grep, Glob and read-only Bash (git grep, git ls-files, ls, dependency
                 lookups) to ground the winning draft's named files/units; Write only to
                 artifact_path. No Agent spawns — you are a leaf.
budget:
  max_children:    0
  depth_remaining: 1
effort_class:    <standard | deep>
=== END ENVELOPE ===
```

When the checker returns, **READ `plan-check.md`** (the file, not the verdict prose —
invariant 3) before writing the plan in Step 5. The checker never blocks: if it had no
runnable surface it returns a typed `## Unverifiable` section, and if the draft was too thin
to ground it returns an empty findings list with a residual note. The trunk folds its
findings into the plan it writes (Step 5).

## Step 5 — Synthesize and write the plan (the trunk is the single writer)

The **TRUNK writes the final plan** — never a child (invariant 2). Compute the plan path:

```
docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md
```

- `YYYY-MM-DD` today; `NNN` the next zero-padded plan sequence for the date (scan
  `docs/plans/` for the highest existing `NNN`, add 1, start at `001`).
- `<type>` ∈ `feat` | `fix` | `refactor` | `chore` | … (conventional-commit style); `<name>`
  kebab-case from the task.

Write the plan in the **v1-compatible structure** (match `docs/plans/*-plan.md` and the
fixture plan):

- A header block (title; `**Date:** … · **Plan ID:** NNN · **Type:** <type> · **Status:** draft`)
  and a short overview.
- A **Source documents** block listing the requirements document, formal research brief, and
  supplemental grounding brief when each exists.
- A **`## Requirements`** section with stable **R-IDs** (`R1`, `R2`, …) — testable
  requirements the plan satisfies. Every R-ID carries `[confirmed]` or `[assumed]`; each
  `[assumed]` requirement includes an inline `(confirm by: ...)` clause.
- **`## Design invariants`** — only if the task warrants standing constraints across units.
- **`## Implementation Units`** — each unit a `### U<N>: <name>` with **stable U-IDs** and the
  v1 fields: **Goal**, **Dependencies** (U-IDs), **Files** (real repo paths, disjoint per unit
  where they could run as parallel worktrees — name any shared-file hazard, invariant 2),
  **Approach**, **Verification** (a concrete runnable check + the test command, tracing to R-IDs).
- **`## Sequencing`** — a dependency diagram/order (what is parallel vs. serial).
- **`## Verification (whole feature)`** — the end-to-end done check.
- Optionally `## Risks` and `## Deferred to follow-up` for deep efforts.

**Synthesize, don't transcribe.** Treat the requirements document as the product/scope
authority when one exists; the research brief grounds feasibility and repo facts. For
standard/deep: build primarily from the **winning
draft**, then **graft the best runner-up ideas** the judges named (Step 4's graft list) — e.g.
adopt the winner's unit decomposition but pull in a runner-up's rollback unit or risk spike.
Keep each requirement's `[confirmed]` or `[assumed]` tag with the R-ID it describes, and
add confirm-by clauses for any assumed requirements introduced by grafted ideas. Requirements
carried from a requirements document are `[confirmed]` unless the document itself marks them
open or conditional. Resolve implementation conflicts in the winner's favor, but do not let a
draft override the requirements document's scope. For **lightweight** (panel skipped): the
trunk drafts the plan directly from the requirements document, brief, and task, same
structure, tagging every trunk-authored R-ID.

**Fold in the plan-check findings (standard/deep, when the checker ran).** Thread each
surviving finding from `plan-check.md` into the plan structure — never leave it only in the
brief:

- **`already-exists`** → drop or narrow the redundant unit, and point its `Files`/`Approach`
  at the existing capability the checker cited instead of rebuilding it.
- **`untraced-path`** → add the missing error/empty/nil-handling work as a unit or a unit
  step, with verification that exercises the path the checker named.
- **`infeasible-claim`** → correct the unit's `Files`/`Approach` to a real path, or — if the
  finding invalidates the winning draft's whole approach — surface it as a blocker to the user
  in Step 6 *before* finalizing. **The plan does not leave `Status: draft` with an unaddressed
  `infeasible-claim`.**
- Anything in the checker's `## Unverifiable` section becomes an `[assumed]` requirement or an
  open question with a `(confirm by: ...)` clause — recorded, not silently dropped.

Then **record provenance in the ledger**: set U1's row to `done` (artifact = the plan path),
and append a `## Log` line noting the plan path, the `effort_class`, and — for standard/deep —
**where the judge score sheets live** (`docs/runs/<run-id>/briefs/plan-judge-*.md`), which
draft won, and — when the checker ran — the plan-check brief
(`docs/runs/<run-id>/briefs/plan-check.md`) with the count of findings folded in. For
lightweight, the log line states the panel was skipped (effort scaling observable in the
ledger); when `precheck: off` suppressed the checker at standard/deep, the log line records
that too.

## Step 6 — Present the plan

Present a **short** summary to the user:

- the plan path;
- the `effort_class`, and — for standard/deep — the winning prior, the judges' mean scores,
  and which runner-up ideas were grafted; for lightweight, that the **panel was skipped** (and
  that this is visible in the ledger);
- the requirements document path when one grounded the plan;
- for standard/deep when the checker ran: how many plan-check findings were folded in, and
  **any `infeasible-claim` that became a surfaced blocker** the user must resolve before the
  plan leaves `Status: draft`; if `precheck: off` suppressed it, say so;
- every `[assumed]` R-ID with its `(confirm by: ...)` clause; if none exist, say there are
  no assumed requirements;
- a one-line pointer to the run dir (`docs/runs/<run-id>/`) for the drafts, score sheets, and
  plan-check brief.

Do not paste the whole plan into the reply — point at the file (invariant 3). Note that the
plan is `Status: draft`; delivery (`/bn-work` or `/bn-grow`) consumes it next.
