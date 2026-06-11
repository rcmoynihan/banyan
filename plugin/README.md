# Banyan

Banyan is a Claude Code plugin: a hierarchical, self-compounding agent harness built
for nested subagents (Claude Code >= 2.1.172, depth 5). It replaces the hub-and-spoke
orchestration of a flat agent fleet with **lead agents that own whole subtrees**, a
**file-based run ledger**, **delegation envelopes with budgets**, and **fractal lesson
harvesting**.

This directory (`plugin/`) is the plugin root: the manifest lives at
`.claude-plugin/plugin.json`, co-located here, and components live alongside it.

## Status

Early scaffold (v0.1.0). Today the plugin ships one smoke-test skill (`/bn-hello`)
and one stub agent (`bn-echo`) so the loader, skill dispatch, and Agent-tool spawn
paths can be exercised end to end. The review, research, and delivery subtrees land
in later phases.

## Layout

```
plugin/
  .claude-plugin/plugin.json   plugin manifest (name, version, metadata)
  agents/                      one agent per file: bn-*.md
    bn-echo.md                 read-only stub agent (spawn smoke test)
  skills/                      one skill per directory: bn-*/SKILL.md
    bn-hello/SKILL.md          install + version smoke-test skill
  schemas/                     vendored/shared schema files (later phases)
  AGENTS.md                    Banyan's standing conventions contract
  README.md                    this file
```

`AGENTS.md` is the authoritative contract for everything under `plugin/`: the `bn-`
namespace prefix, agent/skill frontmatter formats, the eight invariants, the lead
pattern, and the protected-artifact rules. Read it before adding components.

## Install for development

Two scripts under the repo-root `scripts/` directory drive the dev loop (created in
Phase 0 / U2):

- `scripts/dev-install.ps1` -- copies or symlinks this plugin into a sandbox project
  so a `claude` session loads it without a marketplace round-trip.
- `scripts/smoke.ps1` -- installs the plugin into the test fixture and runs the stub
  skill headlessly (`claude -p`) to confirm the load path works.

After installing, open a `claude` session in the sandbox and run `/bn-hello`; it
should confirm Banyan is installed and print its version.

## Add as a marketplace

From a checkout of the Banyan repository:

```
claude plugin marketplace add <repo-root>
```

where `<repo-root>` is the directory containing `.claude-plugin/marketplace.json`
(the parent of this `plugin/` directory). Then enable the plugin:

```
claude plugin install banyan
```

Restart or reload the `claude` session so the plugin's agents and skills load, then
verify with `/bn-hello`.

## License

MIT. Banyan harvests leaf assets from EveryInc's compound-engineering plugin (also
MIT); vendoring provenance is tracked in `../vendor/MANIFEST.md` once Phase 1 lands.
