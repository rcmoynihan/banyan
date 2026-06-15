---
name: bn-ask
description: "Grounded codebase Q&A via a dedicated research subtree. Use when the user asks how this repo works, where behavior lives, whether a hypothesis about the code is true, what limitations or unknowns exist, or wants orientation in unfamiliar code. Read-only; always opens a run and dispatches researchers plus an answer-checker, then answers with evidence, confidence, and explicit uncertainty. For a throwaway question, ask in plain chat instead."
argument-hint: "[question or hypothesis about the codebase]"
---

# Ask About the Codebase

Answer codebase questions with evidence and honest uncertainty. This is a read-only,
trunk-level skill for understanding existing behavior, confirming or refuting hypotheses,
finding where behavior lives, and naming known limitations. It is **deep by design**: every
question opens a run and dispatches a grounded-Q&A subtree (`bn-ask-lead`, which gathers
evidence via researchers and verifies the answer with `bn-ask-checker`). There is no fast
path — if you only need a throwaway answer, ask in plain chat rather than invoking this skill.
This skill does not edit code, commit, push, or open issues.

This skill is a **thin dispatcher**: it captures the question, opens the run, hands one
envelope to `bn-ask-lead`, reads the lead's answer brief, and relays it. The lead owns
classification, the research panel, the answer draft, the answer-checker, and synthesis.

Read `references/answer-contract.md` before relaying the user-facing answer.

## Question

<question> #$ARGUMENTS </question>

If the question is empty, ask the user for the codebase question or hypothesis to check.
Do not proceed until the question is clear enough to investigate.

## Step 1 - Classify effort by breadth

The lead scales the research panel and decides whether to run the answer-checker from this
`effort_class`, so set it deliberately:

- **lightweight** - one subsystem, one known pattern, or one hypothesis with a small search
  surface. The lead runs shallow research and skips the answer-checker.
- **standard** - several repo areas, or repo evidence plus institutional learnings or
  official docs. The lead runs the normal panel and the answer-checker.
- **deep** - broad orientation, multi-subsystem behavior, contradiction resolution, or repo
  evidence plus official docs plus web context. The lead runs the full warranted panel,
  chases threads, and runs the answer-checker.

## Step 2 - Open the run and dispatch bn-ask-lead

Before opening a run, read (skip any already in your context):

- `${CLAUDE_PLUGIN_ROOT}/AGENTS.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md`

Open the run ledger:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs ask-<slug> \
  --root <repo-root> \
  --objective "<answer the user's codebase question with sourced evidence>" \
  --plan-ref "none -- codebase question" \
  --unit "ask|bn-ask-lead|in-progress|.banyan/runs/<run-id>/briefs/ask-answer.md" \
  --actor trunk
```

Parse the JSON output and use `run_id`, `run_dir`, `ledger_path`, and `facts`. The script
seeds the objective, plan ref, unit row, facts, and opening log line.

Spawn `bn-ask-lead` foreground with this envelope:

```text
=== BANYAN ENVELOPE ===
objective:       Answer the user's codebase question with sourced findings, confidence,
                 and explicit unknowns: <question>.
artifact_path:   .banyan/runs/<run-id>/briefs/ask-answer.md
output_format:   Answer-contract-shaped Markdown brief: direct answer first, sourced
                 Evidence, Confidence, Unknowns. Keep it distilled; no raw dumps.
inputs:
  question:      <the user's question>
  effort_class:  <lightweight | standard | deep>
doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md
boundaries:      Read-only Q&A. Do NOT edit source, switch branches, commit/push,
                 open issues, or touch .banyan/brainstorms, .banyan/plans, .banyan/solutions,
                 .banyan/runs except this run's own artifacts.
tool_guidance:   Agent(bn-research-lead) for evidence-gathering, Agent(bn-ask-checker) to
                 verify the answer (standard/deep), Agent(bn-lesson-harvester) to finalize.
                 Read/Grep/Glob/Bash for the lead's own grounding.
budget:
  max_children:    8
  depth_remaining: 4
effort_class:    <lightweight | standard | deep>
=== END ENVELOPE ===
```

Read `.banyan/runs/<run-id>/briefs/ask-answer.md` when the lead returns. Do not rely on the
lead's final-message prose for load-bearing facts. If the lead returns `needs-user`, surface
its blocker and recovery metadata to the user rather than guessing.

## Step 3 - Answer the User

Use `references/answer-contract.md` for the response shape. The answer must:

- Put the direct answer first.
- Cite source evidence for load-bearing claims.
- State confidence at the level warranted by the evidence.
- Name unverified assumptions and search limits.
- Distinguish code facts from inferred behavior.
- Avoid implementation recommendations unless the user asked what to do next.

If the answer is incomplete because evidence is missing, say what was checked and what
would need to be checked next. Do not invent certainty to make the answer feel complete.
