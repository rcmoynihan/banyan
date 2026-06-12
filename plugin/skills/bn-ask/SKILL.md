---
name: bn-ask
description: "Grounded codebase Q&A. Use when the user asks how this repo works, where behavior lives, whether a hypothesis about the code is true, what limitations or unknowns exist, or wants orientation in unfamiliar code. Read-only; answers with evidence, confidence, and explicit uncertainty. Escalates to Banyan's research subtree only when a quick scan cannot answer."
argument-hint: "[question or hypothesis about the codebase]"
---

# Ask About the Codebase

Answer codebase questions with evidence and honest uncertainty. This is a read-only,
trunk-level skill for understanding existing behavior, confirming or refuting hypotheses,
finding where behavior lives, and naming known limitations. It does not edit code, commit,
push, open issues, or write durable artifacts unless the question needs a research subtree.

Read `references/answer-contract.md` before composing the user-facing answer.

## Question

<question> #$ARGUMENTS </question>

If the question is empty, ask the user for the codebase question or hypothesis to check.
Do not proceed until the question is clear enough to investigate.

## Step 1 - Classify the Question

Classify the request by the answer it needs:

- **Pinpoint** - where something lives, what calls something, which files define a behavior.
- **Mechanism** - how a subsystem, command, request path, or workflow works.
- **Hypothesis** - whether the user's claim about the code is true.
- **Limitation** - what the code cannot do, where assumptions are brittle, or what remains
  unsupported.
- **Orientation** - a concise map of an unfamiliar area.
- **External dependency** - a question whose answer depends on framework, library, API, or
  ecosystem behavior outside the repo.

Prefer the narrowest classification that answers the user. If the request mixes multiple
types, answer the primary question first and call out secondary questions separately.

## Step 2 - Fast Path by Default

Use the fast path when the answer is likely reachable from a bounded repo scan:

1. Read already-loaded project instructions and vocabulary from context.
2. Search with `rg`, `Glob`, or native search tools before opening files.
3. Read the smallest source set that can answer the question.
4. For absence claims, search the relevant scope before saying something is missing.
5. For dependency behavior, read local manifests first to identify the package and version.

Do not open a run ledger or spawn agents for narrow questions. Answer directly in chat
using the answer contract.

## Step 3 - Escalate When the Fast Path Is Not Enough

Escalate to the research subtree when any of these hold:

- The question spans multiple subsystems or a large unfamiliar area.
- The answer needs institutional learnings from `docs/solutions/`.
- The answer depends on official docs, version-specific framework behavior, or current
  external information.
- The first scan finds contradictory evidence.
- The answer would require enough raw reading to crowd the trunk context.

Before opening a run, read:

- `${CLAUDE_PLUGIN_ROOT}/AGENTS.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md`

Open the run ledger:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs ask-<slug> --root <repo-root>
```

Fill `ledger.md` with:

- Objective: the user's question and the done condition: a sourced answer with confidence
  and explicit unknowns.
- Plan: `none -- codebase question`.
- Units: `U1 | bn-research-lead | in-progress | briefs/ask-answer.md`.
- Log: an opening trunk line.

Spawn `bn-research-lead` foreground with this envelope:

```text
=== BANYAN ENVELOPE ===
objective:       Answer the user's codebase question with sourced findings, confidence,
                 and explicit unknowns: <question>.
artifact_path:   docs/runs/<run-id>/briefs/ask-answer.md
output_format:   Markdown brief: Direct answer / Evidence / Confidence / Unknowns /
                 Sources. Keep it distilled; no raw dumps.
inputs:
  question_type: <pinpoint | mechanism | hypothesis | limitation | orientation | external dependency>
  question:      <the user's question>
  fast_scan:     <brief summary of any trunk scan already performed, or "none">
doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md
boundaries:      Read-only research. Do NOT edit source, switch branches, commit/push,
                 open issues, or touch docs/brainstorms, docs/plans, docs/solutions,
                 docs/runs except this run's own artifacts.
tool_guidance:   Read/Grep/Glob/Bash for repo investigation; use framework docs or web
                 only when the question needs external evidence. Agent(...) for the
                 warranted researchers and thread chaser per bn-research-lead.
budget:
  max_children:    6
  depth_remaining: 3
effort_class:    <lightweight | standard | deep>
=== END ENVELOPE ===
```

Classify effort by breadth:

- **lightweight** - one subsystem, one known pattern, or one hypothesis with a small search
  surface.
- **standard** - several repo areas, or repo evidence plus institutional learnings or
  official docs.
- **deep** - broad orientation, multi-subsystem behavior, contradiction resolution, or
  repo evidence plus official docs plus web context.

Read `docs/runs/<run-id>/briefs/ask-answer.md` when the lead returns. Do not rely on the
lead's final-message prose for load-bearing facts.

## Step 4 - Answer the User

Use `references/answer-contract.md` for the response shape. The answer must:

- Put the direct answer first.
- Cite source evidence for load-bearing claims.
- State confidence at the level warranted by the evidence.
- Name unverified assumptions and search limits.
- Distinguish code facts from inferred behavior.
- Avoid implementation recommendations unless the user asked what to do next.

If the answer is incomplete because evidence is missing, say what was checked and what
would need to be checked next. Do not invent certainty to make the answer feel complete.
