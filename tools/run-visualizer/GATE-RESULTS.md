# Release gate results (U10)

Kept record of the release-gate execution, mirroring `eval/review-ab/results/SCORECARD.md`
precedent. `bun test` is a documented decoy in this repo and is never invoked; the suite is
`cd tools/run-visualizer && npm ci && node --test`.

**Date:** 2026-06-16 · **Node:** v24.15.0 · **Stack:** ink 7.0.6 + react 19.2.7 + chokidar 4.0.3
+ ink-testing-library 4.0.0.

## Deterministic suite (CI)

`cd tools/run-visualizer && node --test` → **79 tests, 79 pass, 0 fail**, terminates cleanly
(~0.78s). Covers parsers, liveness FSM, cold bridge, tree-join, RunModel core, durable-reader,
Ink renderer, detail pane, launch wiring, and the three gate legs. Import-purity (no
ink/react/chokidar/fs in the RunModel import graph) and JSON serializability are enforced, not
asserted.

## Execution legs

| Leg | Status | Evidence |
|---|---|---|
| **#2 toolUseId tree-join (R2/U4)** | ✅ GREEN | Real `b5bf91de`: **82 inter-subagent + 11 root = 93, 0 unmatched** WHEN the sibling `<sessionId>.jsonl` root is read; control test proves the 11 roots dangle WITHOUT it (F1/R-C locked). |
| **#3 P4 cold-bridge acceptance (R3)** | ✅ GREEN | Run-id `2026-06-14-001-plan-bn-mock-skill` resolves to session `b5bf91de` and to no other. A dir-mtime resolver does NOT resolve it (session dir mtime falls outside the run window — line-timestamps are load-bearing, F2). Ambiguity refuses with a candidate list (DI3). |
| **#4 P6 schema-drift gate (R13)** | ✅ GREEN | The synthetic drift fixture (renamed/missing `usage` → `unavailable`; `Task`-named spawn → edge; array `message.content` → handled) degrades end-to-end through tailer→parser→model with **no throw**. |
| **#5 P1/P5 degradation (R1/R9), both layouts (P12)** | ✅ GREEN | Torn-line fixture: 3 nodes stay visible, the torn trailing line is dropped (no silent vanish). Durable-only roster on **both** layouts: `nested` → `bn-delivery-lead, bn-finding-owner×3, bn-unit-lead`; `flat` → `bn-correctness-reviewer×2, bn-delivery-lead`. |
| **#6 P3 latency (R5)** | ✅ GREEN (measured) | **Measured over a REAL chokidar watch** (not a mock): new-node appearance latency **~46 ms**, well within the ≤2s typical / ≤5s worst-case bound. |
| **#7 P10 controlled-append (R14 shadow)** | ✅ GREEN | New-node growth → active→finished via the FSM, deterministically. This is the **supplementary CI shadow**, NOT a substitute for the genuinely-live leg. |

## Whole-feature replay (U8 milestone, recorded against the named fixture)

`buildStateForRun('.banyan/runs/2026-06-14-001-plan-bn-mock-skill')` against real on-disk data:

- **Resolution:** `resolved:true, sessionId:b5bf91de-f038-4e03-b691-9cbbc703613a` (P4).
- **Tree:** `total:93, matchedViaSubagent:82, matchedViaRoot:11, attachedToRoot:0` — full nested tree.
- **Sample node `agent-a012195dd09c6801a`** (`banyan:bn-security-reviewer`, depth 3) renders the
  full **P9 floor**: agentType, model `claude-opus-4-8`, owningUnit `/Users/riley/repos/banyan`,
  worktree `unavailable`, start `2026-06-15T17:42:24.149Z`, end `2026-06-15T17:43:37.062Z`,
  duration `72.9s`, tokens `5655 (in 2170 / out 3485)`, depth `3`. Prompt rendered **verbatim**
  (`=== BANYAN ENVELOPE === objective: Round-2 RE-REVIEW of the /bn-poc safety …`), AR1 no redaction.
- **Degradation (both layouts):** durable-only roster builds on `nested` AND `flat`, concurrent
  same-role collapsed to `×N`, explicitly labeled degraded.

## P10 genuinely-live leg (R14, mandatory, manual) — OUTSTANDING (trunk to finish)

**NOT executed in this delivery; NOT fabricated.** R14 requires launching the tool beside a
genuinely in-flight Banyan run (started in another pane) and observing, through the tool's own
R1/R19 active-run discovery, a newly-spawned child **auto-appearing** and an **active→finished**
flip on real file growth. Driving an independent live `/bn-*` run and observing it is a
trunk-level action outside this delivery agent's reach; per the delivery envelope the trunk WILL
drive this observation. The deterministic controlled-append leg (#7) and the measured real-chokidar
latency leg (#6) are the standing CI shadows; the single remaining gate item is this one live
observation.

**To complete (trunk):** in one pane start any `/bn-*` run under `.banyan/runs/`; in another run
`node tools/run-visualizer/src/index.mjs` (no `--run` → active-run discovery) or
`node tools/run-visualizer/src/index.mjs --run <that-run-id>`; confirm R1/R19 discovery, a new
child auto-appearing, and an active→finished transition within the P3 bound; append the observation
log here.
