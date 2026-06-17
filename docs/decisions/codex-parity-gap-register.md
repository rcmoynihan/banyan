# Codex parity-gap register

This is the honest, evidence-backed record of how Banyan's behaviors map onto OpenAI Codex
when Banyan also ships as a Codex plugin. It is the document a reader signs off on to confirm
the port shape before the `[agents]` config contract is committed (plan U8).

Each row states the behavior, the Claude Code reality, the Codex reality, the documented
fallback, a severity, and — for the recursion and fan-out rows — the explicit not-yet-parity
residual. Every claim is cited to its evidence: the headless proof-of-concept on codex-cli
0.139.0 (`poc-notes.md`, two iterations), a spike artifact (U2–U4), shipped
compound-engineering (CE) precedent, or a `developers.openai.com` URL. No row is marked
GREEN/faithful without its evidence behind it, and every still-open Codex behavior is tagged
`[assumed]` / `UNVERIFIED` with a confirm-by clause (plan DI4 — cite or flag).

**Status:** `UNVERIFIED (doc-only, evidence-cited)`. This is a captured-evidence decision
record assembled from the PoC and the U1–U4 spikes; it does not itself drive a Codex runtime.
The Claude Code `node --test` script spine is unaffected by this file and stays green.

## Evidence base

| Tag | Source | What it establishes |
|---|---|---|
| PoC iter 1 | `.banyan/runs/2026-06-17-001-plan-codex-port/briefs/poc-notes.md` | Autonomous depth-3 recursion fires headless under `codex exec` at `agents.max_depth=3`; `max_depth=1` control stalls at depth 1; named-role dispatch unavailable; subscription auth, `OPENAI_API_KEY` unset. |
| PoC iter 2 | same | Autonomous parallel panel fan-out fires headless; `agents.max_threads` bounds concurrency by reject-then-reslot; staggered (non-barrier) sibling starts. |
| U1 | `eval/codex-spike/README.md` | Design basis: the proven mechanism + the residual gated-verification table (Q1 width, Q2 nested, Q3 reslot-under-load, Q4 0.140.0 re-verify). |
| U2 | `eval/codex-spike/transcript-findings.md` | Consult/transcript-loop substrate classification: **FAITHFUL** (Codex per-thread session rollouts under `<CODEX_HOME>/sessions/**` are a usable locate+slice substrate). |
| U3 | `eval/codex-spike/allowlist-probe.md` | No Codex spawn-type allowlist (prompt-level discipline, as on Claude Code); `hooks.UserPromptSubmit` is a schema-recognized Codex event key (candidate faithful hook port). |
| U4 | `eval/codex-spike/path-doctrine-findings.md` | The six-class `${CLAUDE_PLUGIN_ROOT}` rewrite map to the Codex skills install root; doctrine-delivery by instruction-injection with `AGENTS.md` auto-load as an additive trunk backstop. |
| CE | compound-engineering plugin README (`github.com/EveryInc/compound-engineering-plugin`) | Shipped multi-host port precedent: the Codex install flow, the native-install agent-registration gap (skills only), and the single-source/two-render pattern. |
| Doctrine | `plugin/AGENTS.md` §2.3, §2.4 | `AskUserQuestion` is trunk-only on Claude Code; Codex's equivalent is `request_user_input`. |

## Legend

- **GREEN** — faithful parity proven; any caveats are mechanical (the port must design for
  them) and are named.
- **AMBER** — parity is reachable with a documented, accepted fallback or extra step; not a
  drop-in match.
- **GREEN-with-caveat / prompt-level** — the Codex posture equals the Claude Code posture
  (no regression introduced by the port), but neither host enforces the behavior at the
  runtime level.

---

## The register

### Row 1 — Autonomous recursion (lead spawns its own subtree, depth 3)

- **Behavior:** A lead autonomously spawns its own children to depth 3 (trunk → lead →
  unit-lead → child/reviewer), each spawn decided by the agent from its instructions, not a
  fresh per-level human ask, in headless (non-interactive) mode.
- **Claude Code reality:** Native. Agents spawn nested subagents autonomously to the depth
  the org-chart needs; this is the lead pattern Banyan is built on (`plugin/AGENTS.md` §4).
