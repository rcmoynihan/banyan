# Banyan — agent & skill conventions

Banyan is a Claude Code plugin: a hierarchical, self-compounding agent harness built for
**nested subagents** (Claude Code ≥ 2.1.172, depth 5). Instead of hub-and-spoke
orchestration of a flat agent fleet, it uses **lead agents that own whole subtrees**, a
**file-based run ledger**, **delegation envelopes with budgets**, and **fractal lesson
harvesting**.

This file is the standing contract for everything under `plugin/`. Every Banyan agent and
skill must obey it. It is also the project-standards source the review subtree reads.

---

## 1. The eight invariants

These hold for every agent, skill, and spawn in Banyan.

1. **Context-centric decomposition.** A new agent layer exists only for a *context* reason:
   disjoint reading, isolated writing, or fresh-context judging. Never for role-play. There is
   no PM-agent talking to an architect-agent talking to an engineer-agent. "Department" is a
   metaphor for ownership and accountability, not a screenplay.
2. **One writer per file set.** Reads parallelize; writes serialize within a subtree. Parallel
   writers exist only across disjoint git worktrees, merged by their parent. Each lead is the
   single-threaded writer for its domain.
3. **Artifacts over prose.** Every delegation names an output artifact path. A child's only
   channel back to its parent is its final message, so that message is a **verdict plus paths** —
   never the payload. Parents read artifacts, not summaries. (At depth 5 a
   summary-of-a-summary-of-a-summary is the telephone game; the filesystem is the ground truth.)
4. **Decompose on failure, not eagerly.** Default depth is 1–2. Depth 3–5 is *reserve capacity*
   triggered by failure or context pressure, not spent preemptively. Most tasks stay shallow.
5. **Budgets are explicit.** Every spawn carries a delegation envelope (objective, artifact path,
   output format, boundaries, tool guidance, and a budget of `max_children` / `model_tier` /
   `depth_remaining`). See `skills/bn-conventions/references/envelope.md`.
6. **Permission cliff.** Background nested agents auto-deny permission prompts. Pushes,
   migrations, deletions, and anything prompt-worthy stay at **trunk level** or run foreground.
   A lead deep in the tree must **report the need upward**, never silently fail against it.
7. **Model tiering.** Strong model at the trunk and leads; Sonnet-class mid-tree workers;
   Haiku-class harvesters and scouts. Declared per-agent via `model:` frontmatter, and re-stated
   per-spawn via the envelope's `model_tier`.
8. **v1 persistence compatibility.** Banyan reads and writes the compound-engineering
   `docs/solutions/` knowledge-store schema unchanged, so existing knowledge stores keep working.
   See `skills/bn-conventions/references/knowledge-store.md`.

---

## 2. The org chart is declared, not prompted

Who may spawn whom is encoded in each agent's `tools:` frontmatter via the `Agent(...)` allowlist,
**not** described in prose. A lead's allowlist *is* its team roster.

```yaml
# bn-review-lead.md frontmatter (illustrative)
tools: Read, Grep, Glob, Bash, Write, Agent(bn-correctness-reviewer, bn-testing-reviewer, bn-finding-owner)
```

Rules:

- A lead lists exactly the child agent types it is allowed to spawn. Nothing else is reachable.
- Shared dispatch policy (reviewer-selection matrix, effort scaling, dedup rules) lives **once**,
  in the lead's own system prompt — never copy-pasted across skill `references/` files.
- `depth_remaining` in the envelope, not the allowlist, bounds *how deep* a chain may go. The
  allowlist bounds *which* types are reachable; the envelope bounds *how many* and *how deep*.

> **Empirical note (verify before relying):** `Agent(agent_type)` allowlist semantics in *nested*
> contexts are under-documented for 2.1.172. If the harness ignores a nested allowlist,
> depth/child accounting falls back to the prompt-level contract in the envelope.

---

## 3. Naming & layout

- **Namespace prefix:** every agent, skill, and command is `bn-…`. Skills are invoked as
  `/bn-<name>`; agents are spawned by type name `bn-<name>`.
