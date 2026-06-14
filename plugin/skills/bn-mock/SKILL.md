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
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-mock/references/overwrite-safety.md` — the R23 pre-build gate.
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-mock/references/handoff.md` — the disposition/routing rules.

## Step 1 — Classify the input and derive the slug

Treat the argument as one of three forms (R2):

- **free text** — an idea described in prose;
- a readable **`.banyan/brainstorms/*-requirements.md`** path;
- a readable **`.banyan/plans/*-plan.md`** path.

Record the `source_kind` (`free-text` | `requirements-doc` | `plan`) and the `source_input` (the
text, or the repo-relative path). Derive the **slug** per `overwrite-safety.md` (R29): kebab-case
of the requirements `topic` / plan filename stem, or a 3–5 word summary of free text, validated
against `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Do not pre-read full doc/plan content into trunk context —
verify only enough to classify and pass the path to the builder.

## Step 2 — Open or reuse the run (lazily)

Open the run ledger lazily via the scaffolder, reusing the caller's run when invoked from a
`/bn-brainstorm` or `/bn-plan` handoff (R4):

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs mock-<slug> --root <repo-root> [--run-id <run-id>]
```

- **Standalone:** omit `--run-id`; the scaffolder mints a fresh run (and creates the `briefs/`
  subdir — no scaffolder change needed, R26).
- **From a handoff:** pass `--run-id <caller-run-id>` to reuse the caller's live run. Use
  **`--run-id`, not `--input`** — a brainstorm/plan path is not under a run dir, so `--input`
  adoption would not fire (plan-check C1). Note `resolveRun` fails if the adopted run has no
  ledger, so handoff-reuse presupposes a live caller run.

## Step 3 — Overwrite-safety gate (BEFORE spawning) — R23 / AE2

Run the `overwrite-safety.md` decision rule against `mock/<slug>/.banyan-mock.json` **before any
spawn**:

- dir absent ⇒ fresh build (`iteration: 1`), proceed;
- manifest present AND `slug` + `source_kind`/`source_input` all match ⇒ in-place iteration
  (R22/R28), proceed (the builder appends `## Iteration N`, bumps the manifest `iteration`);
- manifest absent/unparseable (foreign dir), OR present-but-mismatched ⇒ **STOP**. Surface the
  exact path and the mismatch, and ask the user via `AskUserQuestion` to confirm overwrite or pick
  a new slug. This is a permission cliff — never overwrite silently, never auto-suffix. Spawn only
  after the gate clears.

## Step 4 — Spawn exactly one bn-mock-builder leaf (R3)

Spawn ONE `bn-mock-builder` (`max_children: 0`, `depth_remaining: <caller − 1>`) with the resolved
input and the U1 doctrine paths, restating the anti-real-machine boundary and the §5 ban in the
envelope `boundaries`:

```
=== BANYAN ENVELOPE ===
objective:       Build a deliberately-fake, semi-functional mock for this idea into mock/<slug>/
                 and record the load-bearing mock-notes gate artifact.
artifact_path:   .banyan/runs/<run-id>/briefs/mock-notes.md
output_format:   The mock under mock/<slug>/ (manifest + README + playtest script + the medium's
                 entry files) and a schema-conformant mock-notes at artifact_path. Return: a
                 one-line verdict + the mock-notes path. Never the mock as prose.
inputs:
  source_kind:     <free-text | requirements-doc | plan>
  source_input:    <the free text, or the repo-relative doc/plan path>
  slug:            <derived slug>
  run_id:          <run-id>
  iteration:       <1 for fresh; N+1 for an in-place iteration>
doctrine:        ${CLAUDE_PLUGIN_ROOT}/skills/bn-mock/references/fidelity-doctrine.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-mock/references/mock-notes-schema.md,
                 ${CLAUDE_PLUGIN_ROOT}/AGENTS.md
boundaries:      ANTI-REAL-MACHINE: no installs, no credentials, no network/external services, no
                 real persistence, no real computation, no migrations/config, no repo edits
                 outside mock/<slug>/**. Write ONLY mock/<slug>/** and this run's
                 briefs/mock-notes.md. NEVER delete (R24). NEVER edit a protected artifact
                 (.banyan/brainstorms, .banyan/plans, .banyan/solutions, other runs' dirs). Do not
                 decide overwrites — the trunk already cleared the R23 gate.
tool_guidance:   Read/Grep/Glob/Bash/Write inside mock/<slug>/ and your own artifact only. Read
                 the doctrine paths first. Spawn nothing.
budget:
  max_children:    0
  depth_remaining: <caller − 1>
effort_class:    <inherit>
=== END ENVELOPE ===
```

## Step 5 — Read the mock-notes gate artifact + print the run command

READ `.banyan/runs/<run-id>/briefs/mock-notes.md` (the artifact, not the builder's prose —
R3/R18). If it is missing or malformed, recover ONCE by re-spawning the builder with a precise
artifact-failure note; if the second attempt also fails, report `blocked` with the run path and the
next safe action — do not fabricate the notes.

Then print the exact **per-medium run/open command** (R30) from the notes:

- GUI ⇒ `open mock/<slug>/index.html` in a browser;
- CLI ⇒ `node mock/<slug>/<entry>` (or the named interpreter);
- API ⇒ `node mock/<slug>/server.mjs`, then curl the listed routes;
- agent-transcript ⇒ read `mock/<slug>/transcript.md`.

## Step 6 — Run the handoff (propose, never patch)

Run the `handoff.md` rule: present the disposition table from the notes, classify each finding
(R20; plus the R21 plan-impact axis when the input was a plan path), and offer the per-disposition
dispatches — `/bn-brainstorm <doc>` (or a synthesized-summary offer for free-text, AE5), a
SYNTHESIZED finalized-requirements summary to `/bn-spec-stress` (never a raw notes path, R19),
`/bn-plan` for replan, report-only for safe/mock-only. **Never edit a protected artifact** — every
route is a dispatch into the owning skill, which writes (R18/R19, §5).

## Step 7 — Surface the cleanup cliff + the .gitignore offer

- **Cleanup (R24):** surface the exact `mock/<slug>/` path and the cleanup command
  (`rm -rf mock/<slug>/`) as a permission cliff the *user* runs. Never delete `mock/` yourself and
  never instruct the builder to.
- **.gitignore (R13):** OFFER (via `AskUserQuestion`) to add `mock/` to `.gitignore`, never
  forcing it. The trunk owns this single edit if the user accepts; the builder never touches
  `.gitignore`.

## Notes

- `/bn-mock` is a "see it first / mock it" option in the `/bn-brainstorm` and `/bn-plan` handoff
  menus (R1), but is **never** surfaced inside `/bn-brainstorm` running as `/bn-grow` intake and is
  **never** an automatic `/bn-grow` step (R5) — mocking is human-in-the-loop.
- Verification is `/bn-doctor` Check 2 (the skill dir is well-formed and discoverable) plus the
  manual-dispatch checklist in the plan; end-to-end mock behavior is **UNVERIFIED (no test
  command)** and the trunk re-running `/bn-mock` is the recovery owner.
