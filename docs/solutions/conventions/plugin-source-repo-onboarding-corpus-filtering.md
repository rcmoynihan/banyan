---
module: "onboarding"
date: "2026-06-11"
problem_type: convention
component: documentation
severity: high
applies_when:
  - "Onboarding a repository that is both a plugin source and an ordinary host repo"
  - "The plugin source tree contains shipped doctrine and test fixtures alongside host-repo documents"
  - "The onboarding run must produce a knowledge store without contaminating it with fixture answer keys or shipped source content"
tags:
  - plugin-source-repo
  - onboarding
  - corpus-filtering
  - fixture-contamination
  - dual-role-repo
---

# Exclude plugin source and fixture content by category, not by per-doc skip rules

## Guidance

When onboarding a repository that serves simultaneously as a plugin source and an ordinary host repo (e.g., Banyan itself), exclude the plugin tree and fixture directories from the corpus by category-level rules, not by per-document skip judgments. Specifically:

- Exclude `plugin/**` entirely — it is shipped verbatim and never restructured by onboarding.
- Exclude `test/**` entirely — it contains planted fixture data, seeded bugs, and answer keys (not authoring documentation).
- Exclude `tmp/**` entirely — it is gitignored and contains pristine upstream snapshots and sandbox artifacts, not source material.

Use these three blanket exclusions as part of the corpus definition, not as skip clauses evaluated during classification. Anything the classifier must "skip" on a case-by-case basis risks error: a fixture file that looks like knowledge (a planted answer key, a seeded lesson) will be misclassified and laundered into the knowledge store, and shipped doctrine copied into test scenarios will be "restructured" as if it were authoring guidance.

## Why

A dual-role repository stores several kinds of content in overlapping directory trees:

1. Plugin source (shipped verbatim, never reshaped by onboarding).
2. Authoring documentation (project decisions, contributor guides, plans).
3. Fixture scenarios (test data, planted bugs, and answer-key lessons deliberately seeded as part of test harnesses).
4. Runtime artifacts (per-run ledgers, the knowledge store itself).

Classifying these correctly in a single pass requires knowing which directories are never to be considered for transformation. Per-document skip rules invite the classifier to reason about individual files (a test file that looks like documentation, a fixture lesson that is intended as an answer key) instead of enforcing the structural boundary. Once a fixture file is classified as "knowledge" and staged as a lesson, it is in the knowledge store and difficult to remove cleanly.

The only safe rule is categorical: if a file lives in `plugin/**`, `test/**`, or `tmp/**`, it is out of corpus by definition, and the classifier never sees it.

## Applies when

- The repository is simultaneously the source of a shipped plugin and a working host repo (both roles use `docs/`).
- Test fixtures include planted knowledge artifacts (seeded lessons, answer-key ADRs, planted best practices) that are *intentionally* example content, not real findings.
- The onboarding run must not promote fixture content into the production knowledge store.
- The plugin tree includes instruction files or doctrine that are shipped to users and must never be reshaped as "authoring guidance."

## Verification

- The corpus brief (`briefs/corpus.md`) names exact directory patterns (e.g., `plugin/**`, `test/**`, `tmp/**`) as blanket exclusions under an "Exclusions (category-level)" section, not as scattered per-file skip rules.
- After filtering, the corpus contains no files from those three trees.
- The classifier's findings do not mention any files under `plugin/`, `test/`, or `tmp/` (not even to skip them).
- No staged candidate lesson derives from a file path under `test/` or `tmp/`.

## Source

[docs/runs/2026-06-11-001-onboard-banyan-self/briefs/corpus.md](../../../runs/2026-06-11-001-onboard-banyan-self/briefs/corpus.md)
