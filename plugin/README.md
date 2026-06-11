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
  agents/                      one agent per file: bn-*.md (29 agents)
  skills/                      one skill per directory: bn-*/SKILL.md (8 skills)
    bn-conventions/            conventions index + references/ (ledger, envelope,
                               knowledge-store specs) + scripts/new-run.mjs
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
| `/bn-grow` | The full pipeline: research → plan (judged) → deliver → review → ship gate → background curate, from a small trunk. |
| `/bn-review` | The review subtree: reviews a diff, dedupes findings, fixes-and-verifies them in place, returns an applied verdict. |
| `/bn-plan` | A plan from a judge panel: prior-biased generators scored by independent judges, synthesized by the trunk. |
| `/bn-work` | Execute a plan via worktree-isolated unit subtrees and a single integrator. |
| `/bn-curate` | Consolidate harvested lessons into `docs/solutions/`. |
| `/bn-tune` | Mine accumulated run data for recurring harness failures and propose evidence-cited diffs to Banyan itself (human-applied only). |
| `/bn-conventions` | Index of the ledger, envelope, and knowledge-store conventions. |
| `/bn-hello` | Install check: confirms the plugin loaded and prints its version. |

## Agents

- **Leads** — `bn-review-lead`, `bn-research-lead`, `bn-delivery-lead`: each owns a
  subtree end-to-end and returns a verdict plus artifact paths. Their `Agent(...)`
  allowlists are their team rosters.
- **Delivery workers** — `bn-unit-lead` (one implementation unit in an isolated
  worktree: implement → test-fix → mini-review → commit), `bn-integrator` (single
  writer for the merge; runs the full suite; never pushes).
- **Reviewer panel** — 6 always-on reviewers (correctness, testing, maintainability,
  project standards, agent-native, learnings) and 6 conditional reviewers (security,
  performance, API contract, data migration, reliability, adversarial), vendored from
  compound-engineering. `bn-finding-owner` fixes-and-verifies one confirmed finding.
- **Researchers** — repo, best-practices, framework-docs, and web researchers
  (read-only leaves), plus `bn-thread-chaser` (recursive, depth-gated) and
  `bn-deployment-verifier`.
- **Planning panel** — `bn-plan-generator` (one draft per prior: mvp / risk / ops)
  and `bn-plan-judge` (independent rubric scoring).
- **Compounding loop** — `bn-lesson-harvester` (Haiku-class leaf every lead spawns
  before returning) and `bn-knowledge-curator` (consolidates staged lessons into
  `docs/solutions/`).
- **`bn-harness-engineer`** — mines run ledgers and transcripts for recurring harness
  failures and writes proposals to `docs/harness-proposals/`; never self-applies.

## Install for development

Two scripts under the repo-root `scripts/` directory drive the dev loop:

- `scripts/dev-install.ps1` -- copies or symlinks this plugin into a sandbox project
  so a `claude` session loads it without a marketplace round-trip.
- `scripts/smoke.ps1` -- installs the plugin into the test fixture and runs
  `/bn-hello` headlessly (`claude -p`) to confirm the load path works.

After installing, open a `claude` session in the sandbox and run `/bn-hello`; it
should confirm Banyan is installed and print its version.

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
