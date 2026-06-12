<!-- managed-by: /bn-onboard -->
<!-- last-run: 2026-06-11-001-onboard-banyan-self -->

# Onboarding manifest

Source-to-derivative record for `/bn-onboard` in this repository. The corpus is
authoring context only; shipped plugin content (`plugin/**`), fixture data (`test/**`),
gitignored caches (`tmp/**`), vendoring provenance (`vendor/**`), licenses, and
Banyan-owned paths (`docs/{brainstorms,plans,runs,solutions}/`) are excluded by
category and never appear as rows.

| source | sha256 (12-hex prefix) | classification | derivative | status |
|---|---|---|---|---|
| README.md | fc81bc78be57 | instruction-source | CONCEPTS.md | transformed |
| AGENTS.md | 68cddac53026 | instruction-source | AGENTS.md (additive merge) | transformed |
| CLAUDE.md | 336cc4fbf19b | skip | | skipped: one-line @AGENTS.md shim, no independent content |
| docs/README.md | 3d39b8b66d38 | instruction-source | CONCEPTS.md | transformed |
| docs/decisions/2026-06-10-fork-vs-greenfield.md | 70a91b3478bd | solution-knowledge:tooling_decision | docs/solutions/tooling-decisions/fork-vs-greenfield-plugin-skeleton.md | promoted |
| docs/harness-changelog.md | 56f0755464b6 | skip | | skipped: deliberate audit log managed via /bn-tune; changelog rule |
| eval/README.md | 6e95a339e15f | instruction-source | AGENTS.md (additive merge), CONCEPTS.md | transformed |
| eval/review-ab/protocol.md | f869219f6f5a | solution-knowledge:architecture_pattern, instruction-source | docs/solutions/architecture-patterns/review-ab-evaluation-protocol.md | promoted |
| eval/review-ab/SCORECARD-template.md | 1440b1d90c03 | skip | | skipped: fill-in template, placeholders only |
| eval/review-ab/results/SCORECARD.md | 55e726df36a4 | skip | | skipped: filled eval-run output under results/ |
| scripts/README.md | 28f79090ba5c | instruction-source | CONCEPTS.md | transformed |

Instruction-file outcomes for run 2026-06-11-001-onboard-banyan-self: `AGENTS.md`
merged (one additive bullet), `CONCEPTS.md` written (new), `CLAUDE.md` unchanged (shim
by design), `STRATEGY.md` declined (no strategy sources in corpus).
