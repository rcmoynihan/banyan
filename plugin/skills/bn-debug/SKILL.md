---
name: bn-debug
description: "Distributed debugging via a lead-owned subtree: reproduce, rank hypotheses, test them in parallel with fresh-context investigators, confirm the causal chain, then choose Fix now / Diagnosis only / Rethink design. Use on a failing test, a bug report, or a GitHub issue."
argument-hint: "[bug description | failing test | gh issue number/URL]"
---

# Banyan Debug

The trunk-side choreography for the debug subtree. The subtree (`bn-debug-lead` +
parallel `bn-hypothesis-investigator`s) does the investigation in its own context; you
hold the gates: the trivial fast path, the user-choice gate after diagnosis, and the
rule that **nothing gets fixed until the causal chain is confirmed**. Methodology
references (vendored debugging doctrine) live in `references/` — the lead and its
investigators consume them via their envelopes.

## Step 1 — Parse the argument into a bug statement

Accept any of:

- **Prose description** — use as-is.
- **A failing test** — run it once to capture the actual failure output.
- **A GitHub issue number or URL** — fetch it read-only:
  `gh issue view <n> --json title,body,comments`. Read the full thread; the latest
  comments often carry updated repro steps.

Distill a **2-4 line bug statement**: what breaks, where it is observed, any known repro
steps. If you have neither a repro nor a concrete observation, ask the user for the
observed failure before dispatching anything.

## Step 2 — Trivial fast path

If the cause is **immediately readable** — a single-file typo, an obvious null deref at
a cited line, a one-line fix whose mechanism is plain from the trace — do NOT open a run
or dispatch the subtree. Propose the fix inline, state explicitly that the fast path was
taken (and that no run artifacts or lesson harvest exist for it), and let the user
approve. Everything else proceeds to Step 3.

## Step 3 — Open the run ledger

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs debug-<slug> \
  --root <repo-root> \
  --objective "<bug statement and done condition>" \
  --plan-ref "none -- ad hoc run" \
  --unit "debug|bn-debug-lead|in-progress|.banyan/runs/<run-id>/debug-diagnosis.md" \
  --actor trunk
```

Parse the JSON output and use `run_id`, `run_dir`, `ledger_path`, and `facts.test_command`.
The script seeds the objective, plan ref, facts, unit row, and opening log line.

## Step 4 — Dispatch the investigation

Classify `effort_class` by the bug's murkiness, not its importance: clear trace pointing
at one component → `lightweight`; misleading symptom or multi-component path →
`standard`; intermittent, heisenbug, or cross-system → `deep`.

Spawn `bn-debug-lead` **foreground** with this envelope verbatim (filled in):

```
=== BANYAN ENVELOPE ===
objective:       Diagnose the bug to a confirmed causal chain: reproduce, rank
                 hypotheses, test them, and write ONE diagnosis artifact.
artifact_path:   .banyan/runs/<run-id>/debug-diagnosis.md
output_format:   Markdown diagnosis per the bn-debug-lead contract: Bug / Reproduction /
                 Root cause / Causal chain / Hypotheses tested / Recommended fix /
                 Confidence / Open questions.
doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md
inputs:
  mode:          investigate
  bug_summary:   <the 2-4 line statement>
  repro:         <repro command or failing test, or "none known">
  test_command:  <detected repo test command, or "none detected">
  methodology:   ${CLAUDE_PLUGIN_ROOT}/skills/bn-debug/references/investigation-techniques.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-debug/references/anti-patterns.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-debug/references/defense-in-depth.md
boundaries:      Investigation is read-and-run only: never edit source, config, or
                 tests. NEVER push. Never touch protected artifacts (.banyan/brainstorms,
                 .banyan/plans, .banyan/solutions, .banyan/runs except this run's own artifacts).
tool_guidance:   Read, Grep, Glob, Bash to reproduce and inspect; Write to this run's
                 artifacts; Agent(...) for investigators, the learnings researcher, and
                 the exit-path harvester.
budget:
  max_children:    6
  depth_remaining: 3
effort_class:    <lightweight | standard | deep>
=== END ENVELOPE ===
```

## Step 5 — Present the diagnosis

READ `.banyan/runs/<run-id>/debug-diagnosis.md` (the file, not the lead's prose). Present:
the root cause (file:line), the causal chain and its `chain:` status, the hypotheses
tested (including what was refuted — eliminations are findings), and the recommended
fix.

## Step 6 — The user-choice gate (trunk side of the causal-chain gate)

Ask via `AskUserQuestion`:

- **`chain: confirmed`** → offer: **Fix now** / **Diagnosis only** / **Rethink design**.
- **`chain: unconfirmed`** → do NOT offer Fix now. Offer: **Continue investigating**
  (re-dispatch investigate mode with a deeper budget/effort and the open link named in
  the diagnosis) / **Diagnosis only** / **Rethink design**.

Then:

- **Fix now** → re-dispatch `bn-debug-lead` foreground in fix mode:

  ```
  === BANYAN ENVELOPE ===
  objective:       Apply the diagnosed fix test-first and return a fix report.
  artifact_path:   .banyan/runs/<run-id>/debug-fix-report.md
  output_format:   Markdown fix report per the bn-debug-lead contract.
  doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                   ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md,
                   ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md
  inputs:
    mode:           fix
    diagnosis_path: .banyan/runs/<run-id>/debug-diagnosis.md
    test_command:   <the repo test command>
    methodology:    ${CLAUDE_PLUGIN_ROOT}/skills/bn-debug/references/investigation-techniques.md,
                    ${CLAUDE_PLUGIN_ROOT}/skills/bn-debug/references/anti-patterns.md,
                    ${CLAUDE_PLUGIN_ROOT}/skills/bn-debug/references/defense-in-depth.md
  boundaries:      Edit only the files the diagnosis implicates plus the regression
                   test. Commit only on a pre-fix-clean tree with a green suite. NEVER
                   push. Never touch protected artifacts.
  tool_guidance:   Read/Grep/Glob/Bash/Edit/Write; Agent(...) only for the exit-path
                   harvester.
  budget:
    max_children:    1
    depth_remaining: 2
  effort_class:    standard
  === END ENVELOPE ===
  ```

  Then READ `debug-fix-report.md` and present it: what was fixed, the regression test,
  suite status, commit status — and that **push remains the user's step** (point at
  `/bn-ship`).

- **Diagnosis only** → mark U1 done in the ledger, present the run-dir path, and suggest
  `/bn-curate` later so the diagnosis lesson compounds even without a fix.

- **Rethink design** → the bug is a symptom of a design problem (see the escalation
  table in `references/anti-patterns.md`). Hand off to `/bn-brainstorm`, passing the
  diagnosis path as grounding context (`/bn-plan` directly is the alternative when the
  user already knows what shape the redesign takes).
