# Edit log — always-on reviewer/researcher agents (U4)

Provenance audit trail for the 6 always-on leaf agents ported from
compound-engineering (`plugins/compound-engineering/agents/ce-*.md`) into Banyan
(`plugin/agents/bn-*.md`). One section per file; every deviation from a verbatim copy
is recorded.

Common changes applied to all 6 (per BANYAN AGENT PORT SPEC):

- Frontmatter `name:` renamed `ce-*` -> `bn-*` to match the new filename stem.
- Frontmatter closing-delimiter normalized: removed the upstream blank line between the
  last frontmatter key and the closing `---` (Banyan frontmatter has no trailing blank line).
- Confidence-rubric pointer rewritten from "the subagent template" to
  `schemas/findings-schema.json` (`_meta.confidence_anchors`); persona-specific anchor
  guidance preserved verbatim.
- Upstream "## Output format" / "## Output Format" section replaced with the canonical
  Banyan output contract block (REVIEWER block for the 5 reviewers; RESEARCHER block for
  learnings-researcher).
- Persona expertise (what they hunt for, severity/confidence calibration, what-they-don't-flag,
  search strategy) preserved verbatim.

---

## bn-correctness-reviewer (<- ce-correctness-reviewer)

- `name:` `ce-correctness-reviewer` -> `bn-correctness-reviewer`.
- `model: inherit` KEPT (invariant 7: highest-stakes reviewer inherits the session/strong model).
- `tools:` unchanged (`Read, Grep, Glob, Bash, Write`); `color: blue` kept. No `Agent(...)` (leaf).
- Confidence-rubric pointer: "subagent template" -> `schemas/findings-schema.json` (`_meta.confidence_anchors`).
- Stripped v1 "## Output format" JSON-stub block (which returned findings as inline prose JSON);
  replaced with canonical REVIEWER output contract (`reviewer: "correctness"`, artifact at
  `docs/runs/<run-id>/findings/`, standalone fallback `./bn-findings-correctness.json`).
- No other v1 orchestration coupling present to strip (no ce-code-review / Stage N / /tmp paths).

## bn-testing-reviewer (<- ce-testing-reviewer)

- `name:` `ce-testing-reviewer` -> `bn-testing-reviewer`.
- `model: inherit` -> `model: sonnet` (invariant 7: mid-tier worker, not a highest-stakes reviewer).
- `tools:` unchanged (`Read, Grep, Glob, Bash, Write`); `color: blue` kept. No `Agent(...)` (leaf).
- Confidence-rubric pointer: "subagent template" -> `schemas/findings-schema.json` (`_meta.confidence_anchors`).
- Stripped v1 "## Output format" JSON-stub block; replaced with canonical REVIEWER output contract
  (`reviewer: "testing"`, standalone fallback `./bn-findings-testing.json`).
- No other v1 orchestration coupling present to strip.

## bn-maintainability-reviewer (<- ce-maintainability-reviewer)

- `name:` `ce-maintainability-reviewer` -> `bn-maintainability-reviewer`.
- `model: inherit` -> `model: sonnet` (invariant 7: mid-tier worker).
- `tools:` unchanged (`Read, Grep, Glob, Bash, Write`); `color: blue` kept. No `Agent(...)` (leaf).
- Confidence-rubric pointer: "subagent template" -> `schemas/findings-schema.json` (`_meta.confidence_anchors`).
- "## Severity guidance" section (P1/P2/P3 + `suggested_fix` concrete-reframe rule) preserved verbatim.
- Stripped v1 "## Output format" JSON-stub block; replaced with canonical REVIEWER output contract
  (`reviewer: "maintainability"`, standalone fallback `./bn-findings-maintainability.json`).
- No other v1 orchestration coupling present to strip.

## bn-project-standards-reviewer (<- ce-project-standards-reviewer)

