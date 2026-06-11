---
name: bn-plan
description: "Produce a v1-compatible implementation plan. For standard/deep efforts, generate 2-3 approach drafts with different priors, score them with a cheap judge panel, and synthesize the winner; lightweight efforts draft directly. Reads a research brief if one exists. Use to turn a feature/task description (or a research brief) into a plan doc with stable U-IDs."
argument-hint: "[feature/task description | path to a research brief]"
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

Take the argument as the **task** (a feature/task description) OR a **path to a research
brief**. Then:

- **Locate the run.** If you are already in a run (this skill was reached from `/bn-grow` or a
  prior step), reuse that run dir. Otherwise open one via the scaffolder (see
  `bn-conventions`):
  ```
  node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs plan-<slug> --root <repo-root>
  ```
  Capture the printed run ID and absolute run dir. Fill `ledger.md`'s `## Objective` (produce
  a plan for this task), set the `## Plan` ref to the plan path you will write, and append the
  opening `## Log` line. Add a `U1 | trunk | in-progress | docs/plans/<...>-plan.md` row.
- **Find the research brief.** If the argument was a brief path, use it. Otherwise look for
  `docs/runs/<run-id>/briefs/research-brief.md` (written by `bn-research-lead`). READ it if it
  exists — it is the factual grounding for the plan. If none exists, note "no brief — planning
  from task + repo" in the ledger; the generators will do a light grounding pass themselves.
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

Spawn the generators **in parallel** (one message, multiple `Agent` calls), each
`bn-plan-generator` at `model: sonnet`, each carrying a **different prior**. For each
generator embed this envelope verbatim, filling the prior and the draft path:

```
=== BANYAN ENVELOPE ===
objective:       Draft a full v1-compatible implementation plan for the task, biased by
                 your assigned prior.
artifact_path:   docs/runs/<run-id>/briefs/plan-draft-<prior>.md
output_format:   A v1-compatible plan: ## Requirements (R-IDs); ## Implementation Units with
                 stable U-IDs, each with Goal/Dependencies/Files/Approach/Verification;
                 ## Sequencing; ## Verification (whole feature). Design invariants if warranted.
inputs:
  task:            <the task description>
  prior:           <mvp-first | risk-first | ops-first>   # one per generator
  research_brief:  docs/runs/<run-id>/briefs/research-brief.md   (or "none")
  repo_root:       <repo root>
boundaries:      Read-only against the repo except your one artifact. Do NOT edit source,
                 switch branches, or touch protected artifacts docs/brainstorms, docs/plans,
                 docs/solutions, docs/runs (except your own artifact_path). Never write a
                 sibling generator's draft file. One writer per file set.
tool_guidance:   Read, Grep, Glob and read-only Bash (git, ls) to ground units in real files;
                 Write only to artifact_path. No Agent spawns — you are a leaf.
budget:
  max_children:    0
  model_tier:      sonnet
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

When the drafts are written, spawn **3** `bn-plan-judge` agents **in parallel**, each at
`model: sonnet`, each scoring **ALL** drafts independently (fresh context per judge — that
independence is the PoLL-style panel's whole value). For each judge `<n>` ∈ {1,2,3}:

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
  draft_paths:     docs/runs/<run-id>/briefs/plan-draft-mvp-first.md, ...-risk-first.md[, ...-ops-first.md]
  research_brief:  docs/runs/<run-id>/briefs/research-brief.md   (or "none")
  repo_root:       <repo root>
boundaries:      Read-only. Do NOT edit source or touch protected artifacts docs/brainstorms,
                 docs/plans, docs/solutions, docs/runs (except your own artifact_path). Never
                 write another judge's or a generator's file.
tool_guidance:   Read, Grep, Glob to read drafts and spot-check named files against the repo;
                 Write only to artifact_path. No Agent spawns — you are a leaf.
budget:
  max_children:    0
  model_tier:      sonnet
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

Why sonnet judges, not haiku: plan critique is real reasoning, and haiku rewards length over
soundness — that corrupts the panel signal (see `bn-plan-judge`). The panel is three
*independent* reads precisely so no single judge's bias decides the plan.

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
- A **`## Requirements`** section with stable **R-IDs** (`R1`, `R2`, …) — testable
  requirements the plan satisfies.
- **`## Design invariants`** — only if the task warrants standing constraints across units.
- **`## Implementation Units`** — each unit a `### U<N>: <name>` with **stable U-IDs** and the
  v1 fields: **Goal**, **Dependencies** (U-IDs), **Files** (real repo paths, disjoint per unit
  where they could run as parallel worktrees — name any shared-file hazard, invariant 2),
  **Approach**, **Verification** (a concrete runnable check + the test command, tracing to R-IDs).
- **`## Sequencing`** — a dependency diagram/order (what is parallel vs. serial).
- **`## Verification (whole feature)`** — the end-to-end done check.
- Optionally `## Risks` and `## Deferred to follow-up` for deep efforts.

**Synthesize, don't transcribe.** For standard/deep: build primarily from the **winning
draft**, then **graft the best runner-up ideas** the judges named (Step 4's graft list) — e.g.
adopt the winner's unit decomposition but pull in a runner-up's rollback unit or risk spike.
Resolve any conflict in the winner's favor. For **lightweight** (panel skipped): the trunk
drafts the plan directly from the brief + task, same structure.

Then **record provenance in the ledger**: set U1's row to `done` (artifact = the plan path),
and append a `## Log` line noting the plan path, the `effort_class`, and — for standard/deep —
**where the judge score sheets live** (`docs/runs/<run-id>/briefs/plan-judge-*.md`) and which
draft won. For lightweight, the log line states the panel was skipped (effort scaling
observable in the ledger).

## Step 6 — Present the plan

Present a **short** summary to the user:

- the plan path;
- the `effort_class`, and — for standard/deep — the winning prior, the judges' mean scores,
  and which runner-up ideas were grafted; for lightweight, that the **panel was skipped** (and
  that this is visible in the ledger);
- a one-line pointer to the run dir (`docs/runs/<run-id>/`) for the drafts and score sheets.

Do not paste the whole plan into the reply — point at the file (invariant 3). Note that the
plan is `Status: draft`; delivery (`/bn-work` or `/bn-grow`) consumes it next.
