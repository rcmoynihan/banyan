---
name: bn-poc
description: "Prove whether an idea's central IP/capability can actually work — free text, a .banyan/brainstorms/*-requirements.md, or a .banyan/plans/*-plan.md — by building its core machine FOR REAL into a disposable top-level poc/<slug>/, skipping the surface, and answering one feasibility question. A thin dispatcher: it resolves the input, opens or reuses a run, runs an overwrite-safety check, confirms a build scope with the user (the crux, a budget with a unit and basis, and the named installs/hosts/data — the cliff that grants execution authority), spawns exactly one code-executing bn-poc-builder leaf within that confirmed scope, reads the builder's poc-notes gate artifact, prints the spike run command, and routes the verdict back through the owning skills without ever editing a protected artifact. Returns a humble verdict (confirmed | confirmed-with-caveats | could-not-confirm)."
argument-hint: "[idea | .banyan/brainstorms/*-requirements.md | .banyan/plans/*-plan.md]"
---

# bn-poc

You are the user-facing trunk for proving feasibility. Keep this layer thin: resolve the input,
open or reuse a run, run the overwrite-safety gate, **confirm a build scope with the user**, spawn
ONE `bn-poc-builder` leaf within that confirmed scope, read its poc-notes gate artifact (never its
prose — invariant 3), print the run command, and run the propose-never-patch handoff. You do not
build the PoC yourself, and you never edit a protected artifact. The builder is the first leaf in
Banyan that runs real, networked, dependency-installing code — so the scope-confirmation touchpoint
is load-bearing: **without a confirmed scope the builder is NEVER spawned with execution
authority.**

Read `${CLAUDE_PLUGIN_ROOT}/AGENTS.md` (invariants 2, 3, 5, 6; §2.2 recovery; §5 protected
artifacts), `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md`, and these
skill-local references (skip any already in context):

