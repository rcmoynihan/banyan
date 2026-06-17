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
6. **Generated Codex artifacts are derived, not vendored.** The Codex render under
   `dist/codex/` is generated from `plugin/` by `scripts/codex-build/render-codex.mjs`; it
   is out of scope for the byte-match verbatim discipline and is guarded instead by the
   `node --test` drift gate (`check-codex-drift.mjs`), not by `vendor.ps1`.

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
| plugin/agents/bn-architecture-reviewer.md | plugins/compound-engineering/agents/ce-architecture-strategist.md | conditional |
| plugin/agents/bn-spec-design-reviewer.md | plugins/compound-engineering/agents/ce-design-lens-reviewer.md | document-review |
| plugin/agents/bn-spec-product-reviewer.md | plugins/compound-engineering/agents/ce-product-lens-reviewer.md | document-review |
| plugin/agents/bn-spec-coherence-reviewer.md | plugins/compound-engineering/agents/ce-coherence-reviewer.md | document-review |
| plugin/agents/bn-repo-researcher.md | plugins/compound-engineering/agents/ce-repo-research-analyst.md | researcher |
| plugin/agents/bn-best-practices-researcher.md | plugins/compound-engineering/agents/ce-best-practices-researcher.md | researcher |
| plugin/agents/bn-framework-docs-researcher.md | plugins/compound-engineering/agents/ce-framework-docs-researcher.md | researcher |
| plugin/agents/bn-web-researcher.md | plugins/compound-engineering/agents/ce-web-researcher.md | researcher |
| plugin/agents/bn-deployment-verifier.md | plugins/compound-engineering/agents/ce-deployment-verification-agent.md | researcher |
| plugin/skills/bn-conventions/scripts/validate-frontmatter.py | plugins/compound-engineering/skills/ce-compound/scripts/validate-frontmatter.py | persistence |
| plugin/skills/bn-ship/SKILL.md | plugins/compound-engineering/skills/ce-commit-push-pr/SKILL.md | lifecycle |
| plugin/skills/bn-ship/references/branch-creation.md | plugins/compound-engineering/skills/ce-commit-push-pr/references/branch-creation.md | lifecycle |
| plugin/skills/bn-ship/references/pr-description-writing.md | plugins/compound-engineering/skills/ce-commit-push-pr/references/pr-description-writing.md | lifecycle |
| plugin/skills/bn-resolve-pr/SKILL.md | plugins/compound-engineering/skills/ce-resolve-pr-feedback/SKILL.md | pr-feedback |
| plugin/skills/bn-resolve-pr/references/full-mode.md | plugins/compound-engineering/skills/ce-resolve-pr-feedback/references/full-mode.md | pr-feedback |
| plugin/skills/bn-resolve-pr/references/targeted-mode.md | plugins/compound-engineering/skills/ce-resolve-pr-feedback/references/targeted-mode.md | pr-feedback |
| plugin/agents/bn-pr-comment-resolver.md | plugins/compound-engineering/agents/ce-pr-comment-resolver.md | pr-feedback |
| plugin/agents/bn-previous-comments-reviewer.md | plugins/compound-engineering/agents/ce-previous-comments-reviewer.md | pr-feedback |
| plugin/skills/bn-brainstorm/SKILL.md | plugins/compound-engineering/skills/ce-brainstorm/SKILL.md | brainstorm |
| plugin/skills/bn-brainstorm/references/brainstorm-sections.md | plugins/compound-engineering/skills/ce-brainstorm/references/brainstorm-sections.md | brainstorm |
| plugin/skills/bn-brainstorm/references/synthesis-summary.md | plugins/compound-engineering/skills/ce-brainstorm/references/synthesis-summary.md | brainstorm |
| plugin/skills/bn-brainstorm/references/markdown-rendering.md | plugins/compound-engineering/skills/ce-brainstorm/references/markdown-rendering.md | brainstorm |
| plugin/skills/bn-brainstorm/references/universal-brainstorming.md | plugins/compound-engineering/skills/ce-brainstorm/references/universal-brainstorming.md | brainstorm |
| plugin/skills/bn-brainstorm/references/handoff.md | plugins/compound-engineering/skills/ce-brainstorm/references/handoff.md | brainstorm |

