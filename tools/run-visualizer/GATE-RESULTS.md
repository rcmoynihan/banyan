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

## P10 genuinely-live leg (R14, mandatory) — ✅ EXECUTED BY TRUNK (2026-06-16)

**Done, not fabricated.** Driven against the **genuinely-live, growing Claude Code session of this
very grow run** (`11ab87f1-55c0-46f4-8a52-ac54765be741`) while a real background subagent produced a
new, growing transcript. Method: the trunk replicated `useRunModel`'s exact non-React wiring — the
**real** `createWatcher` (chokidar) → `onGrowth` → `createLivenessFsm` → `run-model.apply`, plus the
quiescence-tick producer — over the live session's `subagents/` subtree + sibling root, and logged
the model's status transitions. (The Ink render layer on top of this same state is covered by the
U6/U7 `ink-testing-library` snapshot tests; this leg proves the live *data* pipeline on real growth,
which is the part the deterministic legs could only shadow.)

**Observed transition log (real timestamps relative to watch start):**

- `+0.0s` — watcher attached to live session; **57 nodes** built from the session's real transcripts.
- `+3.8s` — the quiescence producer flipped **55 completed agents** active→finished after the ~2.5s
  window (real on-disk transcripts whose growth had stopped); `active 57 → 2`.
- `+6.3s` — the run-root (`__run_root__`, sibling `<sessionId>.jsonl`) flipped to finished; `active → 1`.
- `+8.8s` — the live background agent `agent-ab20f1e4ffaebb197` (`general-purpose`) flipped
  active→**finished** as its first output burst quiesced; `active → 0`.
- `+25.6s` — **`agent-ab20f1e4ffaebb197` flipped finished→ACTIVE again** — the FSM caught the agent
  *resuming* output in real time (the monotonic-but-correctable re-activation, P2), and the run-root
  re-activated with it; `active → 2`.
- `+28.8s` — the agent completed and re-quiesced → active→**finished**; `active → 0`. (The agent's
  own completion notification independently reported `duration_ms 26539`, consistent with the flip.)

**Verdict:** against genuinely-live, real file growth the tool tracked a real subagent through
`active → finished → active → finished`, distinguished in-flight from completed (R11/R12), and marked
historical agents finished via quiescence — all through the production watcher+FSM+model path. The
single outstanding gate item is now closed; **the full release gate is green.**

## Trunk-driven independent re-confirmation (2026-06-16)

Run by the grow trunk itself before calling the feature done (not trusting the delivery report):

- **Deterministic suite:** `cd tools/run-visualizer && npm ci && node --test` → **101 tests, 101
  pass, 0 fail**, self-terminating (~0.83s).
- **Real replay:** `buildStateForRun('.banyan/runs/2026-06-14-001-plan-bn-mock-skill')` →
  `resolved:true sessionId:b5bf91de score:89 (runnerUp c4d40cea)`; **94 nodes** (depth 0:1, 1:11,
  2:35, 3:47 — genuine deep nesting); all 94 carry a real prompt (R7), token usage (R9), and timing
  (R8); view-state JSON round-trips (KD2). Sample depth-3 node rendered full P9 floor + verbatim
  prompt.
- **Genuinely-live:** the observation logged above.
