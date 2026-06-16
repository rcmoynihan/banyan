# Release gate checklist (U9)

The deterministic `node --test` suite is CI; the genuinely-live leg is mandatory and **manual**.
`bun test` is a documented decoy in this repo and is **never** invoked.

| Leg | Type | Where | Bound / assertion |
|---|---|---|---|
| Pure-core suite (parsers, FSM, bridge, tree-join, run-model, durable-reader) | CI | `node --test` | all green; import-purity + JSON serializability enforced |
| toolUseId tree-join (U4) | CI | `src/model/tree-builder.test.mjs` | 82+11=93, 0 unmatched WITH sibling root; control proves 11 dangle WITHOUT |
| P4 cold-bridge acceptance (U3) | CI | `src/bridge/bridge.test.mjs` | run-id → `b5bf91de` unambiguously; dir-mtime resolver does NOT |
| P6 schema-drift gate (U9) | CI | `test/drift-gate.test.mjs` | drift fixture degrades end-to-end, no throw |
| P1a torn-line degradation (U9) | CI | `test/drift-gate.test.mjs` | already-parsed nodes stay visible |
| P3 latency (U9) | CI (measured) | `test/liveness-latency.test.mjs` | **real chokidar watch**; Δ ≤ 2s typical / ≤ 5s worst |
| P10 controlled-append (U9) | CI (shadow) | `test/controlled-append.test.mjs` | new-node growth → active→finished via FSM |
| **P10 genuinely-live (U10)** | **MANUAL, MANDATORY** | beside a real `/bn-*` run | new child auto-appears + active→finished on real growth + R1/R19 discovery |
| Whole-feature replay (U8/U10) | manual | `node src/index.mjs --run <fixture>` | full nested tree + verbatim prompt + P9 floor render |
| P5/P12 durable-only, both layouts (U10) | manual | run against a transcript-less run dir | labeled degraded roster, flat + nested |

**Done condition:** the deterministic suite is green AND `GATE-RESULTS.md` records the three
execution legs (P3 measured, P6 drift, P10 live) AND the P4 cold-bridge resolution. The
controlled-append leg is supplementary CI, **not** a substitute for the genuinely-live P10 leg.