- **Plugin root** is this directory's parent (`plugin/`). Components live in standard locations:
  - `plugin/agents/bn-*.md` — one agent per file.
  - `plugin/skills/bn-*/SKILL.md` — one skill per directory, with optional `references/`,
    `scripts/`, `assets/` subdirectories (same convention as compound-engineering).
  - `plugin/schemas/` — vendored/shared schema files (e.g. findings schema, solution frontmatter).
  - `plugin/AGENTS.md` — this file.
- **Run artifacts** live in the *target repo*, not the plugin: `docs/runs/<run-id>/`
  (see `skills/bn-conventions/references/ledger.md`). Knowledge lives in `docs/solutions/`.

### Agent file frontmatter

```yaml
---
name: bn-correctness-reviewer        # must equal the filename stem
description: <one line; when to use this agent — read by the dispatcher>
model: inherit                       # inherit | opus | sonnet | haiku  (see §1.7 tiering)
tools: Read, Grep, Glob, Bash, Write # least privilege; add Agent(...) only for leads
color: blue                          # optional, cosmetic
---
```

- `name` **must** match the filename (`bn-correctness-reviewer.md` → `name: bn-correctness-reviewer`).
- `tools` is least-privilege. Reviewers and scouts are read-mostly (`Read, Grep, Glob, Bash`, plus
  `Write` only to their own artifact path). Only **leads** and recursive workers carry `Agent(...)`.
- `model: inherit` means "run at the session's model." Use an explicit tier (`sonnet`, `haiku`)
  only to *step down* from the trunk per invariant 7.

### Skill file frontmatter

```yaml
---
name: bn-review
description: "<when to use; what it does — read by the skill dispatcher>"
argument-hint: "[optional args]"
---
```

---

## 4. The lead pattern

A **lead** is an agent that owns a subtree end-to-end and returns a verdict, not a report.

- A lead receives a delegation envelope, **echoes it into its progress file** on start
  (`docs/runs/<run-id>/progress/<lead>.md`) so violations are auditable from the ledger, then
  runs its own multi-stage orchestration internally.
- A lead **reads its children's artifacts**; it does not trust their final-message prose for
  anything load-bearing.
- A lead honors its budget: it spawns at most `max_children` **discretionary** children, steps
  the model down per `model_tier`, and decrements `depth_remaining` on every spawn. At
  `depth_remaining: 0` it completes the work inline instead of delegating.
- A lead **never edits files outside the scope it owns**, and where multiple children write, it
  partitions their file sets so no two children touch the same files (invariant 2).
- Before returning — on **every** exit path, including a trivial/zero-spawn fast return — a lead
  spawns one **`bn-lesson-harvester`** over its still-fresh context to stage candidate lessons
  (fractal compounding). This harvest is a **mandatory finalization spawn**: it is a
  single fixed Haiku-class leaf that does **not** count against `max_children` (it must never
  compete with real work for the cap), and it must not block or alter the lead's verdict —
  harvest, then return.

The three core leads are `bn-review-lead`, `bn-research-lead`, and `bn-delivery-lead`. The
main session stays a near-empty **trunk** that talks to the user, holds intent, and
dispatches leads.

---

## 5. Protected artifacts

No agent may act on (delete, gitignore, "clean up") files under these paths — they are the
harness's own memory:

- `docs/brainstorms/*`
- `docs/plans/*.md`
- `docs/solutions/*.md`
- `docs/runs/*`

A reviewer that flags one of these for removal has its finding discarded during synthesis.

---

## 6. Pointers

- Run ledger spec & layout → `skills/bn-conventions/references/ledger.md`
- Delegation envelope spec & template → `skills/bn-conventions/references/envelope.md`
- Knowledge-store (docs/solutions) schema, v1-compatible → `skills/bn-conventions/references/knowledge-store.md`
- Findings schema (code review) → `schemas/findings-schema.json`
- Vendoring provenance & local-edit log → `../vendor/MANIFEST.md`