- **Codex reality:** **Proven** on codex-cli 0.139.0. A single headless `codex exec` prompt
  drove an autonomous depth-3 chain — four distinct session-rollout threads
  root→lead→unit-lead→leaf, each spawned by its parent via the `multi_agent_v1` `spawn_agent`
  tool with a blocking `wait`, the depth-3 leaf terminal (zero further spawns) (PoC iter 1,
  `poc-notes.md:53-71`). `agents.max_depth=3` is load-bearing: a `max_depth=1` control of the
  identical chain stalled at depth 1 and hit the 480s wall (PoC iter 1, `:78-82`).
- **Documented fallback:** none needed for the depth/autonomy/headless properties — they hold
  natively. The org-chart is realized by **instruction-injection into generic
  `agent_type:"default"` spawns**, not by a callable role name, because custom
  `.codex/agents/*.toml` role names are not dispatchable as `agent_type` in 0.139.0 (PoC iter
  1, `:72-77,138`; plan R15/DI6). The U6 generator emits per-spawn instruction payloads, not
  role names the runtime resolves.
- **Severity: GREEN-with-caveats.**
- **Not-yet-parity residual:** `agents.max_depth=3` is the docs-discouraged raised limit the
  install must set (PoC iter 1, `:141-143`); depths beyond 3 were not exercised. Only a single
  **linear** chain was proven at depth (PoC iter 1, `:131-132`); fan-out nested inside the
  depth-3 recursion is carried as Q2 (U1 residual table, R24), not claimed as parity.

### Row 2 — Autonomous parallel panel fan-out (lead spawns a concurrent sibling panel)

- **Behavior:** A single lead autonomously launches 2–3 parallel sibling subagents (e.g.
  review-lead → reviewer panel; plan-lead → generator panel), running concurrently, each spawn
  agent-decided.
- **Claude Code reality:** Native. Leads spawn a concurrent panel and read the members' returns
  (`plugin/AGENTS.md` §4; the review/plan lead-panel patterns).
- **Codex reality:** **Proven** on codex-cli 0.139.0. At `agents.max_threads=8` one lead
  thread issued three `spawn_agent` calls up front, then one combined `wait` over all three
  in-flight receivers — the fan-out topology, not serial spawn-wait-spawn; the three siblings'
  on-disk run windows overlap and all carry the same `parent_thread_id` (real concurrency)
  (PoC iter 2, `:256-274`). `agents.max_threads` demonstrably bounds it: at `max_threads=2`
  against three siblings the runtime rejected the third `spawn_agent` with an empty receiver
  until a slot freed (PoC iter 2, `:275-297`).
- **Documented fallback:** the lead body must implement a **spawn-reap-respawn loop** to fan
  out wider than `max_threads` — the bound is enforced by *rejecting* the surplus spawn (empty
  receiver), NOT a transparent queue; the lead must `wait` + `close_agent` a finished sibling
  to free a slot, then re-spawn the rejected one (PoC iter 2, `:281-282,365-368`; plan
  R21/DI6). The U6 generator emits this loop in every generated panel-lead body. Sibling starts
  are **staggered** (the N `spawn_agent` calls emit as sequential tool round-trips ~3–6s apart),
  so a panel gets concurrency, not a synchronized barrier launch; generated leads must not
  assume a barrier start (PoC iter 2, `:362-364`).
- **Severity: GREEN-with-caveats.**
- **Not-yet-parity residual:** only one lead → 3 siblings at depth 1 was exercised. **Width >3**
  (U1 Q1, R24), **fan-out nested inside the depth-3 recursion** (U1 Q2, R24), and the
  **spawn-reap-respawn reslot under load** — e.g. 6 siblings at `max_threads=2` driving multiple
  reject-reslot cycles (U1 Q3, R21/R24) — are NOT proven and NOT claimed as parity. They are
  named gated-verification in the U1 residual table and deferred to follow-up.

### Row 3 — Agent registration on install

- **Behavior:** Installing the plugin makes the delegating skills' agents available, so a skill
  that delegates to an agent finds it at runtime.
- **Claude Code reality:** A single plugin install registers both skills and the 54 agents the
  skills delegate to; no second step.
