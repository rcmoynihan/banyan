---
name: bn-mock
description: "Turn an idea — free text, a .banyan/brainstorms/*-requirements.md, or a .banyan/plans/*-plan.md — into a deliberately-fake, semi-functional mock under a disposable top-level mock/<slug>/, so design holes surface before an MVP is committed. A thin dispatcher: it resolves the input, opens or reuses a run, runs an overwrite-safety check, spawns exactly one bn-mock-builder leaf under an anti-real-machine fidelity boundary, reads the builder's mock-notes gate artifact, prints the per-medium run command, and routes findings back through the owning skills without ever editing a protected artifact."
argument-hint: "[idea | .banyan/brainstorms/*-requirements.md | .banyan/plans/*-plan.md]"
---

# bn-mock

You are the user-facing trunk for mocking. Keep this layer thin: resolve the input, open or reuse
a run, run the overwrite-safety gate, spawn ONE `bn-mock-builder` leaf, read its mock-notes gate
artifact (never its prose — invariant 3), print the run command, and run the propose-never-patch
handoff. You do not build the mock yourself, and you never edit a protected artifact.

Read `${CLAUDE_PLUGIN_ROOT}/AGENTS.md` (invariants 2, 3, 5, 6; §2.2 recovery; §5 protected
artifacts), `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md`, and these
skill-local references (skip any already in context):

- `${CLAUDE_PLUGIN_ROOT}/skills/bn-mock/references/fidelity-doctrine.md` — the anti-real-machine
  boundary (passed to the builder).
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-mock/references/mock-notes-schema.md` — the gate-artifact schema.
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-mock/references/overwrite-safety.md` — the pre-build
  overwrite-safety gate.
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-mock/references/handoff.md` — the disposition/routing rules.

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
interpolated into `mock/<slug>/` and the `rm -rf mock/<slug>/` cleanup, so an unvalidated slug
would escape the mock tree or collapse the cleanup — see `fidelity-doctrine.md` §Slug containment).
Do not pre-read full doc/plan content into trunk context — verify only enough to classify and pass
the path to the builder.

## Step 2 — Open or reuse the run (lazily)

Open the run ledger lazily via the scaffolder, reusing the caller's run when invoked from a
`/bn-brainstorm` or `/bn-plan` handoff:

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs mock-<slug> --root <repo-root> [--run-id <run-id>]
```

- **Standalone:** omit `--run-id`; the scaffolder mints a fresh run (and creates the `briefs/`
  subdir — no scaffolder change needed).
- **From a handoff:** pass `--run-id <caller-run-id>` to reuse the caller's live run. Use
  **`--run-id`, not `--input`** — a brainstorm/plan path is not under a run dir, so `--input`
  adoption would not fire. Note `resolveRun` fails if the adopted run has no
  ledger, so handoff-reuse presupposes a live caller run.

## Step 3 — Overwrite-safety gate (BEFORE spawning)

Run the `overwrite-safety.md` decision rule against `mock/<slug>/.banyan-mock.json` **before any
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
  clears. **A confirmed overwrite is a FRESH build (`iteration: 1`) that REPLACES `mock/<slug>/`**
  — it is *not* an in-place iteration even though the slug is unchanged; the dir held a foreign or
  different idea, so the build starts a new `# Mock notes: <slug>` / `## Iteration 1`.

## Step 3a — Select the mock-notes path (avoid clobbering on a reused run)

A reused run (handoff) can mock several ideas, and the gate artifact must not be overwritten across
slugs. Decide the notes filename **before** Step 4 so the same path flows into both the spawn
envelope and the Step 5 read-back. **Selection is driven by the Step 3 iteration outcome, not the
notes heading alone** — a same-slug heading match is an APPEND target *only* when Step 3 resolved
an in-place iteration (branch (b), `iteration > 1`); a fresh build (`iteration: 1`, whether a
brand-new dir or a confirmed overwrite of a foreign/mismatched dir) REPLACES that idea's notes
rather than appending onto them:

- If Step 3 resolved an **in-place iteration** (`iteration > 1`): use the existing notes file for
  this slug — the unsuffixed `.banyan/runs/<run-id>/briefs/mock-notes.md` if its
  `# Mock notes: <slug>` heading matches this slug, else the slug-suffixed
  `briefs/mock-notes-<slug>.md`. The builder appends `## Iteration N`.
- If Step 3 resolved a **fresh build** (`iteration: 1`):
  - If `.banyan/runs/<run-id>/briefs/mock-notes.md` does **not** exist, or it exists for **this
    same slug** (a confirmed-overwrite of a same-slug foreign/mismatched dir), use the unsuffixed
    `.banyan/runs/<run-id>/briefs/mock-notes.md` — the builder REPLACES it with a new
    `# Mock notes: <slug>` / `## Iteration 1`, never appending onto a different idea's history.
  - If it exists for a **different** slug, use the slug-suffixed
    `.banyan/runs/<run-id>/briefs/mock-notes-<slug>.md` instead, so this idea's notes never
    overwrite the prior idea's.

Bind the chosen path once as the **notes path**; pass it as the envelope's `artifact_path` (Step 4)
**and** read it back at exactly that path (Step 5). The schema documents this suffix rule
(`mock-notes-schema.md`); the trunk is what actually selects it.

