# Onboarding report — 2026-06-11-001-onboard-banyan-self

## Scope

Corpus: authoring-context documentation only (12 docs after filtering). Excluded by
category, not per-doc skips: `plugin/**` (shipped plugin content, left byte-identical),
`test/**` (planted fixture data / answer keys per root `AGENTS.md`), `tmp/**`
(gitignored decoy snapshots), `vendor/**` (vendoring provenance), `LICENSES/`, and
Banyan-owned `docs/{brainstorms,plans,runs,solutions}/`.

## Counts per family

| family | count |
|---|---|
| instruction-source | 7 (one dual-target with solution-knowledge) |
| solution-knowledge | 2 (both staged, both promoted) |
| brainstorm | 0 |
| persona | 0 |
| skip | 4 |
| deferred | 0 |

## Skipped sources

| source | reason |
|---|---|
| CLAUDE.md | one-line `@AGENTS.md` shim; no independent content |
| docs/harness-changelog.md | deliberate audit log managed via `/bn-tune`; changelog rule (git is the record) |
| eval/review-ab/SCORECARD-template.md | fill-in template, placeholders only |
| eval/review-ab/results/SCORECARD.md | filled eval-run output under `results/` |

## Curation

promoted 4 / merged 0 / patterns 0 / pruned 0; staging emptied; every promoted doc
passed `validate-frontmatter.py`. Promoted docs:

- `docs/solutions/tooling-decisions/fork-vs-greenfield-plugin-skeleton.md`
- `docs/solutions/architecture-patterns/review-ab-evaluation-protocol.md`
- `docs/solutions/conventions/plugin-source-repo-onboarding-corpus-filtering.md` (run harvest)
- `docs/solutions/conventions/instruction-file-shim-synthesis.md` (run harvest)

## Instruction outcomes

- `AGENTS.md` — additive merge approved and written: one bullet documenting the
  review-subtree A/B eval harness.
- `CONCEPTS.md` — new glossary written (approved as drafted): content categories,
  harness vocabulary, authoring vocabulary.
- `CLAUDE.md` — unchanged; it is a shim including `AGENTS.md` by design, and the
  detected test command (`pwsh scripts/smoke.ps1`) is already a stated convention in
  `AGENTS.md`.
- `STRATEGY.md` — declined: no strategy sources in corpus (direction lives in
  `docs/brainstorms/` and `docs/plans/`, excluded as Banyan-owned).

## Deferred docs

None.

## Contradictions

None found in the corpus.

## Commit

Not performed: the tree was dirty at preflight (uncommitted documentation-audit edits:
`README.md`, `docs/README.md`, `plugin/AGENTS.md`, new root `AGENTS.md`/`CLAUDE.md`).
Files written by this run: `docs/onboarding-manifest.md`, `CONCEPTS.md`, the
`AGENTS.md` merge bullet, `docs/solutions/**` (4 promoted docs), and
`docs/runs/2026-06-11-001-onboard-banyan-self/**`.

## Next paths

- Commit the audit edits and this run's outputs together (or rerun `/bn-onboard` after
  committing for a clean-tree commit pass).
- `/bn-curate` — nothing pending; staging is empty.
- `/bn-ship` when ready to push.
