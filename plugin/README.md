# Banyan

Banyan is a Claude Code plugin: a hierarchical, self-compounding agent harness built
for nested subagents (Claude Code >= 2.1.172, depth 5). Instead of hub-and-spoke
orchestration of a flat agent fleet, it uses **lead agents that own whole subtrees**, a
**file-based run ledger**, **delegation envelopes with budgets**, and **fractal lesson
harvesting**.

This directory (`plugin/`) is the plugin root: the manifest lives at
`.claude-plugin/plugin.json`, co-located here, and components live alongside it.

## Layout

```
plugin/
  .claude-plugin/plugin.json   plugin manifest (name, version, metadata)
  agents/                      one agent per file: bn-*.md (55 agents)
  skills/                      one skill per directory: bn-*/SKILL.md (19 skills)
    bn-conventions/            conventions index + references/ (ledger, envelope,
                               knowledge-store specs) + scripts/ (run scaffolder,
                               boundary check + its tests, frontmatter validator)
  schemas/                     shared schema files (findings, solution frontmatter)
  hooks/                       hooks.json + node scripts: trunk-level doctrine reminders
                               (best-effort, never block a prompt; see AGENTS.md §2.4)
  AGENTS.md                    Banyan's standing conventions contract
  README.md                    this file
```

`AGENTS.md` is the authoritative contract for everything under `plugin/`: the `bn-`
namespace prefix, agent/skill frontmatter formats, the eight invariants, the lead
pattern, and the protected-artifact rules. Read it before adding components.

## Skills

Invoke as `/bn-<name>` (namespaced as `/banyan:bn-<name>` under `--plugin-dir`):

| Skill | What it does |
| --- | --- |
| `/bn-grow` | The full hands-off pipeline: optional brainstorm intake → research → spec stress when warranted → plan (judged) → deliver (full-panel review + bounded fix loop) → ship gate → curation handoff, with bounded self-recovery at phase gates. |
| `/bn-brainstorm` | Collaborative requirements dialogue (scope tiers, rigor probes, synthesis gate) producing a requirements doc that hands off to `/bn-spec-stress` or `/bn-plan`. |
| `/bn-spec-stress` | Stress-test a requirements doc before planning: missing scenarios, hidden assumptions, acceptance gaps, and plan-affecting risks become a gate brief with explicit disposition buckets. |
| `/bn-ask` | Grounded codebase Q&A via a dedicated subtree: researchers gather evidence, the lead drafts an answer, `bn-ask-checker` re-runs every citation, and the lead revises and writes one verified answer brief. No fast path. |
| `/bn-onboard` | Onboard an existing repo by classifying its documentation corpus, gating linked derivatives, bootstrapping curator knowledge, drafting instructions, and emitting a manifest. |
| `/bn-review` | The review subtree, **read-only**: reviews a diff, dedupes findings, returns a findings report (edits and commits nothing). Fix findings via `/bn-work` or by hand. |
| `/bn-plan` | A plan from a requirements doc, research brief, spec-stress brief, or task: `bn-plan-lead` owns the generator/judge/checker panel and writes the durable plan. |
| `/bn-work` | Execute a durable plan or lightweight direct-work spec via worktree-isolated unit subtrees and a single integrator, then run the full reviewer panel and a bounded review→fix→re-review loop (2 rounds; `--no-review` to skip). |
| `/bn-debug` | The debug subtree: reproduce, rank hypotheses, test them with parallel investigators, confirm the causal chain, then fix test-first on your say-so. |
| `/bn-ship` | Commit → push → PR with an adaptive, value-first description. The one place in Banyan allowed to push. |
| `/bn-resolve-pr` | Resolve PR review feedback: parallel resolver agents fix locally; the trunk validates, commits, pushes, replies, and resolves threads. |
| `/bn-learn` | Consolidate harvested lessons into `.banyan/solutions/`. |
| `/bn-evolve` | Mine accumulated run data for recurring harness failures and propose evidence-cited diffs to Banyan itself (human-applied only). |
| `/bn-conventions` | Index of the ledger, envelope, and knowledge-store conventions. |
| `/bn-doctor` | Capability check: environment floor, asset integrity, and live depth-2 nested-spawn, allowlist, and nested user-question probes. |
| `/bn-hello` | Install check: confirms the plugin loaded and prints its version. |
| `/bn-mock` | Turn an idea, requirements doc, or plan into a deliberately-fake, semi-functional mock under a disposable `mock/<slug>/` so design holes surface before an MVP; routes findings back through the owning skills (propose-never-patch). |
| `/bn-poc` | Prove whether an idea's central IP/capability can actually work by building its core machine *for real* into a disposable `poc/<slug>/` within a user-confirmed scope, returning a humble feasibility verdict (`confirmed` / `confirmed-with-caveats` / `could-not-confirm`); routes the verdict back through the owning skills (propose-never-patch). |
| `/bn-runbook` | Read-only, re-runnable drive-recipe producer: probes a repo for its drive entry points and external dependencies, tiers each dependency, execute-validates only the cheap/drivable surface under a budget ceiling (marking what it ran `proven`), declares expensive or no-dev-equivalent legs without running them, and writes an approval-gated, machine-readable drive-recipe block into `AGENTS.md`/`CLAUDE.md`; routes enabling work to `/bn-plan` and never builds it itself. |

