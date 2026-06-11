# Banyan

**A hierarchical, self-compounding agent harness for Claude Code, built for nested subagents.**

A banyan tree's branches drop aerial roots that become new trunks — a single tree that grows into a forest. It begins life on a host tree before standing on its own, and it lives for centuries, continuously expanding. That's the project: agents whose branches become trunks (nested subagents, Claude Code ≥ 2.1.172), bootstrapped from the leaf assets of [compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) (MIT), designed for harnesses that outlive any single task and get better with every run.

## Core ideas

- **Subtrees with contracts, not waves.** Lead agents (`bn-review-lead`, `bn-research-lead`, `bn-delivery-lead`) own whole domains and orchestrate their own children; the main session stays a near-empty trunk that talks to the user.
- **Fractal compounding.** Lessons are harvested at the leaves, where context is fresh, and consolidated by a background curator — compounding as metabolism, not a command you remember to run.
- **The ledger is the ground truth.** Coordination happens through files (`docs/runs/<run-id>/`); final messages are verdicts plus paths.
- **Delegation envelopes.** Every spawn carries an objective, an artifact path, boundaries, and a budget (children, model tier, remaining depth).
- **The laws still hold.** Reads parallelize, writes serialize, one writer per file set, decompose on failure rather than eagerly.

## Documents

- [Founding brainstorm](docs/brainstorms/2026-06-10-banyan-v2-brainstorm.md) — the research synthesis and full v2 ideation (verbatim export).
- [Fork vs greenfield decision](docs/decisions/2026-06-10-fork-vs-greenfield.md) — why a new skeleton that harvests v1's leaves.
- [Implementation plan](docs/plans/2026-06-10-001-feat-banyan-core-plan.md) — phased plan with implementation units U1–U16.

## Status

**Implemented — all 8 phases / units U1–U16 built and reviewed.** The plugin is loadable
(`30` agents, `8` skills) and the full `/bn-grow` pipeline is wired end to end.

### What's here

Skills (invoke as `/bn-<name>`):

- `/bn-grow` — the full pipeline: research → plan (judged) → deliver → review → ship gate → background curate, from a small trunk (replaces `/lfg`).
- `/bn-review` — the flagship review subtree: reviews, dedupes, and fixes-and-verifies findings in place, returning an applied verdict (commits on a clean tree, never pushes).
- `/bn-plan` — a plan from a judge panel (prior-biased generators scored by independent judges), v1-compatible output.
- `/bn-work` — execute a plan via worktree-isolated unit subtrees + a single integrator.
- `/bn-curate` — consolidate harvested lessons into `docs/solutions/` (sleep-time compute).
- `/bn-tune` — mine run data for recurring harness failures; propose evidence-cited diffs to Banyan itself (never self-applies).
- `/bn-conventions`, `/bn-hello` — the conventions index and a smoke-test skill.

Agents: three lead subtrees (`bn-review-lead`, `bn-research-lead`, `bn-delivery-lead`) plus
`bn-unit-lead`/`bn-integrator`, the 17 vendored v1 reviewer/researcher personas, the
`bn-finding-owner`/`bn-thread-chaser`/`bn-plan-generator`/`bn-plan-judge` workers, the
`bn-lesson-harvester` + `bn-knowledge-curator` compounding loop, and the `bn-harness-engineer`.

### Verification

- **Live-proven:** the review subtree (U8) ran headlessly end-to-end against the fixture —
  found and fixed all 12 seeded bugs, suite green, safe commit. Nested subagent spawning is
  empirically confirmed in this runtime.
- **The gate (U9):** an A/B vs `/ce-code-review`, replicated over an advertised and a fair
  de-advertised run, gave a **qualified GO** — detection parity, applied-and-verified fixes
  from a ~7–8× smaller trunk footprint, at comparable cost. See
  [`eval/review-ab/results/SCORECARD.md`](eval/review-ab/results/SCORECARD.md).
- **Every phase** passed an independent Codex review before commit; the remaining
  subtrees are static- + Codex-verified, with their full live runs (research two-hop trail,
  delivery worktrees, harvest→curate cycle, end-to-end `/bn-grow`, the harness-engineer on
  ≥5 accumulated runs) documented as the natural next-step verifications.

### Try it

```
# add Banyan as a local marketplace, then enable it
claude plugin marketplace add <path-to-this-repo>
# or, for development against the fixture:
pwsh scripts/smoke.ps1        # builds the fixture sandbox, installs the plugin, runs /bn-hello
```
