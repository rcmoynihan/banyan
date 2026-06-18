# Installing Banyan on OpenAI Codex

Banyan runs on OpenAI Codex in addition to Claude Code. The Codex artifacts ship under
`dist/codex/` (generated from `plugin/` — see the dual-host authoring contract in the root
`AGENTS.md`). This document is the install **contract**: the exact two install steps, the
load-bearing `[agents]` config block, the auth boundary, and the parity caveats an installer
accepts going in.

> **Version.** Every command, config key, and capability below is verified on **codex-cli 0.139.0
> and 0.140.0** — the `multi_agent_v1` tool surface (`spawn_agent` / `wait` / `close_agent`) and the
> `agents.*` config keys were re-checked live on 0.140.0. Treat later patch/minor bumps as
> compatible by default; re-check only if a Codex release note calls out a change to the
> multi-agent surface or the `agents.*` keys.

## Requirements

- **codex-cli 0.139.0** on `PATH`.
- A Codex **subscription login** (see [Auth](#auth-contract)). `OPENAI_API_KEY` is **not** used
  and should be unset for every Codex invocation.
- Node.js (for the agent-install step — zero dependencies, `node:` builtins only).

## Install in one command

Banyan installs from its **Codex render** (`dist/codex/`) with a single zero-dependency node
command:

```bash
# OPENAI_API_KEY stays unset; this writes only the Codex skills + agent stores, never config or auth.
node scripts/codex-build/install-codex.mjs --codex-home "$HOME/.codex"
```

This does both halves of the install against one root:

- **Skills tree → `<CODEX_HOME>/skills/banyan/`** — `AGENTS.md`, the 19 skill directories,
  `schemas/`, and the plugin manifest. This is the install root the render's rewritten
  `~/.codex/skills/banyan/...` references resolve against.
- **Agents → `<CODEX_HOME>/agents/`** — the 55 generated agent TOMLs, the store Codex scans when
  a lead spawns a child.

Preview without writing, or install one half at a time:

```bash
node scripts/codex-build/install-codex.mjs --codex-home "$HOME/.codex" --dry-run
node scripts/codex-build/install-codex.mjs --codex-home "$HOME/.codex" --skills-only
node scripts/codex-build/install-codex.mjs --codex-home "$HOME/.codex" --agents-only
```

If `--codex-home` is omitted the installer falls back to `$CODEX_HOME`, then `~/.codex`. Reinstall
is idempotent — the `skills/banyan/` root is replaced wholesale each run.

> **Why not `codex plugin marketplace add`?** Codex's native plugin install registers **skills
> only — never custom agents** (so a delegating skill like `/bn-review` would report a missing
> agent), and it reads this repo's **Claude-format** `.claude-plugin/marketplace.json`, which points
> at `plugin/` — the *Claude Code* tree (`.md` agents, `${CLAUDE_PLUGIN_ROOT}` references that do not
> resolve on Codex), **not** the Codex render in `dist/codex/`. There is no Codex-native marketplace
> pointing at `dist/codex/`, so the supported install is the direct copy above. (The render bakes
> absolute `~/.codex/skills/banyan/...` paths into its references, which a marketplace install to a
> different location would break regardless.)

### Two-step equivalent

If you prefer to run the halves separately, `--skills-only` is step one and the standalone agent
installer is step two (identical to the agent half of `install-codex.mjs`):

```bash
node scripts/codex-build/install-codex.mjs --codex-home "$HOME/.codex" --skills-only
node scripts/codex-build/install-codex-agents.mjs --codex-home "$HOME/.codex"
```

### Install root (`CODEX_HOME`)

The installer writes under one root: `--codex-home`, then `$CODEX_HOME`, then `~/.codex`. To
install into a non-default profile, pass the same `--codex-home` (or export `CODEX_HOME`) so the
skills tree and the agent store land together:

```bash
node scripts/codex-build/install-codex.mjs --codex-home "$HOME/.codex"
```

Banyan's skills isolate under `<CODEX_HOME>/skills/banyan/` and its agents under
`<CODEX_HOME>/agents/`. Codex discovers the skills by their frontmatter `name` (it recurses into the
nested `skills/banyan/skills/<skill>/SKILL.md` layout); the render's `schemas/` and
`.claude-plugin/plugin.json` ship alongside so every `~/.codex/skills/banyan/...` reference resolves.

## The `[agents]` config contract

Banyan's recursion and fan-out require multi-agent support and the `[agents]` config below. This
block is a **load-bearing contract**, not a suggestion. On codex-cli 0.140.0 `multi_agent` is a
stable, default-enabled feature; each key is proven on codex-cli 0.139.0 and 0.140.0:

| Key | Value | Why it is load-bearing |
|---|---|---|
| `agents.max_depth` | `3` | Banyan's lead pattern nests trunk → lead → unit-lead → child/reviewer (depth 3). **Proven:** a `max_depth=1` control of the identical chain stalls at depth 1 and never reaches the deeper spawn. |
| `agents.max_threads` | `8` | Bounds panel concurrency. Set **at least as high as the widest declared panel** so a lead's siblings overlap. **Proven:** at `max_threads=2` against 3 siblings the runtime *rejects* the surplus spawn (see the reslot caveat); at `max_threads=8` all three overlap. Banyan's widest standing panel (the review panel) fits within 8. |
| `agents.job_max_runtime_seconds` | set a ceiling (e.g. `1800`) | Bounds a single agent job's wall time so a stuck spawn cannot run unbounded. Tune to the longest legitimate unit/review. |
| multi-agent support | **available** | The `multi_agent_v1` tool surface (`spawn_agent` / `wait` / `close_agent`) is the spawn mechanism. It is a **stable, default-enabled** feature on codex-cli 0.140.0 (experimental in older builds); confirm `codex features list` shows `multi_agent` enabled. The port does not run without it. |

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
- The install touches **neither** `~/.codex/config.toml` **nor** `auth.json`. `install-codex.mjs`
  writes only `<CODEX_HOME>/skills/banyan/` and `<CODEX_HOME>/agents/`; config is delivered via `-c`
  overrides or a project-local file (above).

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
- **Agent registration is part of the install, not the native marketplace.** Codex's native plugin
  install handles skills only; `install-codex.mjs` registers the 55 agents into
  `<CODEX_HOME>/agents/` as its second half, or delegating skills report missing agents.
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

> **Verified on codex-cli 0.139.0** (subscription login, `OPENAI_API_KEY` unset): the one-command
> install lands all 19 skills + 55 agents, Codex discovers every `bn-*` skill, `multi_agent` is
> stable + enabled, and `$bn-hello` reports the version from the install root. The full delegation
> check (step 3, R25) is the remaining manual confirmation.

A clean install passes when **both** halves landed:

1. **Skills load.** List the discovered skills — non-interactively:

   ```bash
   codex exec --sandbox read-only --skip-git-repo-check \
     "List every skill available to you whose name starts with 'bn-'. Output only the names."
   ```

   or in a session via the `/skills` TUI. Expected: the Banyan skills appear — `bn-hello`,
   `bn-grow`, `bn-plan`, `bn-work`, `bn-review`, `bn-debug`, `bn-ask`, `bn-brainstorm`,
   `bn-spec-stress`, `bn-onboard`, `bn-ship`, `bn-resolve-pr`, `bn-learn`, `bn-evolve`,
   `bn-conventions`, `bn-doctor`, `bn-mock`, `bn-poc`, `bn-runbook` (19 skills). A second cheap
   end-to-end check: `codex exec ... '$bn-hello'` should print `Banyan v<version> is installed.`

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

2. **Agents registered.** Confirm the 55 agent definitions landed in the store:

   ```bash
   ls "$CODEX_HOME"/agents/*.toml | wc -l   # expect 55
   ```

3. **A delegating skill finds its agent (the R25 check).** Invoke a skill that delegates to an
   agent and confirm it does **not** report a missing agent. For example invoke `$bn-review` (its
   review lead spawns the reviewer panel) and confirm the spawned agent resolves rather than
   failing with a missing-agent error. This is the assertion that the agent half of the install
   actually closed the native-install gap — a skill that loads but cannot find its delegate is a
   failed install.

Run every step with `OPENAI_API_KEY` unset and the subscription login active, against the single
`CODEX_HOME` used for both install halves.

## What is left untouched

- The Claude Code product surface (`plugin/`, the Claude Code manifests) is unchanged. Banyan
  remains a Claude Code plugin; this is the Codex install path alongside it.
- The user's global `~/.codex/config.toml` and `auth.json` are never edited by the install.
