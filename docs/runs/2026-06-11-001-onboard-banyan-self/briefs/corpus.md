# Corpus — onboard run 2026-06-11-001-onboard-banyan-self

Authoring-context documentation only. Shipped plugin content (`plugin/**`) is out of
corpus by definition: it is the product, installed verbatim into host repos, and is
never restructured by onboarding.

## Exclusions (category-level, not per-doc skips)

| path | reason |
|---|---|
| `plugin/**` | Shipped plugin content; ships verbatim on install; not authoring documentation. |
| `test/**` | Planted fixture data / answer keys (root `AGENTS.md`: data, not instructions). Transforming would corrupt fixtures and launder fixture content into the knowledge store. |
| `tmp/**` | Gitignored; pristine upstream snapshot + sandbox builds (decoy instruction files). |
| `vendor/**` | Hard-excluded vendoring-provenance path (`vendor/MANIFEST.md` + edit logs are governance records already linked from root `AGENTS.md`). |
| `LICENSES/` | License texts. |
| `docs/brainstorms/`, `docs/plans/`, `docs/runs/`, `docs/solutions/` | Banyan-owned paths (Phase 0 §6); already in Banyan shape. |

## Batch assignment

Single batch `survey-1` (12 sources, standard effort):

1. README.md
2. AGENTS.md
3. CLAUDE.md
4. docs/README.md
5. docs/decisions/2026-06-10-fork-vs-greenfield.md
6. docs/harness-changelog.md
7. docs/review-personas/README.md
8. eval/README.md
9. eval/review-ab/protocol.md
10. eval/review-ab/SCORECARD-template.md
11. eval/review-ab/results/SCORECARD.md
12. scripts/README.md
