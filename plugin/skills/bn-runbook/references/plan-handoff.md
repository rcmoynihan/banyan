# Requirements-doc handoff to /bn-plan

This reference is SKILL Step 4. When the probe + execute-validate output shows there is **no
drivable path at all**, or that **cheap low-hanging fruit** would complete a happy path (or a useful
part of one), the skill scopes that enabling work into a requirements doc and routes it into
`/bn-plan`. It **never builds the enabling work itself** (R12).

## When to hand off

- **No drivable path:** the probe found entry points but every surface is blocked or cliff-tiered —
  nothing can be `proven` under budget. Driving the app at all needs enabling work first.
- **Cheap fruit completes a useful path:** a small, well-scoped piece of enabling work — a fixture,
  a docker-compose service, a contract mock, a reduced/fast-path mode, a documented seed — would
  turn a currently-blocked surface into a drivable one and complete a happy path or a useful part of
  one. A leg recorded as a **blocker** in `execute-validate.md` (blocked only by missing setup) is
  exactly this opportunity.

## The never-build boundary (R12)

The skill is read-only on source. It **never** installs, migrates, seeds, or builds the
surrogate/fixture/fast-path/install/migration itself. That work is **scoped into the requirements
doc and built downstream** through the normal `/bn-plan` → delivery pipeline. This is the
*standard* enabling-work mechanism, not a second build path the skill runs on its own. The skill
identifies the gap and the cheapest faithful-enough fix; it does not perform the fix.

## The handoff

1. **Draft a requirements doc** in the family `/bn-onboard` writes:
   `.banyan/brainstorms/<today>-<topic>-requirements.md`. Scope the enabling work — what surrogate /
   fixture / fast-path / compose service to build, which surface it unblocks, and the drive path it
   would make `proven`. Keep it to the requirements; do not pre-design the implementation (that is
   `/bn-plan`'s job).
2. **`.banyan/brainstorms/` is a protected-artifact path** (AGENTS.md §5) and drafting there is an
   **approval-gated trunk action.** Draft, then have the user confirm the route into `/bn-plan` —
   never write the doc and route silently.
3. **Route into `/bn-plan`** on the drafted requirements doc. The enabling work is then planned,
   built, and reviewed downstream; the user re-runs `/bn-runbook` afterward to prove the
   now-drivable surface and refresh the recipe.

This covers the no-drivable-path and cheap-fruit cases (req-doc AE3/AE4): the skill surfaces the
opportunity and hands off, and the build happens through the owning pipeline, never inline here.
