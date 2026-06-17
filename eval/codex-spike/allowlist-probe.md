# Codex allowlist + hook enforcement spike (U3)

What bounds spawns on Codex, and is there a hook surface for the trunk-only consent
reminder? This record answers two questions for the parity-gap register (U5), with
evidence: (1) does the Codex runtime enforce a per-subagent spawn allowlist — the analog of
Banyan's `Agent(...)` frontmatter roster (R5/R18); (2) does Codex expose a hook surface that
could carry Banyan's one `UserPromptSubmit` consent reminder (R10/R18).

Both behaviors are empirically shaky even on Claude Code: `plugin/AGENTS.md` §2's empirical
note records that `Agent(agent_type)` allowlist semantics in *nested* contexts are
under-documented for 2.1.172, and that if the harness ignores a nested allowlist, accounting
falls back to the prompt-level envelope contract. The Codex side is assessed against that
same standard — the question is enforcement, not declaration.

## Evidence basis

- **Runtime probed:** codex-cli 0.139.0 (`/opt/homebrew/bin/codex`), the same version the PoC
  ran on. `codex doctor` confirms the multi-agent spawn surface is live and exercised:
  rollout DB sources include `subagent:thread_spawn=721` and `subagent:review=2`.
- **Probe method:** read-only config-schema inspection via `codex exec --strict-config -c
  <key>=<value> "noop"` with `OPENAI_API_KEY` UNSET (subscription auth, R22). `--strict-config`
  "Error[s] out when config.toml contains fields that are not recognized by this version of
  Codex." A config-load error therefore reveals the typed shape of a config key *before any
  network turn*; an absent error means the key is accepted by the schema. The user's global
  `~/.codex/config.toml` was never edited — every key was supplied via `-c` overrides (R22).
- **PoC evidence reused (read-only):** `.banyan/runs/2026-06-17-001-plan-codex-port/briefs/poc-notes.md`
  (iterations 1 + 2) and the existing PoC sandbox roles
  `poc/codex-dual-host-port/.codex/agents/{lead,unit-lead,leaf}.toml` (read, not modified — the
  PoC owns those files, DI5).