## Step 4 — Spawn exactly one bn-mock-builder leaf

Spawn ONE `bn-mock-builder` (`max_children: 0`, `depth_remaining: <caller − 1>`) with the resolved
input and the doctrine paths, restating the anti-real-machine boundary and the §5 ban in the
envelope `boundaries`. Use the **validated** slug from Step 1 and the **notes path** chosen in Step
3a as `artifact_path`:

```
=== BANYAN ENVELOPE ===
objective:       Build a deliberately-fake, semi-functional mock for this idea into mock/<slug>/
                 and record the load-bearing mock-notes gate artifact.
artifact_path:   <the notes path bound in Step 3a — briefs/mock-notes.md, or
                 briefs/mock-notes-<slug>.md on a reused run already holding another slug's notes>
output_format:   The mock under mock/<slug>/ (manifest + README + playtest script + the medium's
                 entry files) and a schema-conformant mock-notes at artifact_path. Return: a
                 one-line verdict + the mock-notes path. Never the mock as prose.
inputs:
  source_kind:     <free-text | requirements-doc | plan>
  source_input:    <the free text, or the repo-relative doc/plan path>
  slug:            <the regex-validated slug from Step 1>
  run_id:          <run-id>
  iteration:       <the iteration number the trunk computed in Step 3 — 1 for a fresh build,
                   N+1 for an in-place iteration; the builder writes this value, does not increment>
doctrine:        ${CLAUDE_PLUGIN_ROOT}/skills/bn-mock/references/fidelity-doctrine.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-mock/references/mock-notes-schema.md,
                 ${CLAUDE_PLUGIN_ROOT}/AGENTS.md
boundaries:      ANTI-REAL-MACHINE: no installs, no credentials, no network/external services, no
                 real persistence, no real computation, no migrations/config, no repo edits
                 outside mock/<slug>/**. Write ONLY mock/<slug>/** and this run's mock-notes at
                 artifact_path. NEVER delete. NEVER edit a protected artifact
                 (.banyan/brainstorms, .banyan/plans, .banyan/solutions, other runs' dirs). Do not
                 decide overwrites — the trunk already cleared the overwrite-safety gate.
tool_guidance:   Read/Grep/Glob/Bash/Write inside mock/<slug>/ and your own artifact only. Read
                 the doctrine paths first. Spawn nothing.
budget:
  max_children:    0
  depth_remaining: <caller − 1>
effort_class:    <inherit>
=== END ENVELOPE ===
```

## Step 5 — Read the mock-notes gate artifact + print the run command

READ the **notes path bound in Step 3a** (`.banyan/runs/<run-id>/briefs/mock-notes.md`, or the
slug-suffixed `briefs/mock-notes-<slug>.md` when Step 3a selected it) — the artifact, not the
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

Then print the exact **per-medium run/open command** from the notes:

- GUI ⇒ `open mock/<slug>/index.html` in a browser;
- CLI ⇒ `node mock/<slug>/<entry>` (or the named interpreter);
- API ⇒ `node mock/<slug>/server.mjs`, then curl the listed routes;
- agent-transcript ⇒ read `mock/<slug>/transcript.md`.

## Step 6 — Run the handoff (propose, never patch)

Run the `handoff.md` rule: present the disposition table from the notes, classify each finding
(plus the plan-impact axis when the input was a plan path), and offer the per-disposition
dispatches — `/bn-brainstorm <doc>` (or a synthesized-summary offer for free-text), a
SYNTHESIZED finalized-requirements summary to `/bn-spec-stress` (never a raw notes path),
`/bn-plan` for replan, report-only for safe/mock-only. **Never edit a protected artifact** — every
route is a dispatch into the owning skill, which writes (§5).

## Step 7 — Surface the cleanup cliff + the .gitignore offer

- **Cleanup:** surface the exact `mock/<slug>/` path and the cleanup command
  (`rm -rf mock/<slug>/`) as a permission cliff the *user* runs. Interpolate **only** the
  regex-validated slug from Step 1 into this `rm -rf` line; never print an `rm -rf` line built from
  an unvalidated slug (rationale: `fidelity-doctrine.md` §Slug containment). Never delete `mock/`
  yourself and never instruct the builder to.
- **.gitignore:** OFFER (via `AskUserQuestion`, the Claude Code tool) to add `mock/` to
  `.gitignore`, never forcing it. In a runtime without that tool, stop and surface the offer and
  wait for an explicit answer in chat; never silently skip the `.gitignore` offer and never add it
  without consent. The trunk owns this single edit if the user accepts; the builder never touches
  `.gitignore`.

## Notes

- `/bn-mock` is a "see it first / mock it" option in the `/bn-brainstorm` and `/bn-plan` handoff
  menus, but is **never** surfaced inside `/bn-brainstorm` running as `/bn-grow` intake and is
  **never** an automatic `/bn-grow` step — mocking is human-in-the-loop.
- Verification is `/bn-doctor` Check 2 (the skill dir is well-formed and discoverable) plus the
  structural greps that confirm this skill's shipped doctrine is intact (the slug regex appears as a
  precondition; the `rm -rf` line is gated on a validated slug; the mock-notes schema's required
  headings and the five disposition values are present). End-to-end mock behavior is **UNVERIFIED
  (no test command)**, and the trunk re-running `/bn-mock` is the recovery owner.
