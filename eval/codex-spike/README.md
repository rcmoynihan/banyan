# Codex multi-agent design basis

This is the design substrate for porting Banyan's recursive lead-owned subtrees to OpenAI
Codex. It records the **proven** Codex multi-agent mechanism — the part the port builds on —
and enumerates the **residual unproven** follow-on items as named, gated verification.

The evidence is a two-iteration headless proof-of-concept on **codex-cli 0.139.0** under
`codex exec`, both iterations verdict *confirmed-with-caveats*, captured in
`.banyan/runs/2026-06-17-001-plan-codex-port/briefs/poc-notes.md` with per-thread session
rollouts and raw `--json` event streams under `poc/codex-dual-host-port/runs/`. Every proven
fact below cites the PoC iteration and the poc-notes line that established it. This is a
captured-evidence record; it does not re-run the PoC.

## Proven mechanism (the design basis)

### Autonomous depth-3 recursion fires headless (PoC iteration 1)

A single top-level non-interactive `codex exec` prompt drives an **autonomous depth-3 nested
spawn chain** — root (depth 0) → lead (depth 1) → unit-lead (depth 2) → leaf (depth 3) —
where each spawn is decided by the agent from its injected instructions, not a fresh
per-level human ask. All four depth markers were written on disk, each by its own level, and
four distinct session-rollout threads form the lineage, each spawned by its parent via the
`multi_agent_v1` `spawn_agent` tool with a blocking `wait` on the child's return (poc-notes
iter 1, `:53-71`). The depth-3 leaf thread issued zero `spawn_agent` calls — terminal as
instructed (poc-notes iter 1, `:71`).

**`agents.max_depth=3` is load-bearing.** A `max_depth=1` control of the identical chain
**stalled at depth 1**: only the depth-0 and depth-1 markers were produced, the lead was
blocked on its own nested spawn, root polled `wait` until the 480s wall (exit 124). The
deeper chain fires only with the cap raised to the target depth (poc-notes iter 1, `:78-82`).

### Autonomous parallel panel fan-out fires headless, bounded by `agents.max_threads` (PoC iteration 2)

A single lead **autonomously issues N `spawn_agent` calls up front** (all before any `wait`),
launching parallel sibling threads under one parent, then a single combined `wait` over all
in-flight receivers — the fan-out topology, not serial spawn-wait-spawn. At
`agents.max_threads=8` the lead spawned three siblings whose on-disk run windows **overlap**
(real concurrency) and all three carry the same `parent_thread_id` (poc-notes iter 2,
`:256-274`).

**`agents.max_threads` demonstrably bounds the concurrency.** At `max_threads=2` against three
siblings, the runtime **rejected the third `spawn_agent` with an empty receiver list** until a
slot freed; the lead had to `wait` + `close_agent` a finished sibling before re-spawning, and
the third sibling's window is disjoint from the first two — serialized by the bound (poc-notes
iter 2, `:275-297`).

### Caveat — the org-chart is instruction-injection, not name dispatch (R15 / DI6)

Custom `.codex/agents/*.toml` role **names are not callable as `agent_type`** in 0.139.0.
Every level first attempted `spawn_agent` with the custom role name (`agent_type:"leaf"`), the
runtime rejected it as unknown, and the parent retried with `agent_type:"default"` and the
child role's `developer_instructions` injected into the spawn `message` (poc-notes iter 1,
`:72-77`, `:138`). The fan-out siblings spawn the same way — `agent_type:"default"` with
per-sibling instructions injected; the caveat persists for breadth as well as depth (poc-notes
iter 2, `:354`). The port realizes the Banyan org-chart by **instruction-injection into generic
`default` spawns**, not by a role name the runtime resolves; the U6 generator emits per-spawn
instruction payloads, not callable role names.

### Caveat — `max_threads` bounds by reject-then-reslot, and starts are staggered (R21 / DI6)

The bound is enforced by **rejecting the surplus `spawn_agent` with an empty receiver**, not by
a transparent queue: a lead fanning out wider than `max_threads` must run a
**spawn-reap-respawn loop** — `wait` + `close_agent` a finished sibling to free a slot, then
re-spawn the rejected one (poc-notes iter 2, `:281-282`, `:365-368`). Sibling starts are
**staggered** — the N `spawn_agent` calls emit as sequential tool round-trips within the lead's
turn (~3-6s apart), so a panel gets concurrency, not a synchronized barrier launch (poc-notes
iter 2, `:362-364`). Generated panel-lead bodies carry this loop and assume staggered, not
barrier, starts.

### Auth boundary — subscription login, `OPENAI_API_KEY` unset (R22)