> `plugin/skills/bn-conventions/scripts/validate-frontmatter.py` is `ported`, not
> `verbatim`: it carries logged packaging and directory-walk support; validation
> rules track upstream parser-safety checks. It is excluded from `vendor.ps1 -Sync`
> and reported as intentionally-edited by `-Status`. See
> [`edits/persistence.md`](./edits/persistence.md).

### Verbatim files (mode: `verbatim` — copied unchanged; syncable via `vendor.ps1 -Sync`)

| local | upstream | group |
|---|---|---|
| plugin/schemas/solution-frontmatter.yaml | plugins/compound-engineering/skills/ce-compound/references/schema.yaml | persistence |
| plugin/schemas/findings-schema.json | plugins/compound-engineering/skills/ce-code-review/references/findings-schema.json | persistence |
| plugin/skills/bn-resolve-pr/scripts/get-pr-comments | plugins/compound-engineering/skills/ce-resolve-pr-feedback/scripts/get-pr-comments | pr-feedback |
| plugin/skills/bn-resolve-pr/scripts/get-thread-for-comment | plugins/compound-engineering/skills/ce-resolve-pr-feedback/scripts/get-thread-for-comment | pr-feedback |
| plugin/skills/bn-resolve-pr/scripts/reply-to-pr-thread | plugins/compound-engineering/skills/ce-resolve-pr-feedback/scripts/reply-to-pr-thread | pr-feedback |
| plugin/skills/bn-resolve-pr/scripts/resolve-pr-thread | plugins/compound-engineering/skills/ce-resolve-pr-feedback/scripts/resolve-pr-thread | pr-feedback |
| plugin/skills/bn-debug/references/investigation-techniques.md | plugins/compound-engineering/skills/ce-debug/references/investigation-techniques.md | debug |
| plugin/skills/bn-debug/references/anti-patterns.md | plugins/compound-engineering/skills/ce-debug/references/anti-patterns.md | debug |
| plugin/skills/bn-debug/references/defense-in-depth.md | plugins/compound-engineering/skills/ce-debug/references/defense-in-depth.md | debug |

## (d) Edit logs

Per-group sidecars record every local edit to the **ported** files (and any justified
divergence of verbatim files). These files are produced by the sibling agents that own
each group; the links below are forward references — they may not all exist yet while
this wave is in flight.

| Edit log | Covers |
|---|---|
| [`edits/agents-always-on.md`](./edits/agents-always-on.md) | The 6 always-on reviewers: correctness, testing, maintainability, project-standards, agent-native, learnings-researcher. |
| [`edits/agents-conditional.md`](./edits/agents-conditional.md) | The conditional reviewers: security, performance, api-contract, data-migration, reliability, adversarial, and architecture (ported from `ce-architecture-strategist`). |
| [`edits/document-review.md`](./edits/document-review.md) | The 3 spec-stress document-review lenses ported from compound-engineering's document reviewers: design (`ce-design-lens-reviewer`), product (`ce-product-lens-reviewer`), coherence (`ce-coherence-reviewer`). |
| [`edits/agents-researchers.md`](./edits/agents-researchers.md) | The 5 researcher/utility agents: repo-researcher, best-practices-researcher, framework-docs-researcher, web-researcher, deployment-verifier. |
| [`edits/persistence.md`](./edits/persistence.md) | The persistence layer: solution-frontmatter.yaml + findings-schema.json (verbatim) and validate-frontmatter.py (ported — directory-walk plumbing edit). |
| [`edits/lifecycle.md`](./edits/lifecycle.md) | The lifecycle skill bn-ship (+ its two references). |
| [`edits/pr-feedback.md`](./edits/pr-feedback.md) | The PR-feedback assets: bn-resolve-pr (SKILL + 2 references; the 4 scripts are verbatim) and the resolver / previous-comments agents. |
| [`edits/brainstorm.md`](./edits/brainstorm.md) | The brainstorm skill: bn-brainstorm SKILL + 5 references (html-rendering not vendored). |
| [`edits/debug.md`](./edits/debug.md) | The debug doctrine references (verbatim — zero edits recorded) and the note on why ce-debug/SKILL.md itself is not vendored. |