- **Doc claims not fetchable here:** WebFetch is not in this spike's toolset, so the Codex
  subagents doc (https://developers.openai.com/codex/subagents) could not be retrieved; any
  claim resting on it alone is tagged `[assumed]` with a confirm-by, per DI4. Where the local
  `--strict-config` probe gives a direct answer, that supersedes the doc claim.

## Q1 — Does Codex enforce a per-subagent spawn allowlist (the `Agent(...)` analog)?

**Finding: NO confirmed allowlist field gates *which* role a subagent may spawn; and even if
one existed, it would not bind, because dispatch is by instruction-injection into `default`
spawns, not by name (PoC R15). The org-chart constraint is prompt-level envelope discipline on
Codex, exactly as on Claude Code (R18 confirmed, with one refinement below).**

Evidence:

1. **`[agents]` is a role-name map of role definitions, not a table of spawn-gating scalars.**
   Probing a hypothetical top-level allowlist field:
   ```
   $ codex exec --strict-config -c 'agents.allowed_agents=["foo"]' "noop"
   Error loading config.toml: invalid length 1, expected struct AgentRoleToml with 3 elements
   ```
   The runtime parsed `agents.allowed_agents` as a *role entry keyed "allowed_agents"* whose
   value must be an `AgentRoleToml` (a 3-element struct — matching the documented
   `name`/`description`/`developer_instructions`, R13). There is no top-level
   `agents.allowed_agents` / `agents.allowlist` *scalar* in the schema: the `[agents]` table
   is a map from role name to role definition, with no membership/who-may-spawn-whom gate.

2. **Recognized `[agents]` scalars are the fan-out *bounds*, not a type allowlist.** Under
   `--strict-config`, these load without error (recognized by 0.139.0):
   ```
   -c agents.max_depth=3                  -> recognized (no config error)
   -c agents.max_threads=8                -> recognized (no config error)
   -c agents.job_max_runtime_seconds=600  -> recognized (no config error)
   ```
   These bound *how deep* and *how many concurrent* spawns run — the PoC already proved
   `max_depth` is load-bearing (the `max_depth=1` control stalled at depth 1, poc-notes iter 1)
   and `max_threads` bounds concurrency by reject-then-reslot (poc-notes iter 2, R21). None of
   them gates *which role type* may be spawned. They are quantity/depth bounds, not an
   allowlist.

3. **A per-role allowlist field on `AgentRoleToml` is empirically INCONCLUSIVE via this probe,
   but moot.** `--strict-config` does **not** deep-validate unknown *inner* fields of an
   `agents.<role>` map entry: a definitely-bogus field
   (`-c 'agents.myrole.totally_bogus_zzz="x"'`, with `name`/`description`/
   `developer_instructions` supplied) was NOT rejected at config load. So the probe cannot, on
   its own, distinguish "a per-role allowlist field exists" from "an unknown field is silently
   ignored." `[assumed]` from the doc + PoC: no per-role spawn allowlist is documented or
   observed. **confirm-by:** read https://developers.openai.com/codex/subagents for any
   `allowed_*`/`allowlist`/`can_spawn` field on the role schema, or drive a live spawn that
   attempts a not-granted type. **Why it is moot regardless (PoC R15, dispositive):** the PoC
   proved custom `.codex/agents/*.toml` role NAMES are **not callable as `agent_type`** in
   0.139.0 — every spawn falls back to `agent_type:"default"` with the role's
   `developer_instructions` injected into the spawn `message` (poc-notes iter 1 `:72-77,138`,
   persisting for fan-out at iter 2 `:354`). A name-based allowlist cannot gate dispatch that
   never resolves a name in the first place. The roster lives in the parent's injected
   instructions; restricting "which type may be spawned" is realized by *what instruction
   payload the parent chooses to inject*, i.e. prompt-level envelope discipline.

**Consequence for the port (feeds U5 row "Allowlist enforcement"):** the `Agent(...)` roster
renders into the generated lead's `developer_instructions` as the declared spawn roster plus
the envelope's prompt-level cap discipline (the U6 generator's job). Codex enforces the
fan-out *bounds* server-side (`max_depth`, `max_threads`, `job_max_runtime_seconds` — proven),
but does **not** enforce a *type* allowlist; that constraint degrades to prompt-level envelope
discipline, identical to the Claude Code posture in `plugin/AGENTS.md` §2's empirical note.
Severity for the register: **GREEN-with-caveat / prompt-level** — same fallback Banyan already
relies on, no regression introduced by the port.

## Q2 — Is there a hook surface for the trunk-only consent reminder?

**Finding: Codex 0.139.0 DOES expose a `hooks` config surface whose shape mirrors Claude
Code's `hooks.json` — this REVISES the R18 assumption that no `UserPromptSubmit`-class hook
exists. The consent reminder has a candidate faithful port, not only an AGENTS.md-doctrine
fallback.**

Evidence:

1. **`hooks` is a recognized config root, and `UserPromptSubmit` is an accepted event key.**
   ```
   $ codex exec --strict-config -c 'hooks.UserPromptSubmit=1' "noop"
   Error loading config.toml: invalid type: integer `1`, expected a sequence
   ```
   `hooks` did NOT error as an "unknown configuration field" (contrast `multi_agent`,
   `subagents`, `events`, `user_prompt_hook`, which each errored `unknown configuration field`).
   `hooks.UserPromptSubmit` is schema-recognized and wants a *sequence* — the same event name
   Banyan's one hook fires on. Sharper control: `hooks.UserPromptSubmit=1` is *type-validated*
   ("expected a sequence"), whereas an arbitrary key (`hooks.BogusEventName=1`) is silently
   accepted — so the `hooks` table is an open map of event keys, and `UserPromptSubmit` is a
   *distinctly typed, recognized* event within it, not merely a tolerated unknown.

2. **The sequence elements are `MatcherGroup` structs — the Claude Code matcher-group shape.**
   ```
   $ codex exec --strict-config -c 'hooks.UserPromptSubmit=["echo hi"]' "noop"
   Error loading config.toml: invalid type: string "echo hi", expected struct MatcherGroup
   ```
   A `[{hooks=[]}]` element and a `[{}]` element both loaded without a config error, i.e.
   `MatcherGroup` accepts an inner `hooks` sequence — structurally the same
   `{matcher, hooks:[...]}` grouping as `plugin/hooks/hooks.json`
   (`UserPromptSubmit -> [ { hooks: [ {type:"command", command:...} ] } ]`).