- **Codex reality:** Codex's **native plugin install registers skills only — NOT custom
  agents.** The marketplace registers via `codex plugin marketplace add <repo>` and the skills
  install through the `/plugins` TUI (the CLI exposes no install subcommand for an added
  marketplace) (plan R20). Banyan ships 54 agents its skills delegate to; without a separate
  agent-install step a delegating skill reports missing agents at runtime (CE README: native
  install "does not register custom agents yet"; "Without the agent step, delegating skills
  will report missing agents") (plan R25).
- **Documented fallback:** a **two-step install** — (1) the native marketplace/TUI skills
  install, then (2) a Banyan agent-install step that installs the generated
  `dist/codex/agents/*.toml` into the Codex agent store (the analog of CE's
  `bunx @every-env/compound-plugin install --to codex`; Banyan's is a zero-dep node installer).
  Both steps thread a single `CODEX_HOME`. Designed and documented in plan U8;
  `docs/codex-install.md` carries both steps in order, and U9's smoke asserts a delegating skill
  finds its agent.
- **Severity: AMBER** (reachable with a documented extra step; not a drop-in single install).
- **Not-yet-parity residual:** the exact native marketplace manifest filename and the
  agent-install step's final shape are a plan-U8 design + confirm-by item (R20 residual).

### Row 4 — Consult / transcript-rehydration loop

- **Behavior:** A continuation agent rehydrates its direct predecessor's transcript — the
  consult-upward / lateral-rehydration loop locates a per-agent transcript file, validates a
  pointer, and slices it to a budget (`locate-transcript.mjs` / `transcript-pointer.mjs` /
  `transcript-slicer.mjs`).
- **Claude Code reality:** Reads the per-agent transcript at the Claude-Code-specific path
  `<sessionRoot>/subagents/agent-<agentId>.jsonl` (plan R9; `locate-transcript.mjs:12,24,67`).
- **Codex reality:** **FAITHFUL** (U2). Codex writes one **session rollout per thread** under
  `<CODEX_HOME>/sessions/<YYYY>/<MM>/<DD>/rollout-<ts>-<threadId>.jsonl` (`CODEX_HOME` defaults
  to `~/.codex`), and the probe confirmed all three locator preconditions over a 200-rollout
  live sample: **locate** — the thread id is embedded in the filename and matches the
  `session_meta.payload.id` head (200/200); **lineage** — every spawned subagent thread carries
  a resolvable `parent_thread_id` (top-level or `source.subagent.thread_spawn.parent_thread_id`,
  the more complete carrier) so a chain can walk to the direct predecessor (139/139 subagent
  threads); **complete** — a parseable terminal record (e.g. `task_complete`) lets the existing
  locate-AND-complete heuristic apply unchanged (200/200) (U2 findings, probe output). This
  **revises the plan's `[assumed]` R16** ("no faithful port, degrades to checkpoint-only"): the
  analog exists and the locator ports with a path-resolution swap (resolve `rollout-*-<threadId>`
  by scanning the date-partitioned tree), not a redesign.
- **Documented fallback:** the **checkpoint resume mode** (`resolve-resume-mode.mjs`) remains
  the safe degrade where the substrate is unavailable (no `CODEX_HOME` sessions tree, or a
  future version drops the lineage). The run already locks `transcript` mode iff the probe
  reports located && complete, else `checkpoint` — unchanged regardless of host
  (`resolve-resume-mode.test.mjs` 17/17 green, U2).
- **Severity: GREEN (faithful), with confirm-by caveats.**
- **Confirm-by:** (1) **No spawn→thread-id capture proven end to end** — the probe confirms the
  *artifact* exists with lineage, not that the parent reliably *learns* the child's `threadId`
  from the `spawn_agent` return to hand a pointer down; deferred to U9's Codex smoke (a real
  spawn asserting the parent resolves the child's rollout by the returned id). (2) **Version
  pin** — all evidence is the rollout shape from codex-cli 0.139.0; the `session_meta` schema
  may shift, so the U1 Q4 0.140.0 re-verify (R23) should spot-check the lineage fields (`id`,
  `parent_thread_id`, `source.subagent.thread_spawn`).

### Row 5 — Allowlist enforcement (the `Agent(...)` spawn roster)

- **Behavior:** A subagent may spawn only the agent types its declared roster permits — Banyan's
  `Agent(...)` frontmatter allowlist.
- **Claude Code reality:** Declared in agent frontmatter; **enforcement in nested contexts is
  empirically under-documented** for 2.1.172, and `plugin/AGENTS.md` §2 records that if the
  harness ignores a nested allowlist, accounting falls back to the prompt-level envelope
  contract. So even on Claude Code the allowlist is, in practice, prompt-level discipline (U3).
- **Codex reality:** **No spawn-type allowlist field is enforced** (U3). `--strict-config`
  probing showed `[agents]` is a role-name → role-definition map (`agents.allowed_agents`
  parses as a role entry wanting an `AgentRoleToml` 3-element struct, not a membership scalar);
  the recognized `[agents]` scalars (`max_depth`, `max_threads`, `job_max_runtime_seconds`) are
  fan-out **bounds**, not a type allowlist. And it is **moot regardless**: dispatch is by
  instruction-injection into `default` spawns (PoC R15), so a name-based allowlist would not
  bind to dispatch that never resolves a name (U3, `allowlist-probe.md` Q1).
- **Documented fallback:** the `Agent(...)` roster renders into the generated lead's
  `developer_instructions` as the declared spawn roster plus the envelope's prompt-level cap
  discipline (the U6 generator's job). The fan-out *bounds* (`max_depth`, `max_threads`,
  `job_max_runtime_seconds`) ARE enforced server-side; the *type* constraint degrades to
  prompt-level envelope discipline — **identical to the Claude Code posture**, no regression.
- **Severity: GREEN-with-caveat / prompt-level** (the same fallback Banyan already relies on).
- **Confirm-by:** whether any `allowed_*`/`allowlist`/`can_spawn` field exists on the per-role
  schema is empirically inconclusive via `--strict-config` (it does not deep-validate inner
  fields) but moot per R15; closes by reading https://developers.openai.com/codex/subagents or
  driving a live spawn of a not-granted type (U3).

### Row 6 — Hook semantics (the trunk-only consent reminder)

- **Behavior:** A best-effort `UserPromptSubmit` hook fires a trunk-only consent reminder before
  a procedure runs.
- **Claude Code reality:** Exactly one hook is wired — `plugin/hooks/hooks.json` →
  `UserPromptSubmit` → `node "${CLAUDE_PLUGIN_ROOT}/hooks/invoked-procedure-consent.mjs"`,
  trunk-only, best-effort, exits 0 on any error (plan R10; `plugin/AGENTS.md` §2.4 is the rule,
  the hook is the reminder).
- **Codex reality:** **Candidate faithful port** (U3, revising the plan's `[assumed]` R18 that
  no hook surface exists). `--strict-config` confirmed `hooks` is a recognized config root and
  `hooks.UserPromptSubmit` is a *schema-recognized, distinctly typed* event key wanting a
  *sequence* of `MatcherGroup` structs — the same `{matcher, hooks:[...]}` grouping as
  `plugin/hooks/hooks.json` (`hooks.UserPromptSubmit=1` → "expected a sequence";
  `=["echo hi"]` → "expected struct MatcherGroup"). `--dangerously-bypass-hook-trust` in
  `codex --help` confirms hooks execute at runtime and are trust-gated (U3, `allowlist-probe.md`
  Q2).
- **Documented fallback:** fold the consent-reminder doctrine into the generated Codex
  `AGENTS.md` (the prompt-level fallback Banyan already relies on for the allowlist; U4 §2.3
  makes the generated Codex `AGENTS.md` the natural home for the reminder, with auto-load as an
  additive trunk backstop). The reminder ships as doctrine whether or not the hook port lands.
- **Severity: AMBER (candidate faithful port + documented doctrine fallback).**
- **Confirm-by (UNVERIFIED — needs a live Codex runtime):** (1) the exact `MatcherGroup` field
  names and the inner command-hook schema (does it take `type="command"` + `command=...` like
  Claude Code?); (2) whether `UserPromptSubmit` fires only at the **trunk** (the top-level
  `codex exec` prompt) or also re-fires on nested-spawn `message` injection — Banyan's reminder
  is deliberately trunk-only (`plugin/AGENTS.md` §2.4); (3) the **hook-trust** workflow — the
  reminder must install without editing the user's global `~/.codex/config.toml` (R22) and must
  NOT depend on `--dangerously-bypass-hook-trust`; whether project-local hook config is honored
  under trust closes at U8/U9's live-install probe.

### Row 7 — Nested user-questions (asking the user mid-run)

- **Behavior:** Asking the user a blocking question.
- **Claude Code reality:** `AskUserQuestion` is **trunk-only** — leads do not rely on
  user-question tools, and background nested agents treat user interaction as unavailable;
  user interaction clusters at trunk boundaries (intake, post-lead approval/recovery,
  permission-cliff actions) (`plugin/AGENTS.md` §2.3). A lead reaching a user-decision point
  writes a blocker artifact and returns `needs-user`; the trunk asks and respawns a fresh lead
  with the answer (§2.3). So nested Claude Code agents **already cannot ask** — this is not a
  capability Banyan loses on Codex.
- **Codex reality:** Map the trunk question to Codex's `request_user_input` at the trunk
  (`plugin/AGENTS.md` §2.4 names `request_user_input` as the Codex equivalent of
  `AskUserQuestion`). Nested Codex agents likewise cannot ask the user — `request_user_input`
  is a trunk-level touchpoint, matching Banyan's existing trunk-only model.
- **Documented fallback:** the artifact-backed re-entry pattern Banyan already uses — a lead
  writes a `needs-user` blocker artifact and the trunk re-asks via `request_user_input`, then
  respawns the lead with the answer as resume context (the same §2.3 flow, host-swapped at the
  trunk). No new mechanism is required because Banyan never relied on nested user-questions.
- **Severity: GREEN-with-caveat / by-design** (the trunk-only model ports unchanged; the
  question tool name swaps `AskUserQuestion` → `request_user_input`).
- **Confirm-by:** `request_user_input`'s exact availability and shape under headless `codex exec`
  is `[assumed]` from doctrine; closes by locating the Codex user-input tool doc and confirming
  the trunk touchpoint at U8/U9.

---

## Severity summary

| # | Behavior | Severity | Fallback | Not-yet-parity residual |
|---|---|---|---|---|
| 1 | Autonomous recursion (depth 3) | GREEN-with-caveats | instruction-injection org-chart (not name dispatch) | raised `max_depth=3`; depth >3 and nested fan-out (Q2) not proven |
| 2 | Autonomous parallel panel fan-out | GREEN-with-caveats | spawn-reap-respawn loop; staggered starts | width >3 (Q1), nested fan-out (Q2), reslot under load (Q3) not proven |
| 3 | Agent registration on install | AMBER | two-step install (native skills + agent-install step) | exact manifest filename / agent-install shape (U8) |
| 4 | Consult / transcript loop | GREEN (faithful) | checkpoint resume mode | spawn→thread-id capture (U9); 0.139.0 schema pin (Q4) |
| 5 | Allowlist enforcement | GREEN-with-caveat / prompt-level | roster in `developer_instructions` + envelope cap discipline | none — moot via R15; same posture as Claude Code |
| 6 | Hook semantics (consent reminder) | AMBER (candidate faithful) | fold reminder into Codex `AGENTS.md` doctrine | `MatcherGroup` schema, trunk-only firing, hook-trust (U8/U9) |
| 7 | Nested user-questions | GREEN-with-caveat / by-design | trunk `request_user_input` + artifact re-entry | `request_user_input` shape under `codex exec` (U8/U9) |

## What this register gates

This is the user-confirm gate for the port shape (plan U5). The recursion and fan-out rows land
GREEN-with-caveats on the proven PoC mechanism; the agent-registration and hook rows land AMBER
with documented fallbacks; the consult/transcript loop lands FAITHFUL (revising R16); allowlist
and nested-user-questions degrade to the prompt-level / trunk-only postures Banyan already runs
on Claude Code, with no regression. No row claims parity for an unproven item: the residual
breadth items (Q1 width, Q2 nested fan-out, Q3 reslot-under-load) are carried as not-yet-parity
and deferred to follow-up, and the codex-cli 0.140.0 re-verify (Q4, R23) gates the U8 config-
contract commitment — until it passes, the contract is pinned to codex-cli 0.139.0.
