# Banyan

**A hierarchical, self-compounding agent harness for Claude Code, built for nested subagents.**

A banyan tree's branches drop aerial roots that become new trunks — a single tree that grows into a forest. It begins life on a host tree before standing on its own, and it lives for centuries, continuously expanding. That's the project: agents whose branches become trunks (nested subagents, Claude Code ≥ 2.1.172), bootstrapped from the leaf assets of [compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) (MIT), designed for harnesses that outlive any single task and get better with every run.

## Core ideas

- **Subtrees with contracts, not waves.** Lead agents (`bn-review-lead`, `bn-research-lead`, `bn-delivery-lead`) own whole domains and orchestrate their own children; the main session stays a near-empty trunk that talks to the user.
- **Fractal compounding.** Lessons are harvested at the leaves, where context is fresh, and consolidated by a background curator — compounding as metabolism, not a command you remember to run.
- **The ledger is the ground truth.** Coordination happens through files (`docs/runs/<run-id>/`); final messages are verdicts plus paths.
- **Delegation envelopes.** Every spawn carries an objective, an artifact path, boundaries, and a budget (children, model tier, remaining depth).
- **The laws still hold.** Reads parallelize, writes serialize, one writer per file set, decompose on failure rather than eagerly.

## Requirements

- [Claude Code](https://claude.com/claude-code) ≥ 2.1.172 (nested subagents).
- For the development scripts (`scripts/*.ps1`): [PowerShell 7+](https://github.com/PowerShell/PowerShell) (`pwsh`, cross-platform) and Node.js (the test fixture and the run-ledger scaffolder are zero-dependency Node).

## Install

From a checkout of this repository:

```
claude plugin marketplace add <path-to-this-repo>
claude plugin install banyan
```

Restart or reload the `claude` session, then verify with `/bn-hello` — it prints the installed Banyan version.

For development against the seeded-bug test fixture instead:

```
pwsh scripts/smoke.ps1   # builds the fixture sandbox, installs the plugin, runs /bn-hello headlessly
```

## Quickstart

In a `claude` session inside the repo you want to work on:

```
/bn-grow <feature or task description>
```

`/bn-grow` runs the full pipeline — research → plan (judged) → deliver → review → ship gate → background curate — coordinating through a run ledger at `docs/runs/<run-id>/` that you can watch live. The pipeline never pushes; shipping is an explicit step you take at the end.

Each stage is also independently invocable:

| Skill | What it does |
| --- | --- |
| `/bn-review` | The flagship review subtree: reviews a diff, dedupes findings, and fixes-and-verifies them in place, returning an applied verdict (commits on a clean tree, never pushes). |
| `/bn-plan` | A plan from a judge panel: prior-biased generators (mvp / risk / ops) scored by independent judges, synthesized by the trunk. |
| `/bn-work` | Execute a plan via worktree-isolated unit subtrees plus a single integrator. |
| `/bn-curate` | Consolidate harvested lessons into `docs/solutions/` (sleep-time compute; runs in the background after `/bn-grow`). |
| `/bn-tune` | Mine accumulated run data for recurring harness failures and propose evidence-cited diffs to Banyan itself — proposals only, a human applies them. |
| `/bn-conventions` | Index of the ledger, envelope, and knowledge-store conventions. |
| `/bn-hello` | Install check: confirms the plugin loaded and prints its version. |

The plugin ships 29 agents: the three lead subtrees plus `bn-unit-lead`/`bn-integrator`, 17 reviewer/researcher personas vendored from compound-engineering, the `bn-finding-owner`/`bn-thread-chaser`/`bn-plan-generator`/`bn-plan-judge` workers, the `bn-lesson-harvester` + `bn-knowledge-curator` compounding loop, and the `bn-harness-engineer`. See [`plugin/README.md`](plugin/README.md) for the roster and [`plugin/AGENTS.md`](plugin/AGENTS.md) for the conventions contract (the eight invariants, the lead pattern, allowlist-as-org-chart).

## Workflows

### Ship a feature end to end

```
/bn-grow add per-tenant rate limiting to the public API
```

The trunk clarifies intent with you, opens a run ledger, then dispatches the subtrees in
sequence — research → plan (judged) → deliver → review — with an explicit artifact gate
between each stage, so a failed stage stops the pipeline instead of being papered over.
Watch the run live:

```
tail -f docs/runs/<run-id>/ledger.md
```

The pipeline ends at a **ship gate**: the work is committed locally, reviewed, and green,
but pushing or opening a PR is a step you take yourself. Lesson curation runs in the
background afterward. A run halted mid-pipeline resumes from its ledger once the blocker
is cleared.

### Review a change

```
/bn-review                     # the current branch against the default base
/bn-review base:origin/main    # an explicit base ref
/bn-review 1234                # a PR by number or URL (remote scope: report-only)
```

Unlike a report-style reviewer, `/bn-review` resolves what it finds: each confirmed
finding gets an owner that independently verifies, fixes, and re-tests it, and the lead
returns an **applied verdict** — fixes committed on a clean tree, never pushed. Run it
before opening a PR or as a final pass over `/bn-work` output. Effort scales with the
diff: a trivial change gets an inline check; a large or sensitive one (auth, payments,
migrations) gets the full panel plus the adversarial reviewer.

### Plan first, execute when you're ready

```
/bn-plan migrate the session store from memory to redis
# read (and edit) the plan doc it writes under docs/plans/ ...
/bn-work
```

Use this split instead of `/bn-grow` when you want a human gate between planning and
execution. `/bn-plan` drafts competing approaches under different priors (mvp-first /
risk-first / ops-first), scores them with an independent judge panel, and synthesizes the
winner into a plan doc with stable unit IDs; pass it a research-brief path instead of a
description to ground it in prior research. `/bn-work` executes the latest plan (or a
path you give it): atomic units inline, composite units in isolated worktrees with their
own test-fix loop and mini-review, and a single integrator merging in dependency order.

### Keep the harness compounding

```
/bn-curate    # consolidate staged lessons into docs/solutions/
/bn-tune      # once ~5 runs have accumulated: propose improvements to Banyan itself
```

Every lead stages candidate lessons before it returns; curation promotes the keepers into
the `docs/solutions/` knowledge store, where future runs retrieve them. `/bn-grow`
dispatches curation automatically — run `/bn-curate` manually after standalone
`/bn-review` or `/bn-work` runs. `/bn-tune` mines accumulated run ledgers and transcripts
for recurring harness failures and writes evidence-cited proposals to
`docs/harness-proposals/`; it never edits the plugin itself — you review and apply.

## Evaluation

The review subtree is benchmarked A/B against compound-engineering's `/ce-code-review` on a reproducible seeded-bug fixture (12 seeded bugs, published ground truth), replicated over an advertised and a fair de-advertised run: detection parity, with Banyan delivering applied-and-verified fixes (suite green, safe commit) from a ~7–8× smaller trunk footprint at comparable cost. The harness, protocol, and filled scorecard live in [`eval/review-ab/`](eval/review-ab/); the evaluation is rerunnable with `pwsh eval/review-ab/run-ab.ps1`.

## Repository layout

```
plugin/        the Claude Code plugin (29 agents, 8 skills, schemas, AGENTS.md contract)
docs/          founding brainstorm, decision records, plans, harness changelog & proposals
eval/          the /bn-review vs /ce-code-review A/B evaluation harness and results
scripts/       dev loop: fixture init, dev install, smoke test, vendoring, validation
test/          seeded-bug fixture repo and a planted two-hop research scenario
vendor/        provenance for assets vendored from compound-engineering (pinned SHA)
```

## Documents

- [Founding brainstorm](docs/brainstorms/2026-06-10-banyan-v2-brainstorm.md) — the research synthesis and full v2 ideation (verbatim export).
- [Fork vs greenfield decision](docs/decisions/2026-06-10-fork-vs-greenfield.md) — why Banyan is a new plugin that vendors compound-engineering's leaf agents rather than a fork.
- [Implementation plan](docs/plans/2026-06-10-001-feat-banyan-core-plan.md) — the phased plan the codebase is built to.

## License

MIT — see [LICENSE](LICENSE). Banyan vendors leaf assets from EveryInc's [compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin) (MIT); attribution in [NOTICE](NOTICE) and per-file provenance in [`vendor/MANIFEST.md`](vendor/MANIFEST.md).