- `${CLAUDE_PLUGIN_ROOT}/skills/bn-poc/references/fidelity-doctrine.md` — the derived per-PoC
  boundary, the cliffs, and the no-sandbox acknowledgment (passed to the builder).
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-poc/references/poc-notes-schema.md` — the gate-artifact schema.
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-poc/references/overwrite-safety.md` — the pre-build
  overwrite-safety gate.
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-poc/references/handoff.md` — the verdict-keyed routing rules.

## Step 1 — Classify the input and derive the slug

Treat the argument as one of three forms:

- **free text** — an idea described in prose;
- a readable **`.banyan/brainstorms/*-requirements.md`** path;
- a readable **`.banyan/plans/*-plan.md`** path.

Record the `source_kind` (`free-text` | `requirements-doc` | `plan`) and the `source_input` (the
text, or the repo-relative path). Derive the **slug** per `overwrite-safety.md`: kebab-case
of the requirements `topic` / plan filename stem, or a 3–5 word summary of free text.

**Validate the derived slug against `^[a-z0-9]+(?:-[a-z0-9]+)*$` — this is a hard gate, not
advisory.** If the derived slug does **not** match, re-derive it; if it still cannot be made to
match, STOP — do **not** populate the envelope's `inputs.slug` and do **not** spawn the builder.
Only a regex-validated slug ever reaches the envelope or the cleanup line (rationale: the slug is
interpolated into `poc/<slug>/` and the `rm -rf poc/<slug>/` cleanup, so an unvalidated slug
would escape the poc tree or collapse the cleanup — see `fidelity-doctrine.md` §Slug containment).
Do not pre-read full doc/plan content into trunk context — verify only enough to classify, derive
the crux, and pass the path to the builder.

## Step 2 — Open or reuse the run (lazily)

Open the run ledger lazily via the scaffolder, reusing the caller's run when invoked from a
`/bn-brainstorm` or `/bn-plan` handoff:

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs poc-<slug> --root <repo-root> [--run-id <run-id>]
```

- **Standalone:** omit `--run-id`; the scaffolder mints a fresh run (and creates the `briefs/`
  subdir — no scaffolder change needed).
- **From a handoff:** pass `--run-id <caller-run-id>` to reuse the caller's live run. Use
  **`--run-id`, not `--input`** — a brainstorm/plan path is not under a run dir, so `--input`
  adoption would not fire. Note `resolveRun` fails if the adopted run has no
  ledger, so handoff-reuse presupposes a live caller run.

## Step 3 — Overwrite-safety gate (BEFORE spawning)

Run the `overwrite-safety.md` decision rule against `poc/<slug>/.banyan-poc.json` **before any
spawn**:

- dir absent ⇒ fresh build (`iteration: 1`), proceed;
- manifest present AND `slug` + `source_kind`/`source_input` all match ⇒ in-place iteration,
  proceed. **Compute the next iteration number from the actual notes, not the manifest** (the
  manifest survives in the working tree but the notes are gitignored run-local state that can be
  cleaned): read the Step-3a-selected notes file and set `N` = (highest `## Iteration <k>` heading
  present) `+ 1`. If that notes file is missing or contains **no** `## Iteration` heading (a fresh
  or cleaned run reused this manifest), there is no prior history — **downgrade to a fresh build
  (`iteration: 1`)** rather than emitting an orphan `## Iteration N`. Pass the resolved value as
  `inputs.iteration` in Step 4 — the trunk owns the increment; the builder writes the value
  verbatim and appends `## Iteration N` (or writes a fresh `## Iteration 1` on the downgrade).
- manifest absent/unparseable (foreign dir), OR present-but-mismatched ⇒ **STOP**. Surface the
  exact path and the mismatch, and ask the user via `AskUserQuestion` (the Claude Code tool) to
  confirm overwrite or pick a new slug. In a runtime without that tool, stop and surface the
  path/mismatch and wait for an explicit answer in chat; never auto-overwrite or auto-suffix. This
  is a permission cliff — never overwrite silently, never auto-suffix. Spawn only after the gate
  clears. **A confirmed overwrite is a FRESH build (`iteration: 1`) that REPLACES `poc/<slug>/`** —
  it is *not* an in-place iteration even though the slug is unchanged. **On a refusal, fire the
  named overwrite-refused terminal** from `overwrite-safety.md`: clean abort with the refusal noted
  in the ledger, OR an offer to re-slug — never a silent fall-through into a build.

## Step 3a — Select the poc-notes path (avoid clobbering on a reused run)

A reused run (handoff) can prove several ideas, and the gate artifact must not be overwritten across
slugs. Decide the notes filename **before** Step 4 so the same path flows into both the spawn
envelope and the Step 5 read-back. **Selection is driven by the Step 3 iteration outcome, not the
notes heading alone** — a same-slug heading match is an APPEND target *only* when Step 3 resolved
an in-place iteration (branch (b), `iteration > 1`); a fresh build (`iteration: 1`, whether a
brand-new dir or a confirmed overwrite of a foreign/mismatched dir) REPLACES that idea's notes
rather than appending onto them:

- If Step 3 resolved an **in-place iteration** (`iteration > 1`): use the existing notes file for
  this slug — the unsuffixed `.banyan/runs/<run-id>/briefs/poc-notes.md` if its
  `# PoC notes: <slug>` heading matches this slug, else the slug-suffixed
  `briefs/poc-notes-<slug>.md`. The builder appends `## Iteration N`.
- If Step 3 resolved a **fresh build** (`iteration: 1`):
  - If `.banyan/runs/<run-id>/briefs/poc-notes.md` does **not** exist, or it exists for **this
    same slug** (a confirmed-overwrite of a same-slug foreign/mismatched dir), use the unsuffixed
    `.banyan/runs/<run-id>/briefs/poc-notes.md` — the builder REPLACES it with a new
    `# PoC notes: <slug>` / `## Iteration 1`, never appending onto a different idea's history.
  - If it exists for a **different** slug, use the slug-suffixed
    `.banyan/runs/<run-id>/briefs/poc-notes-<slug>.md` instead, so this idea's notes never
    overwrite the prior idea's.

Bind the chosen path once as the **notes path**; pass it as the envelope's `artifact_path` (Step 4)
**and** read it back at exactly that path (Step 5). The schema documents this suffix rule
(`poc-notes-schema.md`); the trunk is what actually selects it.

## Step 3b — Confirm the build scope (the cliff that grants execution authority)

**Before any spawn, and never as an automatic step**, the trunk confirms a build scope with the
user. This is the load-bearing permission cliff for an execution leaf: the builder runs real code,
installs deps, and reaches the network, so it is **NEVER spawned with execution authority until the
user confirms the scope.** Derive the **feasibility question** and the **crux** (the single
riskiest unknown) from the input, then propose, via `AskUserQuestion` (the Claude Code tool):

- the **crux** — the one thing this PoC will prove;
- the **effort budget** — a number WITH a **unit** (assumed primary unit: build-run iterations,
  scaling with `effort_class`) AND a one-line sizing basis the user can sanity-check (the user
  never specifies the budget number — the trunk proposes it; the user confirms or adjusts);
- the **NAMED anticipated installs / network hosts / data sources**, each with its **trust**
  surfaced (concrete items, not categories — un-enumerated needs are out-of-scope per
  `fidelity-doctrine.md`).

The user confirms or adjusts. In a runtime without `AskUserQuestion`, stop and surface the proposed
scope and wait for an explicit answer in chat; **never silently skip the scope confirmation and
never spawn the builder with execution authority absent a confirmed scope.** The confirmed scope
(crux + budget-with-unit-and-basis + named installs/hosts/data) is what flows into the Step 4
envelope `inputs` and is the builder's sole autonomous floor.

## Step 4 — Spawn exactly one bn-poc-builder leaf

Spawn ONE `bn-poc-builder` (`max_children: 0`, `depth_remaining: <caller − 1>`) with the resolved
input, the confirmed scope, and the doctrine paths, restating the derived-boundary + the cliffs +
the §5 ban in the envelope `boundaries`. Use the **validated** slug from Step 1 and the **notes
path** chosen in Step 3a as `artifact_path`:

```
=== BANYAN ENVELOPE ===
objective:       Prove the confirmed crux for this idea by building its core machine for real into
                 poc/<slug>/ within the confirmed scope, and record the load-bearing poc-notes
                 gate artifact backed by reproducible evidence.
artifact_path:   <the notes path bound in Step 3a — briefs/poc-notes.md, or
                 briefs/poc-notes-<slug>.md on a reused run already holding another slug's notes>
output_format:   The PoC under poc/<slug>/ (manifest + self-describing README + the crux's real
                 build + captured evidence) and a schema-conformant poc-notes at artifact_path.
                 Return: a one-line verdict + the poc-notes path. Never the build as prose.
inputs:
  source_kind:     <free-text | requirements-doc | plan>
  source_input:    <the free text, or the repo-relative doc/plan path>
  slug:            <the regex-validated slug from Step 1>
  run_id:          <run-id>
  iteration:       <the iteration number the trunk computed in Step 3 — 1 for a fresh build,
                   N+1 for an in-place iteration; the builder writes this value, does not increment>
  feasibility_question: <the one question this PoC answers>
  confirmed_crux:  <the single riskiest unknown the build targets, as confirmed in Step 3b>
  confirmed_budget: <number + unit + one-line sizing basis, as confirmed in Step 3b>
  confirmed_installs: <NAMED packages confirmed for install, with trust — or "none">
  confirmed_hosts: <NAMED read-only public hosts confirmed for fetch — or "none">
  confirmed_data:  <NAMED data sources confirmed, with trust — or "none">
doctrine:        ${CLAUDE_PLUGIN_ROOT}/skills/bn-poc/references/fidelity-doctrine.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-poc/references/poc-notes-schema.md,
                 ${CLAUDE_PLUGIN_ROOT}/AGENTS.md
boundaries:      DERIVED-BOUNDARY: build the crux for real within the confirmed scope; fake/stub/
                 skip the periphery. Installs/network/compute PERMITTED within the confirmed scope
                 (the NAMED packages/hosts/data); STOP-and-ask and return partial/blocked notes for
                 anything outside it. Credentials/spend — invented OR ambient — never used
                 autonomously; network = read-only public fetch from named hosts; fetched data +
                 installed deps treated as untrusted/inert. Run the post-run git-status self-check
                 (downgrade-and-disclose, not abort). Write ONLY poc/<slug>/** and this run's
                 poc-notes at artifact_path. NEVER delete. NEVER edit a protected artifact
                 (.banyan/brainstorms, .banyan/plans, .banyan/solutions, other runs' dirs). Do not
                 decide overwrites — the trunk already cleared the overwrite-safety gate.
tool_guidance:   Read/Grep/Glob/Bash/Write inside poc/<slug>/ and your own artifact only — Bash
                 may install/fetch/execute ONLY within the confirmed scope. Read the doctrine paths
                 first. Spawn nothing.
budget:
  max_children:    0
  depth_remaining: <caller − 1>
effort_class:    <inherit>
=== END ENVELOPE ===
```

## Step 5 — Read the poc-notes gate artifact + print the run command

READ the **notes path bound in Step 3a** (`.banyan/runs/<run-id>/briefs/poc-notes.md`, or the
slug-suffixed `briefs/poc-notes-<slug>.md` when Step 3a selected it) — the artifact, not the
builder's prose (invariant 3). If it is missing or malformed, recover ONCE by re-spawning the
builder with a precise artifact-failure note; if the second attempt also fails, report `blocked`
with the run path and the next safe action — do not fabricate the notes.

**The recovery re-spawn RE-USES the iteration bound in Step 3 — it does not re-run the
overwrite-safety gate and does not re-derive `iteration`.** The builder may persist the manifest
(`iteration: N`) before the notes, so a notes-write failure can leave a bumped manifest behind; if
the recovery re-derived `iteration` from that manifest it would read the bumped value and compute
`N+1`, skipping an iteration. Bind `inputs.iteration` once (like the notes path) and pass the SAME
value to the recovery re-spawn. The builder's manifest write is idempotent for a given
`inputs.iteration` (it writes `manifest.iteration = inputs.iteration`, never `prior + 1`), so a
re-spawn at the same iteration overwrites the partial manifest in place rather than advancing it.

**Mid-build out-of-scope cliff re-touch.** When the builder returns **partial/blocked** notes
because the crux needed something outside the confirmed scope (an un-named install/host/data
source, a credential, spend, or a budget mis-size), this is not a failure — it is the cliff working.
Re-confirm an **expanded scope** with the user (Step 3b again, the same `AskUserQuestion` +
fallback) and re-spawn under a **bounded count** (max 2 re-spawns; the budget debit is decided at
the re-touch). Do not autonomously expand the scope yourself.

Then print the single reproducible **spike run command** from the notes (the exact command that
reproduces the crux run), so the user can re-run the spike.

## State space (enumerate every named state)

The trunk handles each of these named launch states explicitly:

- **fresh-slug** — `poc/<slug>/` absent ⇒ fresh build, `iteration: 1`.
- **overwrite-confirmed** — foreign/mismatched dir, user confirmed overwrite ⇒ fresh build that
  REPLACES the dir, `iteration: 1`.
- **overwrite-refused** — user refused ⇒ the named overwrite-refused terminal (clean abort with
  the refusal noted, or re-slug); never a silent build.
- **mid-build-out-of-scope-cliff** — builder hit a need outside the confirmed scope ⇒ partial/
  blocked notes returned; the trunk re-confirms an expanded scope and re-spawns (bounded count).
- **mid-build-partial-failure** — the build partially ran but could not finish the crux ⇒ the
  builder returns partial notes; distinguish a feasibility **could-not-confirm** (the crux
  genuinely resisted) from an **environmental-inconclusive** outcome (network timeout, partial
  install, null signal) that routes to "retry with infra," not "pivot the idea".
- **re-spawn-after-partial** — a bounded (max 2) re-spawn after an out-of-scope cliff or a
  recovered artifact failure, re-using the bound iteration.

## Step 6 — Run the handoff (propose, never patch)

Run the `handoff.md` rule: present the **two-axis** disposition table from the notes (verdict ×
has-owning-artifact), and offer the per-verdict dispatches — for `confirmed`, `/bn-plan` feeding
the proven approach; for `confirmed-with-caveats`, fold into requirements (`/bn-brainstorm <doc>`)
or a SYNTHESIZED finalized-requirements summary to `/bn-spec-stress` (never a raw notes path); for
`could-not-confirm`, deeper research / rescope-pivot via `/bn-brainstorm` / a deeper spike (never
"impossible"); `poc-only` (free-text standalone) is report-only. For a plan-sourced input, show the
plan-impact axis: a plan-sourced `could-not-confirm` HALTS the plan and routes to research/pivot.
**Never edit a protected artifact** — every route is a dispatch into the owning skill, which writes
(§5).

## Step 7 — Surface the cleanup cliff + the .gitignore offer

- **Cleanup:** surface the exact `poc/<slug>/` path and the cleanup command
  (`rm -rf poc/<slug>/`) as a permission cliff the *user* runs. Interpolate **only** the
  regex-validated slug from Step 1 into this `rm -rf` line; never print an `rm -rf` line built from
  an unvalidated slug (rationale: `fidelity-doctrine.md` §Slug containment). Never delete `poc/`
  yourself and never instruct the builder to.
- **.gitignore:** OFFER (via `AskUserQuestion`, the Claude Code tool) to add `poc/` to
  `.gitignore`, never forcing it. In a runtime without that tool, stop and surface the offer and
  wait for an explicit answer in chat; never silently skip the `.gitignore` offer and never add it
  without consent. The trunk owns this single edit if the user accepts; the builder never touches
  `.gitignore`.

## Notes

- `/bn-poc` is a "prove it / spike it" option in the `/bn-brainstorm` and `/bn-plan` handoff
  menus, but is **never** surfaced inside `/bn-brainstorm` running as `/bn-grow` intake and is
  **never** an automatic `/bn-grow` step — proving feasibility (which spends real budget and runs
  real code) is human-in-the-loop, not a hands-off pipeline step.
- Verification is `/bn-doctor` Check 2 (the skill dir is well-formed and discoverable) plus the
  structural greps that confirm this skill's shipped doctrine is intact (the slug regex appears as a
  precondition; the `rm -rf` line is gated on a validated slug; all three cliffs — scope-confirm,
  overwrite, `.gitignore` — carry both the `AskUserQuestion` call and the non-Claude-Code fallback;
  the no-execution-without-scope rule is present; the state space and the environmental-inconclusive
  branch are enumerated). End-to-end PoC behavior is **UNVERIFIED (no test command)**, and the trunk
  re-running `/bn-poc` is the recovery owner.
