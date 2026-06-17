---
name: bn-runbook
description: "Probe a repo read-only for its drive entry points and external dependencies, tier each dependency, execute-validate only the cheap/drivable surface under a budget ceiling (marking what it ran proven), declare expensive or no-dev-equivalent legs without running them, and write an approval-gated machine-readable drive-recipe block into AGENTS.md/CLAUDE.md. Routes enabling work to /bn-plan; never builds surrogates itself. Re-runnable; the recipe is refreshed only by re-running."
argument-hint: "[blank = probe this repo | --report-only (probe + tier, no recipe write)]"
---

# bn-runbook

You are the user-facing trunk for drive-readiness. You probe this repo to find how its app is
driven and what it depends on, tier each dependency, prove the cheap/drivable surface by actually
running it under a budget ceiling, *declare* the expensive or no-dev-equivalent legs without ever
running them, and — behind an explicit approval gate — write a single machine-readable drive-recipe
block into the repo's `AGENTS.md`/`CLAUDE.md`. The recipe is the single source of truth two
consumers read: `bn-dogfood-verifier`'s Step 0 and `bn-review-lead`'s drivable-surface gate.

This skill is **standalone, foreground, trunk-level, and read-only on source.** It runs at the
trunk with the user present; it spawns no leaves. The only project-file write it ever performs is
the single approval-gated recipe-block write (Step 5). It builds no surrogate, fixture, fast-path
mode, install, or migration itself — that enabling work is scoped into a requirements doc and
handed to `/bn-plan` (Step 4).

Read these first (skip any already in your context):

- `${CLAUDE_PLUGIN_ROOT}/AGENTS.md` (the eight invariants; §5 protected artifacts; §6 the
  permission cliff)
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-runbook/references/tiering.md` — the five-tier decision rule
  and the read-only-on-source contract (the forbidden-Bash list).
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-runbook/references/execute-validate.md` — the budget-bounded
  proven-vs-declared pass.
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-runbook/references/plan-handoff.md` — the no-drivable-path /
  cheap-fruit requirements-doc route into `/bn-plan`.
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-runbook/references/recipe-write.md` — the approval-gated write,
  re-run safety, and the `last_validated` marker.

The recipe shape is fixed by the shared contract, never hand-rolled here:

- schema: `${CLAUDE_PLUGIN_ROOT}/schemas/drive-recipe.schema.json`
- validator/extractor/reconcile + CLI:
  `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/validate-drive-recipe.mjs`

## Read-only-on-source contract

This skill never installs, migrates, seeds, or writes a project file to force a green run; the only
project-file write is the approval-gated recipe block. It mirrors `bn-dogfood-verifier`'s hard
contract: the verbatim **forbidden-Bash list** in `references/tiering.md`, and a mandatory pre-pass
and post-pass `git status --porcelain` self-check around the execute-validate pass
(`references/execute-validate.md`). A leg blocked only by missing setup is recorded as a **blocker**,
never forced. The skill builds **no** surrogate/fixture/fast-path/install/migration itself (R12).

## Mode

- **Default (blank):** probe → tier → execute-validate the cheap/drivable surface → draft the
  recipe → run the validator → approval-gated write into `AGENTS.md`/`CLAUDE.md`. Where no drivable
  path exists or cheap low-hanging fruit would complete a useful path, emit a requirements doc and
  route it into `/bn-plan`.
- **`--report-only`:** probe and tier only. Produce the classification table and the proven/declared
  picture in chat, and **write nothing** — no recipe block, no requirements doc, no run-dir
  mutation beyond the run ledger/evidence. Use it to inspect a repo's drive-readiness without
  touching its instruction files.

## Step 0 — Preflight (inline at the trunk)

1. Resolve the git root: `git rev-parse --show-toplevel`. If this is not a git repo, stop.
2. Record the preflight tree state: `git status --porcelain`. This is the pre-pass snapshot the
   execute-validate self-check (Step 3) compares against, and the cleanliness oracle for the
   recipe write.
