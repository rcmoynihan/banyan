# Execute-validate: budget-bounded, proven-vs-declared honesty

This reference is SKILL Step 3: launch the app and drive a minimal smoke journey over **only** the
cheap/drivable surface within the budget ceiling, marking only the steps it ran `proven`, and never
executing an `expensive-or-slow` / `no-dev-equivalent` leg.

## Budget ceiling (R19)

The execute-validate pass runs under a **wall-clock budget, default 180 seconds per pass**. Track
elapsed wall-clock from the first launch; when the budget is exhausted, stop driving and record any
unreached drivable leg as a blocker (not `proven`, not failed — simply not reached under budget).

**Hard override (R4/R19):** any `declared` leg whose cost basis is **non-zero money or a remote
batch** is **never executed regardless of remaining time budget**. The budget governs how much of
the *cheap/drivable* surface is exercised; it never authorizes running a cliff leg just because time
remains. The override is unconditional and takes precedence over the budget.

## The pass

Drive only the surfaces tiered `drivable-as-is` or `cheap-surrogate` (and a `trigger-and-monitor`
surface only when its cost basis is zero):

1. **Launch in the background.** Start the dev server / process as a background process (a spawned
   side effect, below the permission cliff). A background-spawned context auto-denies interactive
   prompts: if the launch wants consent or never binds its port, **degrade** — record the leg as a
   blocker and move on; never hang, never block.
2. **Poll for readiness.** Wait for the port with `curl` / a port probe up to a sane timeout within
   the budget.
3. **Drive the smoke journey.** For browser surfaces, drive through `agent-browser` (the only
   blessed driver, matching `bn-dogfood-verifier`); capture screenshots and console/network output.
4. **Capture evidence.** Save screenshots and console/network logs under
   `.banyan/runs/<run-id>/evidence/`, and reference their paths from the recipe's proven legs.
5. **Tear down.** Kill the server/process you started.

## proven vs declared

- **`status: proven`** is set **only** on a step actually executed under this pass with evidence
  captured (R3). A step you did not run — because it was tiered as a cliff, blocked by missing
  setup, or unreached under budget — is **never** `proven`.
- **`status: declared`** records a leg with its cost/time/credential basis and a `do_not_attempt`
  note, **without running it** (R4). The cliff tiers (`expensive-or-slow`, `no-dev-equivalent`) are
  always `declared`. A `trigger-and-monitor` leg with a non-zero cost basis is `declared`; its
  start+observe instructions are still *documented* into the recipe (R8) so a reader knows how the
  remote workflow is started and watched, but the remote compute is not triggered.

The recipe `status` enum is **only** `proven` | `declared` — there is no third value. A **blocker**
(a drivable leg blocked solely by missing setup, or one unreached under budget) is **not** a recipe
status: it is recorded out-of-band as the cheap-fruit gap that routes to `/bn-plan`
(`plan-handoff.md`), never written into a recipe leg's `status` field (the validator rejects any
`status` outside the enum).

## Mandatory pre/post `git status --porcelain` self-check

Mirroring `bn-dogfood-verifier`'s hard contract, the pass is bracketed by a tree-cleanliness check:

- **Pre-pass:** the snapshot taken in SKILL Step 0 (`git status --porcelain`).
- **Post-pass:** after tearing down, run `git status --porcelain` again and compare. **If the tree
  changed** — any new staged, unstaged, or untracked path beyond the run dir
  (`.banyan/runs/<run-id>/`) — the read-only contract was violated: **abort and record a blocker**
  stating that the execute-validate pass mutated the working tree, naming the changed paths. **Do
  not attempt to revert.** A mutated tree means the proven evidence cannot be trusted, so it is
  surfaced rather than papered over.

## Scope note (checker F3 — v1 is browser/dev-server only)

The producer may **classify** a `local-cli-process` surface honestly and record it in the recipe.
But the v1 `bn-dogfood-verifier` has no CLI/process drive surface — it drives browser/dev-server
surfaces only. So the execute-validate pass proves browser/dev-server surfaces; it records
non-browser legs without those legs becoming verifier-drivable. The `reconcile()` helper in the
shared validator already encodes this: a `proven` `local-cli-process` leg reconciles to `skip` for a
consumer. Building a CLI/process drive capability is out of scope for v1 (a follow-up `/bn-plan`
item).
