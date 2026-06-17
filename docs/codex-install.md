# Installing Banyan on OpenAI Codex

Banyan runs on OpenAI Codex in addition to Claude Code. The Codex artifacts ship under
`dist/codex/` (generated from `plugin/` — see the dual-host authoring contract in the root
`AGENTS.md`). This document is the install **contract**: the exact two install steps, the
load-bearing `[agents]` config block, the auth boundary, and the parity caveats an installer
accepts going in.

> **Version pin.** Every command, config key, and capability below is verified on
> **codex-cli 0.139.0**. codex-cli 0.140.0 is available but is **UNVERIFIED — re-verify before
> bumping**: the `multi_agent_v1` tool surface (`spawn_agent` / `wait` / `close_agent`) and the
> `agents.*` config keys may shift across versions. Do not raise the pin without re-running the
> 0.140.0 re-verify of those surfaces. Until that passes, this contract is pinned to 0.139.0.

## Requirements

- **codex-cli 0.139.0** on `PATH`.
- A Codex **subscription login** (see [Auth](#auth-contract)). `OPENAI_API_KEY` is **not** used
  and should be unset for every Codex invocation.
- Node.js (for the agent-install step — zero dependencies, `node:` builtins only).

## The install is two steps

Codex's **native plugin install registers skills only — it does not register custom agents.**
Banyan ships 54 agents its skills delegate to, so without a second step a delegating skill (for
example `/bn-review`, which spawns its reviewer panel) reports a missing agent at runtime. The
install is therefore:

1. **Native skills install** — register the marketplace, then install the skills through the
   `/plugins` TUI.
2. **Banyan agent-install step** — run a zero-dependency node installer that places the 54
   generated agent definitions into the Codex agent store.

Both steps run against **one install root** (`CODEX_HOME`). Pick that root once and use it for
every command below.

### Pick one install root (`CODEX_HOME`)

`CODEX_HOME` defaults to `~/.codex`. To install Banyan into a non-default profile, export the
same `CODEX_HOME` before **every** Codex command and the agent-install step, so the native
skills install and the agent store land under one root:

```bash
export CODEX_HOME="$HOME/.codex"   # or a dedicated profile dir; use the SAME value throughout
```

Banyan's skills isolate under `"$CODEX_HOME"/skills/banyan/` and its agents under
`"$CODEX_HOME"/agents/`.

### Step 1 — native skills install (marketplace + `/plugins` TUI)

Register the Banyan marketplace from a checkout of this repository:

```bash
codex plugin marketplace add <path-to-this-repo>
```

Then install the **skills** through the interactive `/plugins` TUI. codex-cli registers a
marketplace but exposes **no plugin-install subcommand for an added marketplace**, so the skills
half is a TUI action, not a one-liner:

1. Launch Codex: `codex`
2. Open the plugins panel: `/plugins`
3. Select the **banyan** marketplace entry and install it.

This installs the skills under `"$CODEX_HOME"/skills/banyan/`. It does **not** install the
agents — that is Step 2.

> **Residual confirm-by (R20).** The packaging manifest ships as
> `scripts/codex-build/codex-plugin.json` (hand-authored packaging tooling, kept out of the
> render-owned `dist/codex/` tree). The exact native marketplace manifest **filename and schema**
> Codex's `plugin marketplace add` expects is a confirm-by item against the current Codex
> skills/marketplace docs; if Codex documents a different filename and location, copy or rename the
> shipped manifest to match — the manifest's contents (name, description, skills/agents locations,
> the agent-install pointer) are the load-bearing part.

### Step 2 — Banyan agent-install step (register the 54 agents)

After the skills install, register the agents. From a checkout of this repository:

```bash
# OPENAI_API_KEY stays unset; this step writes only the Codex agent store, never config or auth.
node scripts/codex-build/install-codex-agents.mjs --codex-home "$CODEX_HOME"
```

This copies the 54 generated agent definitions from `dist/codex/agents/*.toml` into
`"$CODEX_HOME"/agents/`, the agent store Codex scans when a lead spawns a child. Preview the plan
without writing:

```bash
node scripts/codex-build/install-codex-agents.mjs --codex-home "$CODEX_HOME" --dry-run
```

If `--codex-home` is omitted the installer falls back to `$CODEX_HOME`, then `~/.codex` — keep it
explicit when you used a non-default profile in Step 1.

## The `[agents]` config contract

Banyan's recursion and fan-out **do not run** without experimental multi-agent enabled and the
`[agents]` config below. This block is a **load-bearing contract**, not a suggestion. Each key is
proven on codex-cli 0.139.0:

| Key | Value | Why it is load-bearing |
|---|---|---|
| `agents.max_depth` | `3` | Banyan's lead pattern nests trunk → lead → unit-lead → child/reviewer (depth 3). **Proven:** a `max_depth=1` control of the identical chain stalls at depth 1 and never reaches the deeper spawn. |
| `agents.max_threads` | `8` | Bounds panel concurrency. Set **at least as high as the widest declared panel** so a lead's siblings overlap. **Proven:** at `max_threads=2` against 3 siblings the runtime *rejects* the surplus spawn (see the reslot caveat); at `max_threads=8` all three overlap. Banyan's widest standing panel (the review panel) fits within 8. |
| `agents.job_max_runtime_seconds` | set a ceiling (e.g. `1800`) | Bounds a single agent job's wall time so a stuck spawn cannot run unbounded. Tune to the longest legitimate unit/review. |
| experimental multi-agent | **ENABLED** | The `multi_agent_v1` tool surface (`spawn_agent` / `wait` / `close_agent`) is the spawn mechanism. The port does not run without it. |

### How to apply the config — never the global `config.toml`

The install **never edits the user's global `~/.codex/config.toml`.** Apply the contract one of
two ways:

**A. Per-invocation `-c` overrides (matches the proven PoC path):**

```bash
unset OPENAI_API_KEY
codex exec --json --sandbox workspace-write \
  -c agents.max_depth=3 \
  -c agents.max_threads=8 \
  -c agents.job_max_runtime_seconds=1800 \
  "<your top-level Banyan prompt>"
```

**B. A project-local config file** scoped to the project you run Banyan in, leaving the global
config untouched. Use whichever your workflow prefers; both deliver the same contract.

## Auth contract

- Authenticate with your **Codex subscription login** (`"$CODEX_HOME"/auth.json`). This is the
  user-authorized, flat-rate backend the port is proven against.
- **`OPENAI_API_KEY` must be unset / not depended on.** If it is present in the shell it forces
  the API-key path; unset it for every Codex invocation so Codex uses the subscription auth.
- The install touches **neither** `~/.codex/config.toml` **nor** `auth.json`. The agent-install
  step writes only `"$CODEX_HOME"/agents/`; config is delivered via `-c` overrides or a
  project-local file (above).

## Accepted parity caveats (read before installing)

These are documented in the [Codex parity-gap register](decisions/codex-parity-gap-register.md);
the load-bearing ones for the install path:

- **Raising `max_depth` is the docs-discouraged knob.** depth-3 requires
  `agents.max_depth=3`, above the default-style cap of 1. This is an accepted, experimental
  raised-limit dependency — it is required for the port to run.
- **Fan-out starts are staggered, not a barrier launch.** A lead's N `spawn_agent` calls emit as
  sequential tool round-trips a few seconds apart; a panel gets real concurrency, not synchronized
  starts.
- **`max_threads` bounds by reject-then-reslot, not by queueing.** A spawn beyond `max_threads` is
  **rejected** with an empty receiver — it is not transparently queued. Generated lead bodies that
  fan out wider than `max_threads` carry a spawn-reap-respawn loop (`wait` + `close_agent` to free
  a slot, then re-spawn).
- **Agent registration is a separate step.** Native plugin install handles skills only; the
  agent-install step (Step 2) is required, or delegating skills report missing agents.
- **The org-chart is instruction-injection, not name dispatch.** Custom agent role *names* are not
  callable as `agent_type` in 0.139.0; every spawn is an `agent_type:"default"` spawn carrying the
  role's instructions. The shipped agent definitions and lead bodies are generated for this model.
- **Not-yet-parity (carried, not claimed).** Panel width > 3, fan-out nested inside the depth-3
  recursion, and the reslot-under-load path (e.g. 6 siblings at `max_threads=2`) are **not proven
  parity** and are deferred to follow-up verification.

## Routing `/bn-*` skills

Banyan's procedures invoke through Codex skills: `$<skillname>` or the `/skills` listing (for
example `$bn-hello`, `$bn-review`, `$bn-plan`). Whether Codex exposes a dedicated
custom-prompts / slash-command surface beyond skill invocation is an open **research item** — this
contract invents no prompts format and routes through skills until that surface is located.