3. Open or reuse the run ledger:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs runbook-<repo-slug> --root <repo-root>
   ```

   Standalone mints a fresh run; pass `--run-id <caller-run-id>` only when invoked from a live
   caller's run. Bind the `<run-id>` once — it stamps `last_validated.run_id` (Step 5) and roots
   the evidence dir `.banyan/runs/<run-id>/evidence/`.
4. Confirm `agent-browser` availability (`command -v agent-browser`) and note it — it is the only
   blessed browser driver for the execute-validate pass, matching the verifier's Step 0 gate. Its
   absence does not stop the probe; it bounds what can be `proven` (browser surfaces become
   declared/blocked).

## Step 1 — Probe (read-only)

Find the repo's drive entry points and every external dependency the running app needs, reading
only. Extend `bn-dogfood-verifier`'s Step 0 detection order:

1. **Instruction files** (`AGENTS.md`, `CLAUDE.md`, `README.md`) for a documented run/port and any
   recorded dependency.
2. **`package.json`** `scripts.dev` / `scripts.start` (and `scripts.test` for the test command).
3. **Framework signals:** `next`, `vite`, `rails server` / `bin/dev`, `manage.py runserver`,
   `go run`; a `Procfile`; a `.env` port; falling back to `3000`.
4. **CLI / process entry points:** a bin in `package.json`, a documented CLI command, a long-running
   process entry.
5. **Triggerable-workflow signals:** a job runner, a queue producer, a pipeline/batch command, a
   scheduled task — the `trigger-and-monitor` surfaces.
6. **External dependencies:** databases, queues, third-party APIs, payment/email providers, object
   stores, auth providers — everything the running app reaches that is not in-process.

Record each entry point and dependency. Do not run, install, or mutate anything in this step.

## Step 2 — Tier each dependency

Assign **exactly one** tier to each external dependency, per `references/tiering.md`. The five tiers
are: `drivable-as-is`, `cheap-surrogate`, `trigger-and-monitor`, `no-dev-equivalent`,
`expensive-or-slow`. A leg tiered `expensive-or-slow` or `no-dev-equivalent` is **never executed**
(R4) — it is recorded `declared` with its cost/time/credential basis and a do-not-attempt note. Map
each entry point to a recipe `surface` and a `mode` (`local-dev-server` | `local-cli-process` |
`trigger-and-monitor`).

## Step 3 — Execute-validate the cheap/drivable surface

Per `references/execute-validate.md`: under a **180s** wall-clock budget per pass (R19), launch the
app and drive a minimal smoke journey over only the `drivable-as-is` / `cheap-surrogate` surface,
capturing evidence under `.banyan/runs/<run-id>/evidence/`. Mark `status: proven` **only** on steps
actually run. The **hard override:** any `declared` leg whose cost basis is non-zero money or a
remote batch is never executed regardless of remaining budget (R4/R19). Run the mandatory pre-pass
and post-pass `git status --porcelain` self-check; if the tree changed beyond the run dir, **abort
and record a blocker** (do not revert). `trigger-and-monitor` start+observe is *documented* into the
recipe (R8) but the remote compute is not triggered when its cost basis is non-zero — it is
`declared`. (`--report-only` stops after this step: report the proven/declared picture, write
nothing.)

## Step 4 — Handoff to /bn-plan when there is a gap (or cheap fruit)

Per `references/plan-handoff.md`: when there is **no drivable path at all**, or cheap low-hanging
fruit (a fixture, a compose service, a contract mock, a reduced fast-path mode) would complete a
happy path or a useful part of one, draft a `.banyan/brainstorms/<today>-<topic>-requirements.md`
scoping that enabling work and route it into `/bn-plan`. This skill **never builds the enabling
work itself** (R12) — it scopes and hands off. Drafting under `.banyan/brainstorms/` is an
approval-gated trunk action (a protected-artifact path): draft, then the user confirms the route.

## Step 5 — Approval-gated recipe write + last-validated marker

Per `references/recipe-write.md`: assemble the recipe from the Step 2 tiers and the Step 3
proven/declared statuses into the HTML-comment-sentinel + fenced-JSON block (R21), carrying
`recipe_schema_version` (R20) and the `last_validated` marker — `run_id`, the `git rev-parse HEAD`
commit it was proven against, and `validated_at` (R10). Target file: when both `AGENTS.md` and
`CLAUDE.md` exist, write to **`AGENTS.md`**; when neither exists, the approval gate offers to create
one (R23).

First count the existing blocks in the target file via `extractRecipeBlock` and choose the write
shape: `blockCount == 1` ⇒ **replace in place**; `blockCount == 0` ⇒ **append** after approval;
`blockCount >= 2` ⇒ **STOP** and surface the ambiguity (never guess which to replace) — R22.

Then assemble the **candidate file** (the target file with the new block merged in per that choice)
and, **before presenting any draft for approval,** run the validator on that candidate and refuse to
present a block that does not pass — validate what *would be written*, not the existing file plus a
loose draft:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/validate-drive-recipe.mjs <candidate-file>
```

Gate the write on an explicit `AskUserQuestion` per file (write / write-with-edits / skip),
mirroring `/bn-onboard` Phase 4. In a runtime without `AskUserQuestion`, stop and wait for an
explicit answer; never auto-write, never auto-suffix.

## Notes

- The recipe **fails closed** end to end: the validator the consumers parse through resolves any
  malformed, absent, duplicate, or unknown-version block to the consumer's pre-existing behavior,
  never a guessed drive. This producer never writes a block the validator rejects.
- **Re-run-only freshness (R10):** consumers do no drift check. The `last_validated` marker is the
  only freshness signal; the owner refreshes it by re-running `/bn-runbook`.
- Verification is `/bn-doctor` Check 2 (the skill dir is well-formed, `name == stem`, discoverable)
  plus the structural greps that confirm this skill's shipped doctrine is intact (the five tier
  names, the `--report-only` no-write branch, the forbidden-Bash list, the 180s budget default and
  the money/remote-batch override, `proven`-only-on-ran-steps, the `/bn-plan` route and the
  never-build R12 boundary, and that the recipe write runs `validate-drive-recipe.mjs` before the
  approval gate, stamps `last_validated` with the commit, does single-block in-place replacement,
  and STOPs on duplicates). End-to-end drive behavior is **UNVERIFIED (no test command)**.
