# Run 2026-06-11-001-onboard-banyan-self

## Objective

Onboard the Banyan source repository itself into the Banyan shape via /bn-onboard:
classify the authoring-context documentation corpus, transform durable knowledge into
linked derivatives, synthesize/merge instruction files, and write the onboarding
manifest. Shipped plugin content (`plugin/**`) is explicitly out of corpus and left
byte-identical in place. Done when the manifest, onboarding report, and approved
derivatives exist and curation has run.

## Plan

Plan ref: none -- ad hoc run (/bn-onboard standard mode)

## Facts / Context

- Git root: /Users/rmoynihan/misc/banyan; preflight tree DIRTY (audit edits uncommitted:
  M README.md, M docs/README.md, M plugin/AGENTS.md, ?? AGENTS.md, ?? CLAUDE.md,
  ?? docs/runs/, ?? docs/solutions/) -> Phase 6 commit disallowed.
- .gitignore excludes no Banyan artifact paths; `tmp/` ignored by design (decoy
  vendor-cache/fixture-sandbox snapshots live there).
- No docs/onboarding-manifest.md -> fresh (non-incremental) onboard.
- Test command (documented repo-local): `pwsh scripts/smoke.ps1` (no package.json /
  pyproject / Cargo.toml / go.mod at root).
- Corpus excludes by category: `plugin/**` (shipped plugin content, not authoring),
  `test/**` (planted fixture data per root AGENTS.md), `tmp/**` (gitignored decoys),
  `vendor/**` (hard-excluded vendoring provenance), `LICENSES/` (license),
  Banyan-owned `docs/{brainstorms,plans,runs,solutions}/` + manifest.
- Corpus after filtering: 12 docs -> standard effort, single surveyor batch.
- Banyan scaffold dirs docs/{brainstorms,plans,solutions,runs}/ already exist
  (this repo is already partially in shape); docs/review-personas/ exists with README.

## Units

| unit | owner (lead) | status  | artifact |
|------|--------------|---------|----------|
| U1   | trunk        | done    | briefs/corpus.md |
| U2   | bn-doc-surveyor (survey-1) | done    | findings/survey-1.json |
| U3   | trunk        | done    | classification gate (AskUserQuestion) |
| U4   | bn-doc-transformer (transform-1) | done | findings/transform-1.json |
| U5   | trunk        | done    | AGENTS.md merge (eval-harness bullet), CONCEPTS.md written, CLAUDE.md/STRATEGY.md skipped |
| U6   | bn-lesson-harvester | done    | lessons-staging/ (2 run-harvest candidates) |
| U7   | bn-knowledge-curator | done   | curation-summary.md (promoted 4, staging emptied) |
| U8   | trunk        | done    | docs/onboarding-manifest.md + onboarding-report.md |

Statuses: pending | in-progress | blocked | done | abandoned

## Log

- 2026-06-11T00:00:00Z trunk: run scaffolded
- 2026-06-11T19:00:00Z trunk: adopted pre-scaffolded run dir; objective set; preflight facts recorded
- 2026-06-11T19:00:00Z trunk: corpus enumerated (12 docs after filtering); briefs/corpus.md written
- 2026-06-11T19:05:00Z survey-1: 12 docs classified (7 instruction-source, 2 solution-knowledge, 4 skip); findings/survey-1.json written
- 2026-06-11T19:10:00Z trunk: classification gate approved as shown; protocol.md kept as borderline knowledge candidate
- 2026-06-11T19:15:00Z transform-1: 2 knowledge candidates staged to lessons-staging/, validator passed; findings/transform-1.json written
- 2026-06-11T19:20:00Z trunk: instruction gates resolved — AGENTS.md merge written, CONCEPTS.md written, CLAUDE.md unchanged (shim), STRATEGY.md declined
- 2026-06-11T19:25:00Z bn-lesson-harvester: 2 run-harvest candidates staged (corpus-filtering, shim-synthesis)
- 2026-06-11T19:30:00Z bn-knowledge-curator: promoted 4, merged 0, pruned 0; staging emptied; curation-summary.md written
- 2026-06-11T19:35:00Z trunk: docs/onboarding-manifest.md and onboarding-report.md written; no commit (preflight tree dirty); run complete

## Open questions

- Tree was dirty at preflight: commit is disallowed this run; user may commit manually
  or rerun after committing audit edits.