- `name:` `ce-project-standards-reviewer` -> `bn-project-standards-reviewer`.
- `model: inherit` -> `model: sonnet` (invariant 7: mid-tier worker).
- `tools:` unchanged (`Read, Grep, Glob, Bash, Write`); `color: blue` kept. No `Agent(...)` (leaf).
- Confidence-rubric pointer: "subagent template" -> `schemas/findings-schema.json` (`_meta.confidence_anchors`).
- Orchestration coupling de-coupled in "## Standards discovery": "The orchestrator passes a
  `<standards-paths>` block" -> "Your delegation envelope may pass a `<standards-paths>` block"
  (Banyan lead/envelope input mechanism). Standalone self-discovery path preserved; the example
  path was updated from the upstream `plugins/compound-engineering/AGENTS.md` to a Banyan
  `plugin/agents/...` example for in-repo relevance.
- "Broken cross-references" bullet example de-v1'd: the upstream tautological example
  (`ce-learnings-researcher` instead of `ce-learnings-researcher`) replaced with a meaningful
  Banyan example (`learnings-researcher` -> `bn-learnings-researcher`).
- "## Evidence requirements" section (cite-rule + cite-violation) preserved verbatim.
- Stripped v1 "## Output format" JSON-stub block; replaced with canonical REVIEWER output contract
  (`reviewer: "project-standards"`, standalone fallback `./bn-findings-project-standards.json`).

## bn-agent-native-reviewer (<- ce-agent-native-reviewer)

- `name:` `ce-agent-native-reviewer` -> `bn-agent-native-reviewer`.
- `model: inherit` -> `model: sonnet` (invariant 7: mid-tier worker).
- `tools:` `Read, Grep, Glob, Bash` -> `Read, Grep, Glob, Bash, Write` — ADDED `Write` so the agent
  can fulfill the Banyan REVIEWER output contract (write its findings artifact). The upstream
  emitted a markdown report inline and needed no Write; under the artifacts-over-prose contract it
  now writes a JSON findings artifact. No `Agent(...)` (leaf); `color: blue` kept.
- Confidence-rubric pointer: "subagent template" -> `schemas/findings-schema.json` (`_meta.confidence_anchors`).
- Full review-process body (Triage, Map the Landscape, Action/Context/Tool-design/Shared-workspace
  checks, Noun Test, What You Don't Flag, Anti-Patterns Reference) preserved verbatim.
- Replaced the upstream markdown "## Output Format" section (the `## Agent-Native Architecture
  Review` template with Capability Map / Critical / Warnings / Observations / Score / PASS|NEEDS WORK)
  with the canonical REVIEWER output contract (`reviewer: "agent-native"`, JSON to
  `docs/runs/<run-id>/findings/`, standalone fallback `./bn-findings-agent-native.json`).
- No other v1 orchestration coupling present to strip.

## bn-learnings-researcher (<- ce-learnings-researcher)

- `name:` `ce-learnings-researcher` -> `bn-learnings-researcher`.
- `model: inherit` -> `model: sonnet` (invariant 7: mid-tier worker).
- `tools:` `Read, Grep, Glob, Bash` -> `Read, Grep, Glob, Bash, Write` — ADDED `Write` per spec
  (the researcher now writes a brief artifact). No `Agent(...)` (leaf). Upstream had no `color`
  key; no color added (kept fidelity to upstream frontmatter).
- Persona body preserved verbatim: Step 0 (CONCEPTS.md grounding) through Step 7, Frontmatter
  Schema Reference, the "## Output Format" markdown brief structure, and "## Efficiency Guidelines".
- Stripped the v1 "## Integration Points" section ("This agent is invoked by: /ce-plan,
  /ce-code-review, /ce-optimize, /ce-ideate, Standalone invocation ... Output is consumed as prose")
  — orchestration coupling to v1 skills; the Banyan output contract replaces the return mechanics.
- De-v1'd the "no relevant learnings found" note: removed the `/ce-compound` skill reference,
  replaced with Banyan-neutral guidance ("worth capturing as a new `docs/solutions/` entry after
  it lands").
- Appended the canonical RESEARCHER output contract block (`learnings` persona, markdown brief to
  `docs/runs/<run-id>/briefs/`, standalone fallback `./bn-brief-learnings.md`). The RESEARCHER
  block's "using the output structure defined above" resolves to the preserved "## Output Format"
  brief structure.
