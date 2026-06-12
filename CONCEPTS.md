# Concepts

Domain vocabulary for the Banyan repository. The deep specs live in the linked
files; this glossary exists so a reader — human or agent — resolves a term in
one hop.

## The two content categories

- **Authoring context** — everything outside `plugin/`: `docs/`, `scripts/`,
  `test/`, `eval/`, `vendor/`, `tmp/`. Never ships with the plugin. Governed by
  root `AGENTS.md`.
- **Shipped plugin content** — everything under `plugin/`. Copied verbatim into
  every install; read by agents as doctrine. Governed by `plugin/AGENTS.md`.
- **Host repo** — any repository Banyan is installed into and runs against.
  This repo is its own host repo: the plugin is installed here to develop
  Banyan, so `docs/` holds both project documents and runtime artifacts.
- **Decoy instruction file** — an `AGENTS.md`/`CLAUDE.md`/`CONCEPTS.md` under
  `tmp/`, `test/`, or a sandbox that is data, not instructions (see root
  `AGENTS.md`, "Instruction-file map"). The only real standards files are root
  `AGENTS.md` and `plugin/AGENTS.md`.

## Harness vocabulary

- **Trunk** — the main session: near-empty, talks to the user, holds intent,
  dispatches leads.
- **Lead** — an agent that owns a subtree end-to-end and returns a verdict plus
  artifact paths, never a report (`plugin/AGENTS.md` §4).
- **Delegation envelope** — the per-spawn contract (objective, artifact path,
  output format, boundaries, tool guidance, budget). Spec:
  `plugin/skills/bn-conventions/references/envelope.md`.
- **Budget** — the envelope's `max_children` / `depth_remaining`
  pair bounding a subtree's fan-out and depth.
- **Run / run ledger** — one directory per run, `docs/runs/<run-id>/`, holding
  the ledger, progress notes, findings, briefs, and staged lessons. Spec:
  `plugin/skills/bn-conventions/references/ledger.md`.
- **Knowledge store** — `docs/solutions/`, the durable lesson store,
  schema-compatible with compound-engineering v1. Spec:
  `plugin/skills/bn-conventions/references/knowledge-store.md`.
- **Candidate lesson** — a staged solution doc with `status: candidate` under a
  run's `lessons-staging/`, written by a harvester or transformer; only the
  curator promotes candidates into `docs/solutions/`.
- **Curator** — `bn-knowledge-curator`: consolidates staged candidates
  (promote, merge, prune), then empties `lessons-staging/`.
- **Review persona** — a host-repo reviewer definition under
  `docs/review-personas/` with a `when:` frontmatter key, embodied at review
  time by the generic `bn-custom-reviewer`.
- **Protected artifacts** — `docs/brainstorms/`, `docs/plans/`,
  `docs/solutions/`, `docs/runs/`: no agent deletes, gitignores, or "cleans up"
  files under them (`plugin/AGENTS.md` §5).

## Authoring vocabulary

- **Vendored, `verbatim` vs `ported`** — provenance classes from
  `vendor/MANIFEST.md`: `verbatim` files must byte-match the pinned upstream
  SHA; `ported` files are Banyan-owned with edits logged under `vendor/edits/`.
- **Fixture sandbox** — a throwaway git sandbox under `tmp/` materialized by
  `scripts/fixture-init.ps1` for installing and exercising the plugin.
- **Seeded-bug fixture** — `test/fixture-repo/`, a planted scenario whose
  ground truth is `.fixture/BUG-INVENTORY.md`; fixture content is an answer
  key, never project guidance.
- **Smoke test** — `pwsh scripts/smoke.ps1`: builds the fixture sandbox,
  installs the plugin, asserts the clean baseline, runs `/bn-hello` headlessly.
- **A/B arms** — `eval/review-ab/`: Banyan's `/bn-review` versus upstream's
  `/ce-code-review` over the same diff, scored against the seeded-bug fixture's
  ground truth.
