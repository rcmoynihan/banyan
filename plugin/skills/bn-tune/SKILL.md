---
name: bn-tune
description: "Mine accumulated Banyan run data for recurring harness failures and produce evidence-cited proposals to improve Banyan's own agents/skills. Never self-applies -- presents proposals for human review."
argument-hint: "[blank = mine all runs | a run-id range or count]"
---

# bn-tune

Thin trunk-side entry to the Banyan **harness engineer** -- the moonshot, where Banyan's
compounding loop includes itself. This skill does a few cheap things: count the accumulated
run corpus, build one envelope, dispatch `bn-harness-engineer`, and present the proposals it
writes. ALL the mining judgment (pattern detection, occurrence counting, the evidence floor,
the diff drafting) lives inside the agent, not here. Keep this procedure small.

The agent reads Banyan's own run ledgers (and subagent transcripts where present), finds
RECURRING harness failures -- a reviewer that over-fires, a lead that keeps hitting its budget
squeeze, envelope/boundary violations, dead-ends harvested in run after run -- and writes
PR-style, evidence-cited proposals to `docs/harness-proposals/`. It **NEVER self-applies**:
**applying is the human's call.** Nothing here is auto-applied.

Read `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md`,
`${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md`, and
`${CLAUDE_PLUGIN_ROOT}/AGENTS.md` (esp. invariant 3
artifacts-over-prose, invariant 5 budgets, invariant 6 permission cliff).

## Step 1: Count the accumulated run corpus

Resolve which runs the agent will mine, and how many there are.

- **No arg** -> the whole corpus: every `docs/runs/<run-id>/` with a `ledger.md`.
- **A run-id range or count arg** -> narrow to that subset (a count picks the N most recent
  runs; a range picks the runs in it).

Count the runs in scope. Harness-tuning is EXPLORATORY: the pattern floor needs accumulated
data to separate a real recurring failure from a one-off.

- **WARN if fewer than 5 runs are available.** State plainly that harness-tuning is exploratory and the
  pattern floor (>=2-3 occurrences across runs) needs accumulated data -- with < 5 runs the
  agent will likely find few or no actionable patterns, and that is the expected, honest
  outcome, not a failure. Offer to proceed anyway (the agent will mine what exists and report
  how little it found) or to wait until more grow-runs accumulate. Do not pretend a thin
  corpus yields strong proposals.
- **No runs at all** -> STOP. There is nothing to mine. Say where you looked
  (`docs/runs/*/ledger.md`) and that the corpus is empty; suggest running `/bn-grow` a few
  times first so ledger data accumulates.

Do not read or judge the runs here -- that is the agent's job. This step only counts the
corpus and sets the under-5 warning.

## Step 2: Ensure the proposals directory exists

The agent writes one proposal file per pattern under `docs/harness-proposals/`. Make sure that
directory exists (it ships with a `.gitkeep`). The agent writes the proposals; this skill just
guarantees the target dir is there.

## Step 3: Build the envelope and dispatch bn-harness-engineer

Embed this envelope verbatim in the Agent prompt and spawn `bn-harness-engineer` (one child).
Fill every field. Name the corpus scope from Step 1 explicitly. The envelope is the whole
contract -- the agent mines the runs it names, not prose.

```
=== BANYAN ENVELOPE ===
objective:       Mine the accumulated Banyan run corpus for RECURRING harness-failure
                 patterns (reviewer over-fires, budget squeezes, envelope/boundary
                 violations, loop/escalation patterns, repeated dead-ends) and write one
                 evidence-cited, PR-style proposal per pattern. Never apply anything.
corpus_scope:    <all runs under docs/runs/ | the run-id range or count from Step 1>
artifact_path:   docs/harness-proposals/  (one <date>-<slug>.md per pattern) and an
                 optional "Proposed" append to docs/harness-changelog.md
output_format:   One PR-style proposal per pattern: the pattern, the EVIDENCE (>=2 cited
                 occurrences -- run-ids + file:line), the exact plugin/ file targeted, a
                 unified-diff or precise before/after, and the expected effect.
doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md
boundaries:      NEVER edit plugin/ (no Edit tool by design -- you PROPOSE, a human
                 applies). WRITE SCOPE is ONLY docs/harness-proposals/ and a "Proposed"
                 entry in docs/harness-changelog.md. Everything else is REPORT-ONLY. You
                 READ docs/runs/ as the corpus and READ plugin/ to target proposals, but
                 write neither. Protected artifacts (AGENTS.md section 5) stay read-only.
                 Drop any candidate pattern with < 2 cited occurrences.
tool_guidance:   Read, Grep, Glob to mine ledgers, progress files (echoed envelopes vs
                 actual behavior), findings (false_positive signals), and subagent
                 transcripts where present; Bash to enumerate runs and locate transcript
                 files under ~/.claude/projects/.../subagents/; Write only to
                 docs/harness-proposals/ and the changelog. No Edit. No Agent spawns.
budget:
  max_children:    0
  depth_remaining: 0
effort_class:    deep
=== END ENVELOPE ===
```

- `max_children: 0` and `depth_remaining: 0` make the agent a leaf -- it mines inline and
  spawns nothing (it has no `Agent(...)` allowlist either).
- The agent runs at its pinned `model: opus`: whole-system analysis steers edits to the
  harness itself.

## Step 4: Present the proposals (human applies)

When the agent returns, READ the proposal files it wrote (the files under
`docs/harness-proposals/`, not the agent's final-message prose -- invariant 3) and present to
the user:

- how many patterns were found, how many actionable PROPOSALS were written + their paths, and
  how many candidate patterns were DROPPED for insufficient evidence (the honest floor);
- for each proposal: the pattern, the plugin/ FILE it targets, and its cited evidence
  (run-ids + file:line) so the user can judge it;
- the headline rule, stated clearly: **nothing was applied.** Each proposal is a suggested
  diff to a Banyan agent or skill that a HUMAN reviews and merges. Applying is the user's call.

If the agent found NO actionable patterns (common on a thin corpus -- see the under-5 warning),
say so plainly: zero proposals is an honest outcome, not a failure, when the data floor is not
yet met. Point the user at `docs/harness-proposals/` for any proposals and at
`docs/harness-changelog.md` for the proposed/applied record.

## Permission cliff (invariant 6)

The harness engineer PROPOSES; it never applies. This is encoded in its tools (no `Edit` on
`plugin/`) and re-stated in the envelope boundaries. Applying a proposal is a deliberate,
permission-worthy, trunk-level human action: a person reads the evidence, decides, edits the
`plugin/` file, and records the applied change in `docs/harness-changelog.md`. The skill and the
agent never cross that line. The system improves itself by PROPOSING to its maintainer, not by
editing itself.