Both iterations reached the Codex backend over the user's **Codex subscription** auth in
`~/.codex/auth.json`. `OPENAI_API_KEY` was **unset** for every `codex exec` invocation —
confirmed by Codex loading the model over subscription auth with no API-key error (poc-notes
iter 1, `:35-38`; iter 2, `:236-240`). The `[agents]` config was delivered purely via
`-c key=value` overrides; `~/.codex/` was never edited (poc-notes iter 2, `:240`). The port's
install/config delivery must not depend on `OPENAI_API_KEY` and must never edit the user's
global `~/.codex/config.toml`.

### Proven run shape

```
codex exec --json --skip-git-repo-check --sandbox workspace-write \
  -c agents.max_depth=3 -c agents.max_threads=<M> \
  -o runs/<arm>-last-message.txt "$(cat <prompt>.txt)"
# OPENAI_API_KEY unset; subscription auth in use.
```

`agents.max_depth=3` (≥ target depth), `agents.max_threads=<M>` (≥ widest declared panel for
full parallelism; `< panel width` forces serialization via empty-receiver rejection),
`--sandbox workspace-write`, `--skip-git-repo-check`, `--json`, `-o <file>` (poc-notes iter 1,
`:163-172`; iter 2, `:388-404`).

## Residual gated verification

These items are **not proven** and are **not claimed as parity** anywhere in the port. Each row
names the concrete probe that would close it and the downstream commitment it gates. **Q4 (the
codex-cli 0.140.0 re-verify) gates the U8 config-contract commitment** (DI3 / R23). Q1–Q3
(R24) are carried as not-yet-parity into the U5 register and deferred to follow-up; they do not
block U5 or U6.

| ID | Open question | Requirement | Concrete probe that closes it | Gates |
|----|---------------|-------------|-------------------------------|-------|
| Q1 | Does autonomous panel fan-out hold for **width > 3**? Only one lead → 3 siblings at depth 1 was exercised (poc-notes iter 2, `:332`). | R24 | A lead body that autonomously fans out a wider panel (e.g. 5–6 siblings) under `agents.max_threads ≥ width`; confirm all siblings spawn concurrently under one `parent_thread_id` and the lead `wait`s them together. | Not-yet-parity row in the U5 register; deferred follow-up. Does **not** block U5/U6. |
| Q2 | Does fan-out **nested inside the depth-3 recursion** compose — a depth-2 unit-lead that itself fans out a sibling panel? Depth and breadth were proven only **separately** (poc-notes iter 1 linear chain `:131-132`; iter 2 fan-out at depth 1 `:332`). | R24 | A single `codex exec` chain where a depth-2 unit-lead issues multiple `spawn_agent` calls for a sibling panel under `agents.max_depth=3`; confirm the panel children run concurrently at depth 3 and the depth + breadth mechanisms coexist in one run. | Not-yet-parity row in the U5 register; deferred follow-up. Does **not** block U5/U6. |
| Q3 | Does the **spawn-reap-respawn reslot hold under load** — a panel materially wider than `max_threads`, e.g. **6 siblings at `max_threads=2`** — driving multiple reject-reslot cycles reliably, and what is the reslot overhead? Only 3 siblings at `max_threads=2` (one reslot cycle) was proven (poc-notes iter 2, `:275-297`, `:411-413`). | R21 / R24 | A lead body running the spawn-reap-respawn loop against 6 siblings at `max_threads=2`; confirm every sibling eventually completes (none dropped), count the reject-reslot cycles, and time the reslot overhead. | Not-yet-parity row in the U5 register; pins the U6 lead-body reslot logic under load; deferred follow-up. Does **not** block U5/U6. |
| Q4 | Are the `multi_agent_v1` surface (`spawn_agent` / `wait` / `close_agent`) and the `agents.*` config keys (`max_depth`, `max_threads`) **stable on codex-cli 0.140.0**? All evidence is 0.139.0; `codex doctor` reports 0.140.0 available, and the tool surface / config keys may shift (poc-notes iter 1, `:146-147`; iter 2, `:375-376`, `:419-420`). | R23 | Re-run the iteration-1 depth-3 chain **and** the iteration-2 fan-out (both arms) on codex-cli 0.140.0; confirm `spawn_agent`/`wait`/`close_agent` and `agents.max_depth`/`agents.max_threads` behave as on 0.139.0 (autonomous depth-3, reject-then-reslot bounding). | **The U8 `[agents]` config-contract commitment** (DI3 / R23). Until Q4 passes, U8 pins the contract to codex-cli 0.139.0 and marks 0.140.0 `UNVERIFIED — re-verify before bumping`. |

## Verification

`UNVERIFIED (doc-only, evidence-cited)` — a captured-evidence design record, not a re-run. The
proven facts are grounded in `poc-notes.md` (iteration + line cited per fact); the PoC artifacts
under `poc/codex-dual-host-port/runs/` are the underlying evidence. The Claude Code `node --test`
script spine is unaffected by this file and stays green.
