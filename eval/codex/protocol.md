# Codex verification + eval protocol

This is the GO/NO-GO contract for Banyan's Codex render — the Codex analog of
`scripts/smoke.ps1`. It gives the dual-host port a runnable, regression-gated check so the
generated `dist/codex/` package stays installable and a delegating skill keeps finding its
agent at runtime, without regressing the Claude Code product.

Run it:

```bash
node eval/codex/run-codex-smoke.mjs            # discoverability arm, for real
node eval/codex/run-codex-smoke.mjs --json     # machine-readable result
node eval/codex/run-codex-smoke.mjs --drive-codex   # opt-in live-Codex arm (see below)
```

Exit code is `0` on GO, non-zero on NO-GO, the same convention `scripts/smoke.ps1` uses.

## Two arms, one contract

The Banyan deterministic node scripts are host-neutral zero-dependency `node:*` (plan R11), so
the `node --test` script spine is the shared check across both runtimes and runs unchanged on
each. On top of that shared spine the Codex smoke has two arms.

### Arm 1 — discoverability (default, runs for real on any host)

No codex CLI is required. This arm asserts the committed Codex package is discoverable and
internally consistent. The render output (`agents/`, `skills/`, `AGENTS.md`) lives under
`dist/codex/`; the packaging manifest and the agent-install step live under
`scripts/codex-build/`. Its GO conditions:

1. **Packaging manifest present and parseable** — `scripts/codex-build/codex-plugin.json` exists,
   is valid JSON, declares `host=codex`, and names the agent-install step
   (`agents.install`).
2. **Agent-install step present** — `scripts/codex-build/install-codex-agents.mjs` exists (the
   step the manifest points at, plan R25/U8).
3. **Codex doctrine present** — `dist/codex/AGENTS.md` exists.
4. **54 agent TOMLs discoverable** — 54 `agents/*.toml`, each declaring a `name`.
5. **19 skills discoverable** — 19 skill directories each with a `SKILL.md` (the count is
   asserted dynamically against what is on disk, not hardcoded into the package).
6. **R25 — every delegating skill finds its agent.** This is the load-bearing condition, not a
   bare "a skill invokes" check. For every *delegating* skill (one whose `SKILL.md` names a
   lead agent), walk the full delegation closure

   ```
   skill  ->  its lead(s)  ->  each lead's declared spawn roster  ->  (transitively)
   ```

   and assert every agent in that closure has an installed TOML in the package. A skill that
   loads but whose delegate (or a transitive roster member) is missing from the agent store is
   a **failed install** — exactly the R25 failure mode Codex's native install (skills only)
   produces without the agent-install step. The check derives the closure from the same two
   sources the runtime uses: a skill body's lead references and a lead body's
   `Your declared spawn roster is: ...` line (the `Agent(...)` allowlist the U6 generator
   renders into `developer_instructions`).

**GO** iff conditions 1–6 all pass **and** the consult-loop wiring (below) is present.

### Arm 2 — live-Codex GO conditions (opt-in, MANUAL-STEP)

These prove the runtime mechanism the PoC established (the parity-gap register's GREEN-with-
caveats recursion + fan-out rows). They need a live codex-cli 0.139.0 + a Codex **subscription**
login. This host has **no codex-driven CI**, so they are **documented MANUAL-STEPs marked
`UNVERIFIED (live Codex)`** and the arm is off by default. Pass `--drive-codex` to surface them
against a present CLI; even then the smoke does not auto-spend a paid session — the operator runs
them. The live GO conditions:

- **Skills load** — `/skills` lists the 19 Banyan skills.
- **Agents registered** — `ls "$CODEX_HOME"/agents/*.toml | wc -l` == 54.
- **R25 delegating skill finds its agent** — invoke `$bn-review`; its review lead spawns the
  reviewer panel with no missing-agent error.
- **Depth-2 spawn returns an artifact** — a lead spawns one child that writes its artifact.
- **Depth-3 chain returns an artifact** — trunk → lead → unit-lead → leaf, each spawn
  agent-decided, leaf writes its artifact (requires `agents.max_depth=3`).
- **3-sibling panel fan-out returns artifacts** — one lead issues 3 `spawn_agent` calls; all
  three siblings return (`agents.max_threads >= 3`).
- **Reslot path** — at `agents.max_threads=2` against 3 siblings, the lead's
  spawn-reap-respawn loop reaps a finished sibling and re-spawns the rejected one (plan R21).

Auth boundary (plan R22): run every live step with `OPENAI_API_KEY` **unset** and the subscription
login active, and deliver the `[agents]` contract via `-c` overrides only — never by editing the
user's global `~/.codex/config.toml`. The exact commands are in `docs/codex-install.md`.

## Consult / transcript loop (R9 / R16)

The consult/lateral-rehydration loop reads a per-agent transcript, validates a pointer, and
slices it to a budget. U2 classified the Codex substrate **FAITHFUL** — Codex writes one session
rollout per thread under `<CODEX_HOME>/sessions/**` with resolvable `parent_thread_id` lineage —
revising the plan's `[assumed]` R16. The smoke asserts the **locate+slice fallback path is
wired**: the four host-neutral `node:*` scripts that implement it
(`locate-transcript.mjs`, `transcript-pointer.mjs`, `transcript-slicer.mjs`,
`resolve-resume-mode.mjs`) are present and the `checkpoint` resume mode they safely degrade to is
covered by the standing spine. The live transcript capture — that a parent reliably learns its
child's `threadId` from the `spawn_agent` return to hand a pointer down — needs a live Codex
drive and is recorded **`UNVERIFIED (live transcript capture)`**, the exact confirm-by the U5
register's Row 4 carries.

## Residual breadth — NOT GO conditions (R24)

These are carried as named follow-on probes, explicitly **not** parity and **not** GO conditions:

- Panel width > 3 (Q1).
- Fan-out nested inside the depth-3 recursion — a depth-2 unit-lead that itself fans out a
  sibling panel (Q2).
- Spawn-reap-respawn reslot under load — e.g. 6 siblings at `agents.max_threads=2`, timing the
  reslot overhead (Q3, R21).
- codex-cli 0.140.0 re-verify of the `multi_agent_v1` surface + `agents.*` keys (Q4, R23) — the
  gate on bumping the config-contract pin.

## No regression (R2)

The Claude Code product is the standing gate on this unit. Run the shared spine before and after:

```bash
node --test --test-reporter tap plugin/skills/bn-conventions/scripts/*.test.mjs   # must stay green
node --test eval/codex/*.test.mjs                                                  # this unit's tests
```

Plus `/bn-doctor` Check 2 and `pwsh scripts/smoke.ps1` where available. The smoke reads
`dist/codex/`, `scripts/codex-build/`, and `plugin/`; it writes nothing under any of them and
never touches `~/.codex/`.