## Verification

> **UNVERIFIED (live Codex install).** The checks below need a live codex-cli 0.139.0 runtime and a
> subscription login. They are documented as manual steps; this run does not drive a live install.

A clean install passes when **both** halves landed:

1. **Skills load.** In a Codex session, list skills:

   ```bash
   codex   # then in the TUI:
   /skills
   ```

   Expected: the Banyan skills appear — `bn-hello`, `bn-grow`, `bn-plan`, `bn-work`, `bn-review`,
   `bn-debug`, `bn-ask`, `bn-brainstorm`, `bn-spec-stress`, `bn-onboard`, `bn-ship`,
   `bn-resolve-pr`, `bn-learn`, `bn-evolve`, `bn-conventions`, `bn-doctor`, `bn-mock`, `bn-poc`,
   `bn-runbook` (19 skills).

   > **`/bn-doctor` is a Claude-Code-host health check, not a Codex one.** `bn-doctor` ships in
   > the Codex render for completeness, but its checks are Claude-Code-host-specific and do **not**
   > constitute a Codex health check. On a Codex host its results are not meaningful: Check 1 runs
   > `claude --version` and REDs below 2.1.172 (no `claude` binary exists on a Codex host), Check 3
   > writes its probe scratch into `.claude/banyan-doctor/` (a Claude-Code path) and grades an
   > `Agent(...)` spawn-type allowlist that Codex does not enforce by design (parity register Row 5:
   > prompt-level, not runtime-enforced — the same posture as Claude Code), and Check 4 locates the
   > per-agent transcript at the undocumented Claude Code path rather than the Codex
   > `<CODEX_HOME>/sessions/**` rollout substrate (parity register Row 4). To verify a Codex install,
   > use the steps in this section, not `/bn-doctor`. This is a documented Codex gap (see the
   > [parity-gap register](decisions/codex-parity-gap-register.md)).

2. **Agents registered.** Confirm the 54 agent definitions landed in the store:

   ```bash
   ls "$CODEX_HOME"/agents/*.toml | wc -l   # expect 54
   ```

3. **A delegating skill finds its agent (the R25 check).** Invoke a skill that delegates to an
   agent and confirm it does **not** report a missing agent. For example invoke `$bn-review` (its
   review lead spawns the reviewer panel) and confirm the spawned agent resolves rather than
   failing with a missing-agent error. This is the assertion that the agent-install step (Step 2)
   actually closed the native-install gap — a skill that loads but cannot find its delegate is a
   failed install.

Run every step with `OPENAI_API_KEY` unset and the subscription login active, against the single
`CODEX_HOME` used for both install halves.

## What is left untouched

- The Claude Code product surface (`plugin/`, the Claude Code manifests) is unchanged. Banyan
  remains a Claude Code plugin; this is the Codex install path alongside it.
- The user's global `~/.codex/config.toml` and `auth.json` are never edited by the install.
