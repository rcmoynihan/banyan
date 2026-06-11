# Vendor manifest — compound-engineering leaf assets

This is the provenance record for every file Banyan vendors from EveryInc's
compound-engineering plugin. It is human-readable; the machine-readable source of
truth that `scripts/vendor.ps1` reads is [`vendor-map.json`](./vendor-map.json).

## (a) Upstream source

| Field | Value |
|---|---|
| Upstream repo | https://github.com/EveryInc/compound-engineering-plugin |
| Pinned commit SHA | `4719dc509fdc45656a830e3ed6060f674e206076` |
| Date pinned | 2026-06-10 |
| Upstream license | MIT (Copyright (c) 2025 Every) — reproduced verbatim in [`../LICENSES/compound-engineering-MIT.txt`](../LICENSES/compound-engineering-MIT.txt) |

## (b) Vendoring policy

1. **Pin, don't float.** We vendor from a single pinned upstream SHA (above), never
   from a moving branch. Bumping the pin is a deliberate, reviewed act.
2. **Never auto-merge.** Re-running the pipeline *reports* drift; it never merges
   upstream changes into our tree. We own our divergence on purpose.
3. **Two modes.**
   - **`verbatim`** — copied unchanged from the pinned SHA. `vendor.ps1 -Sync` may
     (re)write these from the cache; drift from upstream means *we* edited them and
     should usually be reverted or justified.
   - **`ported`** — copied once and then deliberately edited for Banyan's nested
     world (rename to the `bn-` namespace, artifact-path output contract, stripped v1
     orchestration references, adjusted tool grants). `vendor.ps1` **never** overwrites
     or syncs a ported file. Every edit is logged in the per-group edit-log sidecars
     under [`edits/`](./edits/) (see section (d)).
4. **Log every local edit.** Each substantive local change to a ported file gets a
   one-line entry (what changed, why) in its group's edit log.
5. **Drift is observable.** `pwsh -File scripts/vendor.ps1 -Status` reports, per file:
   whether the local file exists; for verbatim files whether it byte-matches the
   pinned-SHA upstream; and pinned-SHA-vs-upstream-HEAD drift (so we can see when
   upstream has moved on since we pinned). HEAD-drift is best-effort and is skipped
   with a NOTE when offline.

## (c) Vendored file mapping

All paths are relative to the repo root. `local` is Banyan's path; `upstream` is the
path within the pinned compound-engineering checkout.

### Ported files (mode: `ported` — edited for Banyan; never auto-synced)

| local | upstream | group |
|---|---|---|
| plugin/agents/bn-correctness-reviewer.md | plugins/compound-engineering/agents/ce-correctness-reviewer.md | always-on |
| plugin/agents/bn-testing-reviewer.md | plugins/compound-engineering/agents/ce-testing-reviewer.md | always-on |
| plugin/agents/bn-maintainability-reviewer.md | plugins/compound-engineering/agents/ce-maintainability-reviewer.md | always-on |
| plugin/agents/bn-project-standards-reviewer.md | plugins/compound-engineering/agents/ce-project-standards-reviewer.md | always-on |
| plugin/agents/bn-agent-native-reviewer.md | plugins/compound-engineering/agents/ce-agent-native-reviewer.md | always-on |
| plugin/agents/bn-learnings-researcher.md | plugins/compound-engineering/agents/ce-learnings-researcher.md | always-on |
| plugin/agents/bn-security-reviewer.md | plugins/compound-engineering/agents/ce-security-reviewer.md | conditional |
| plugin/agents/bn-performance-reviewer.md | plugins/compound-engineering/agents/ce-performance-reviewer.md | conditional |
| plugin/agents/bn-api-contract-reviewer.md | plugins/compound-engineering/agents/ce-api-contract-reviewer.md | conditional |
| plugin/agents/bn-data-migration-reviewer.md | plugins/compound-engineering/agents/ce-data-migration-reviewer.md | conditional |
| plugin/agents/bn-reliability-reviewer.md | plugins/compound-engineering/agents/ce-reliability-reviewer.md | conditional |
| plugin/agents/bn-adversarial-reviewer.md | plugins/compound-engineering/agents/ce-adversarial-reviewer.md | conditional |
| plugin/agents/bn-repo-researcher.md | plugins/compound-engineering/agents/ce-repo-research-analyst.md | researcher |
| plugin/agents/bn-best-practices-researcher.md | plugins/compound-engineering/agents/ce-best-practices-researcher.md | researcher |
| plugin/agents/bn-framework-docs-researcher.md | plugins/compound-engineering/agents/ce-framework-docs-researcher.md | researcher |
| plugin/agents/bn-web-researcher.md | plugins/compound-engineering/agents/ce-web-researcher.md | researcher |
| plugin/agents/bn-deployment-verifier.md | plugins/compound-engineering/agents/ce-deployment-verification-agent.md | researcher |
| scripts/validate-frontmatter.py | plugins/compound-engineering/skills/ce-compound/scripts/validate-frontmatter.py | persistence |

> `scripts/validate-frontmatter.py` is `ported`, not `verbatim`: it carries one minimal,
> logged plumbing edit (directory-walk support; validation *rules* unchanged). It is excluded
> from `vendor.ps1 -Sync` and reported as intentionally-edited by `-Status`. See
> [`edits/persistence.md`](./edits/persistence.md).

### Verbatim files (mode: `verbatim` — copied unchanged; syncable via `vendor.ps1 -Sync`)

| local | upstream | group |
|---|---|---|
| plugin/schemas/solution-frontmatter.yaml | plugins/compound-engineering/skills/ce-compound/references/schema.yaml | persistence |
| plugin/schemas/findings-schema.json | plugins/compound-engineering/skills/ce-code-review/references/findings-schema.json | persistence |

## (d) Edit logs

Per-group sidecars record every local edit to the **ported** files (and any justified
divergence of verbatim files). These files are produced by the sibling agents that own
each group; the links below are forward references — they may not all exist yet while
this wave is in flight.

| Edit log | Covers |
|---|---|
| [`edits/agents-always-on.md`](./edits/agents-always-on.md) | The 6 always-on reviewers: correctness, testing, maintainability, project-standards, agent-native, learnings-researcher. |
| [`edits/agents-conditional.md`](./edits/agents-conditional.md) | The 6 conditional reviewers: security, performance, api-contract, data-migration, reliability, adversarial. |
| [`edits/agents-researchers.md`](./edits/agents-researchers.md) | The 5 researcher/utility agents: repo-researcher, best-practices-researcher, framework-docs-researcher, web-researcher, deployment-verifier. |
| [`edits/persistence.md`](./edits/persistence.md) | The persistence layer: solution-frontmatter.yaml + findings-schema.json (verbatim) and validate-frontmatter.py (ported — directory-walk plumbing edit). |
