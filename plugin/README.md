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
  agents/                      one agent per file: bn-*.md (44 agents)
  skills/                      one skill per directory: bn-*/SKILL.md (17 skills)
    bn-conventions/            conventions index + references/ (ledger, envelope,
                               knowledge-store specs) + scripts/ (run scaffolder,
                               boundary check + its tests, frontmatter validator)
  schemas/                     shared schema files (findings, solution frontmatter)
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
| `/bn-grow` | The full pipeline: optional brainstorm intake → research → spec stress when warranted → plan (judged) → deliver → review → ship gate → curation handoff, from a small trunk. |
| `/bn-brainstorm` | Collaborative requirements dialogue (scope tiers, rigor probes, synthesis gate) producing a requirements doc that hands off to `/bn-spec-stress` or `/bn-plan`. |
| `/bn-spec-stress` | Stress-test a requirements doc before planning: missing scenarios, hidden assumptions, acceptance gaps, and plan-affecting risks become a gate brief. |
| `/bn-ask` | Grounded codebase Q&A: answers repo questions, checks hypotheses, explains limitations, and escalates to the research subtree only when needed. |
| `/bn-onboard` | Onboard an existing repo by classifying its documentation corpus, gating linked derivatives, bootstrapping curator knowledge, drafting instructions, and emitting a manifest. |
| `/bn-review` | The review subtree: reviews a diff, dedupes findings, fixes-and-verifies them in place, returns an applied verdict. |
| `/bn-plan` | A plan from a requirements doc, research brief, spec-stress brief, or task: prior-biased generators scored by independent judges, synthesized by the trunk. |
| `/bn-work` | Execute a durable plan or lightweight direct-work spec via worktree-isolated unit subtrees and a single integrator. |
| `/bn-debug` | The debug subtree: reproduce, rank hypotheses, test them with parallel investigators, confirm the causal chain, then fix test-first on your say-so. |
| `/bn-commit` | A well-crafted commit from the working tree (repo conventions, logical grouping, named-file staging). Never pushes. |
| `/bn-ship` | Commit → push → PR with an adaptive, value-first description. The one place in Banyan allowed to push. |
| `/bn-resolve-pr` | Resolve PR review feedback: parallel resolver agents fix locally; the trunk validates, commits, pushes, replies, and resolves threads. |
| `/bn-curate` | Consolidate harvested lessons into `docs/solutions/`. |
| `/bn-tune` | Mine accumulated run data for recurring harness failures and propose evidence-cited diffs to Banyan itself (human-applied only). |
| `/bn-conventions` | Index of the ledger, envelope, and knowledge-store conventions. |
| `/bn-doctor` | Capability check: environment floor, asset integrity, and a live depth-2 nested-spawn + allowlist-enforcement probe. |
| `/bn-hello` | Install check: confirms the plugin loaded and prints its version. |

## Agents

- **Leads** — `bn-review-lead`, `bn-research-lead`, `bn-delivery-lead`,
  `bn-debug-lead`: each owns a subtree end-to-end and returns a verdict plus artifact
  paths. Their `Agent(...)` allowlists are their team rosters.
- **Delivery workers** — `bn-unit-lead` (one implementation unit in an isolated
  worktree: implement → test-fix → mini-review pair → commit), `bn-integrator` (single
  writer for the merge; runs the full suite; never pushes).
- **Reviewer panel** — 7 always-on reviewers (correctness, testing, maintainability,
  YAGNI, project standards, agent-native, learnings) and 8 conditional reviewers
  (security, performance, API contract, data migration, reliability, adversarial, spec
  fidelity, plus previous-comments for PR-mode reviews).
  `bn-finding-owner` fixes-and-verifies one confirmed finding.
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
- **Planning panel** — `bn-plan-generator` (one draft per prior: mvp / risk / ops),
  `bn-plan-judge` (independent rubric scoring), and `bn-plan-checker` (repo-grounded
  precheck of the winning draft).
- **Spec stress lenses** — `bn-spec-scenario-reviewer`, `bn-spec-assumption-reviewer`,
  and `bn-spec-threat-reviewer` pressure-test requirements before planning when their
  triggers are present.
- **Compounding loop** — `bn-lesson-harvester` (the bounded leaf every lead spawns
  before returning) and `bn-knowledge-curator` (consolidates staged lessons into
  `docs/solutions/`).
- **`bn-harness-engineer`** — mines run ledgers and transcripts for recurring harness
  failures and writes proposals to `docs/harness-proposals/`; never self-applies.
- **Doctor probes** — `bn-probe` + `bn-probe-leaf` (the probe pair `/bn-doctor` uses
  to verify live depth-2 nesting and allowlist enforcement; health-check only).

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