## Agents

- **Leads** — `bn-review-lead`, `bn-research-lead`, `bn-delivery-lead`,
  `bn-debug-lead`, `bn-plan-lead`, and `bn-ask-lead`: each owns a subtree end-to-end and
  returns a verdict plus artifact paths. Their `Agent(...)` allowlists are their team rosters.
- **Delivery workers** — `bn-unit-lead` (one implementation unit in an isolated
  worktree: implement → test-fix → mini-review pair → commit), `bn-integrator` (single
  writer for the merge; runs the full suite; never pushes).
- **Mock leaf** — `bn-mock-builder` builds a deliberately-fake, semi-functional mock
  under a disposable `mock/<slug>/` so design holes surface before an MVP; routes
  findings back through the owning skills (propose-never-patch).
- **PoC leaf** — `bn-poc-builder` is the first Banyan leaf that runs real, networked,
  dependency-installing code: it builds an idea's core machine *for real* into a
  disposable `poc/<slug>/` within a user-confirmed scope, captures reproducible
  evidence, runs a post-run git-status self-check (downgrade-and-disclose, not abort),
  and returns a humble feasibility verdict; routes it back through the owning skills
  (propose-never-patch).
- **Reviewer panel** — 7 always-on reviewers (correctness, testing, maintainability,
  YAGNI, project standards, agent-native, learnings) and 9 conditional reviewers
  (security, performance, API contract, data migration, reliability, architecture,
  adversarial, spec fidelity, plus previous-comments for PR-mode reviews). All read-only —
  `bn-review-lead` produces findings, it does not fix.
  `bn-finding-owner` fixes-and-verifies one confirmed finding — spawned by `bn-delivery-lead`
  during `/bn-work`'s review→fix loop (not by the read-only review subtree).
- **Researchers & investigators** — repo, best-practices, framework-docs, and web
  researchers (read-only leaves), `bn-thread-chaser` (recursive, depth-gated),
  `bn-deployment-verifier`, and `bn-hypothesis-investigator` (tests ONE debug
  hypothesis with predictions-before-evidence).
- **PR feedback** — `bn-pr-comment-resolver` (evaluates and locally fixes one disjoint
  file-set's worth of review threads; the `/bn-resolve-pr` trunk does everything
  outward-facing).
- **Onboarding pair** — `bn-doc-surveyor` is the read-only batch classifier for
  existing documentation corpora; `bn-doc-transformer` writes linked derivative
  artifacts. The `/bn-onboard` trunk owns outward-facing work.
- **Planning subtree** — `bn-plan-lead` writes durable plans; `bn-plan-generator` (one draft
  per prior: mvp / risk / ops), `bn-plan-judge` (independent rubric scoring), and
  `bn-plan-checker` (repo-grounded precheck of the winning draft).
- **Spec stress lenses** — six requirements-stage lenses that pressure-test a spec before
  planning when their triggers are present: `bn-spec-scenario-reviewer`,
  `bn-spec-assumption-reviewer`, and `bn-spec-threat-reviewer`, plus
  `bn-spec-design-reviewer`, `bn-spec-product-reviewer`, and `bn-spec-coherence-reviewer`
  (ported from compound-engineering's design-lens, product-lens, and coherence document
  reviewers).
- **Compounding loop** — `bn-lesson-harvester` (the bounded leaf every lead spawns
  before returning) and `bn-knowledge-curator` (consolidates staged lessons into
  `.banyan/solutions/`).
- **Consult loop** — `bn-consult-extractor` is the disposable read-only single-fact
  extractor an answering lead spawns when a bounded consult ask is insufficient: it
  reads exactly one predecessor transcript and returns one bounded fact to a `consults/`
  artifact, then ends; it spawns nothing and never continues the task.
- **`bn-harness-engineer`** — mines run ledgers and transcripts for recurring harness
  failures and writes proposals to `.banyan/harness-proposals/`; never self-applies.
- **Doctor probes** — `bn-probe` + `bn-probe-leaf` (the probe pair `/bn-doctor` uses
  to verify live depth-2 nesting, allowlist enforcement, and nested user-question availability;
  health-check only).

## Install for development

Two scripts under the repo-root `scripts/` directory drive the dev loop:

- `scripts/dev-install.ps1` -- copies or symlinks this plugin into a sandbox project
  so a `claude` session loads it without a marketplace round-trip.
- `scripts/smoke.ps1` -- installs the plugin into the test fixture and runs
  `/bn-hello` headlessly (`claude -p`) to confirm the load path works.

After installing, open a `claude` session in the sandbox and run `/bn-hello`; it
should confirm Banyan is installed and print its version. For the full capability
check — environment floor, asset integrity, and the live depth-2 nested-spawn probe —
run `/bn-doctor`.

## Add as a marketplace

From a checkout of the Banyan repository:

```
claude plugin marketplace add <repo-root>
```

where `<repo-root>` is the directory containing `.claude-plugin/marketplace.json`
(the parent of this `plugin/` directory). Then enable the plugin:

```
claude plugin install banyan
```

Restart or reload the `claude` session so the plugin's agents and skills load, then
verify with `/bn-hello`.

## License

MIT. Banyan vendors leaf assets from EveryInc's compound-engineering plugin (also
MIT); vendoring provenance is tracked in `../vendor/MANIFEST.md`.