3. **Hooks are a real, trust-gated runtime feature, not a forward-declared stub.** Both
   `codex --help` and `codex exec --help` carry:
   ```
   --dangerously-bypass-hook-trust
       Run enabled hooks without requiring persisted hook trust for this invocation.
       DANGEROUS. Intended only for automation that already vets hook sources.
   ```
   "enabled hooks", "persisted hook trust", "vets hook sources" confirm hooks execute at
   runtime and are gated by a trust mechanism.

**`[assumed]` / confirm-by on the remaining details (DI4):**
- The exact `MatcherGroup` field names and the inner command-hook schema (does it take a
  `type="command"` + `command=...` like Claude Code, or a different element shape?) — the
  empty-element probe passed config-load but does not enumerate the fields. **confirm-by:**
  https://developers.openai.com/codex/subagents (or the Codex hooks doc) for the `MatcherGroup`
  / command-hook schema, then a live `codex exec` with a one-line `UserPromptSubmit` command
  hook configured via `-c` to confirm it fires and respects hook-trust.
- Whether `UserPromptSubmit` fires only at the **trunk** (the top-level `codex exec` prompt) or
  also on nested-spawn message injection. Banyan's reminder is deliberately trunk-only
  (`plugin/AGENTS.md` §2.4; the Claude Code hook is best-effort, exits 0 on any error, R10).
  **confirm-by:** a live probe spawning a child and observing whether the hook re-fires on the
  injected child `message`.
- The **hook-trust** workflow — the consent reminder must install without editing the user's
  global `~/.codex/config.toml` (R22). Whether project-local hook config is honored under hook
  trust, or whether `--dangerously-bypass-hook-trust` would be required (which the install must
  NOT depend on), is **UNVERIFIED — needs a live Codex runtime this spike cannot drive
  end-to-end.** confirm-by: U8/U9 live-install probe.

## Summary for U5 (the parity-gap register)

| Question | Finding | Evidence | Register disposition |
|---|---|---|---|
| Per-subagent spawn allowlist (Agent(...) analog)? | No type allowlist; `[agents]` is a role-name map with `max_depth`/`max_threads`/`job_max_runtime_seconds` *bounds* only. Moot regardless — dispatch is `default`+instruction-injection (R15), so a name allowlist would not bind. | `agents.allowed_agents` -> "expected struct AgentRoleToml with 3 elements"; the three scalars recognized under `--strict-config`; poc-notes R15 named-role-dispatch gap | Allowlist enforcement = **prompt-level envelope discipline** (same as Claude Code §2 empirical note); fan-out *bounds* enforced server-side. No regression. |
| Hook surface for the consent reminder? | YES — `hooks.UserPromptSubmit` is schema-recognized, wants `MatcherGroup` (Claude Code's matcher-group shape); `--dangerously-bypass-hook-trust` confirms hooks run, trust-gated. Revises R18. | `hooks.UserPromptSubmit=1` -> "expected a sequence"; `=["echo hi"]` -> "expected struct MatcherGroup"; hook-trust flag in `--help` | Hook semantics = **AMBER, candidate faithful port** (Codex `UserPromptSubmit` command hook), AGENTS.md-doctrine fold-in as fallback; exact schema + trunk-only + project-local-trust semantics UNVERIFIED pending live drive. |

**Net:** the allowlist gap degrades cleanly to the prompt-level discipline Banyan already uses;
the hook gap is *narrower than R18 assumed* — a real `UserPromptSubmit` hook surface exists, so
the consent reminder can aim for a faithful port with a documented doctrine fallback. Items
needing a live Codex runtime this spike could not drive end-to-end are marked **UNVERIFIED**
above with their confirm-by probes; doc-only claims are tagged `[assumed]` per DI4. The
Claude Code spine (`node --test --test-reporter tap
plugin/skills/bn-conventions/scripts/*.test.mjs`) is green (243/243), unaffected by this
read-only spike.
