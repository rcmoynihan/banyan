# Codex render field map

How `render-codex.mjs` maps the `plugin/` source to the Codex render under `dist/codex/`.
`plugin/` is the single source; this render is derived, never hand-maintained.

## Agents: `plugin/agents/<stem>.md` → `dist/codex/agents/<stem>.toml`

Each agent is a Codex subagent TOML. The org-chart is realized by instruction-injection into
generic `agent_type:"default"` spawns — there is no callable custom role name — so a
generated agent's `developer_instructions` ARE the payload a parent injects.

| Source (Claude Code) | Codex TOML field | Rule |
|---|---|---|
| frontmatter `name` | `name` | verbatim; must equal the file stem |
| frontmatter `description` | `description` | verbatim (TOML basic string) |
| frontmatter `model` | `model_reasoning_effort` | tier map: `opus` → `high`, `sonnet` → `medium`. The concrete model name is left unspecified, so it inherits from the parent session. |
| frontmatter `tools` `Agent(...)` roster | folded into `developer_instructions` | for panel-fanning leads, the roster is named in the reap-respawn block as the declared spawn roster; there is no native Codex allowlist field, so the roster + envelope cap discipline are prompt-level |
| frontmatter `color` | dropped | no Codex analog |
| markdown body | `developer_instructions` | path-rewritten; emitted as a TOML literal string (`'''...'''`) so backslashes and other characters pass through verbatim |

### `developer_instructions` body

- `${CLAUDE_PLUGIN_ROOT}/...` rewrites to `~/.codex/skills/banyan/...` (the install-root anchor).
- A **panel-fanning lead** — a roster of two or more spawnable types whose body describes a
  parallel panel — gets the spawn-reap-respawn loop appended: issue the panel spawns up front
  (staggered, not a barrier), and when a spawn returns an empty receiver (the `max_threads`
  bound rejecting the surplus, not a queue) `wait` + `close_agent` a finished sibling to free a
  slot, then re-spawn. The single recursive-self spawners (`bn-probe`, `bn-thread-chaser`) are
  not panels and carry no loop.
- The body is emitted verbatim otherwise; no custom `agent_type` role name is emitted (R15).

## Skills: `plugin/skills/<name>/SKILL.md` → `dist/codex/skills/<name>/SKILL.md`

Near-1:1. Frontmatter `name`, `description`, optional `argument-hint` are preserved; the body
is path-rewritten. The combined skills catalog (`name: description` per skill) is capped at
8000 characters — the build fails loudly rather than silently truncating if the cap is exceeded.

## Doctrine: `plugin/AGENTS.md` → `dist/codex/AGENTS.md`

Path-rewritten, plus an appended **invoked-procedure consent** section: Codex exposes no
confirmed `UserPromptSubmit`-class hook surface, so the trunk-only consent reminder ships as
`AGENTS.md` doctrine (prompt-level discipline), with native `AGENTS.md` auto-load as the
additive trunk backstop.

## Path rewrite classes (from the U4 rewrite map)

Every `${CLAUDE_PLUGIN_ROOT}/<rest>` reference rewrites to `~/.codex/skills/banyan/<rest>` — the
deterministic Codex skills install root, the form that resolves when the reader is an agent body
rather than a skill loader. The one Claude Code hook command has no Codex path target; its
consent reminder folds into `AGENTS.md` doctrine. The host-neutral `node --test` scripts are
untouched source.

## Not rendered

`dist/codex/.build-manifest.json` is not written by this generator (it is the drift gate's
file). The render's output is `agents/`, `skills/`, and `AGENTS.md`.
