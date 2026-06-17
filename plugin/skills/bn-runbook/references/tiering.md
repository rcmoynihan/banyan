# Tiering & the read-only-on-source contract

The probe (SKILL Step 1) finds entry points and dependencies; this reference is the decision rule
for tiering each dependency (SKILL Step 2) and the hard read-only contract every step honors.

## The five tiers (assign exactly one per dependency, R2)

Each external dependency the running app needs gets **exactly one** tier. The tier decides whether
the execute-validate pass may run the leg at all and how the recipe records it.

- **`drivable-as-is`** — the dependency runs locally as-is with no surrogate: an in-process store, a
  local file, a service already reachable on the dev machine. The smoke journey drives it directly;
  legs over this surface are candidates for `status: proven`.
- **`cheap-surrogate`** — a faithful-enough local stand-in already exists or is trivially available:
  a fixture, a docker-compose service, a contract mock, an in-memory/SQLite swap. The recipe names
  the surrogate in the `surrogate` field (R9). Drivable under budget; a driven leg is `proven`.
- **`trigger-and-monitor`** — the workflow is *started* from the dev machine but its compute runs
  elsewhere (a queue worker, a remote batch, a scheduled job). The recipe records both how to
  **start** it and how to **observe/poll** it (`drive.observe`, required for this mode, R8). It is
  executed only when its cost basis is zero; a non-zero cost basis (money or a remote batch) makes
  it `declared`, never run (see the budget override in `execute-validate.md`).
- **`no-dev-equivalent`** — there is no faithful local stand-in and the real dependency cannot be
  driven from a dev machine (a production-only system, a partner integration with no sandbox). It is
  **never executed** (R4); recorded `declared` with a `do_not_attempt` note.
- **`expensive-or-slow`** — driving the real dependency costs non-zero money, burns a metered quota,
  or takes prohibitively long (a paid API call, a large remote batch, a multi-minute pipeline). It
  is **never executed** (R4); recorded `declared` with a `do_not_attempt` note carrying the cost
  basis.

A `declared` leg tiered `expensive-or-slow` or `no-dev-equivalent` **must** carry `do_not_attempt`
(`cost_basis` + `reason`) — the validator enforces this, so a recipe missing it fails closed.

## Read-only-on-source contract (R5)

The skill never installs, migrates, seeds, or writes a project file to force a green run. The only
project-file write the whole skill performs is the single approval-gated recipe block (SKILL Step
5). A leg blocked **only** by missing setup — an uninstalled dependency, an unmigrated database, a
missing seed — is recorded as a **blocker** (a leg that could be driven if the setup existed), never
forced by running the setup. The blocker is exactly the kind of cheap-fruit gap that routes to
`/bn-plan` (`plan-handoff.md`). The skill builds **no** surrogate, fixture, fast-path mode, install,
or migration itself (R12).

## Forbidden-Bash list (ported verbatim from bn-dogfood-verifier's hard contract)

Bash is constrained to **launch, probe, observe, and tear down** a running app, plus read-only
inspection. Never run anything that:

- **installs** — `npm/pnpm/yarn install`, `pip install`, `bundle install`, `cargo add`;
- **migrates or seeds** — `db:migrate`, `db:seed`, `rails db:*`, `prisma migrate`, `alembic`;
- **generates or builds artifacts into the tree** — codegen, `--write`/`--fix` formatters,
  scaffolding;
- **writes project files** — `>`, `>>`, `tee`, `sed -i`, `mv`, `cp`, `rm` over tracked paths,
  `git add/commit/checkout/restore/stash/push`.

**Allowed Bash:** `command -v` / capability probes; starting a dev server in the background;
`curl` / port probes to wait for readiness; `agent-browser` commands (`open`, `snapshot`, `click`,
`fill`, `screenshot`, console/error reads); killing the server you started; read-only `git`/`gh`
(`git status`, `git diff`, `git show`, `git log`, `gh pr view`); reading logs and output you
captured; the project's read-only `node` validator invocation
(`validate-drive-recipe.mjs <file>`). The only project-file write is the approval-gated recipe block.
