# Edit log — Unit U4 conditional reviewer agents

Six v1 conditional reviewer personas ported from
`plugins/compound-engineering/agents/ce-*.md` to `plugin/agents/bn-*.md`.
Persona expertise (attack techniques, failure modes, calibration, suppress
conditions) preserved verbatim; only frontmatter tiering, v1 orchestration
coupling, and the output-format section changed. Each file below lists every
change applied.

---

## bn-security-reviewer (<- ce-security-reviewer)

- **Frontmatter `name`:** `ce-security-reviewer` -> `bn-security-reviewer` (matches filename stem).
- **Frontmatter `model`:** kept `inherit` per Banyan invariant 7 (security is a highest-stakes reviewer; inherits the session/strong model).
- **Frontmatter `tools`:** unchanged (`Read, Grep, Glob, Bash, Write`). No `Agent(...)` — this is a leaf. `color: blue` kept.
- **Frontmatter formatting:** removed the stray blank line between `color:` and the closing `---` (normalized to a single clean YAML block).
- **`description`:** unchanged (no v1 skill names present).
- **Persona body:** "What you're hunting for", "Confidence calibration" anchors (100/75/50/25), and "What you don't flag" preserved verbatim, including the lower-effective-threshold / P0-exception guidance.
- **v1 coupling stripped:** the line "Use the anchored confidence rubric in the subagent template." rewritten to "Use the anchored confidence rubric in `schemas/findings-schema.json` (`_meta.confidence_anchors`)." Persona-specific anchor guidance kept intact.
- **Output-contract swap:** upstream "## Output format" (JSON stub + "No prose outside the JSON") replaced with the canonical Banyan REVIEWER block verbatim, persona substituted as `security` (artifact path `./bn-findings-security.json` for standalone; verdict line `security: ...`).

## bn-performance-reviewer (<- ce-performance-reviewer)

- **Frontmatter `name`:** `ce-performance-reviewer` -> `bn-performance-reviewer` (matches filename stem).
- **Frontmatter `model`:** `inherit` -> `sonnet` per invariant 7 (performance is not a highest-stakes reviewer; steps down to Sonnet-class).
- **Frontmatter `tools`:** unchanged (`Read, Grep, Glob, Bash, Write`). No `Agent(...)`. `color: blue` kept.
- **Frontmatter formatting:** removed the stray blank line before the closing `---`.
- **`description`:** unchanged (no v1 skill names).
- **Persona body:** "What you're hunting for" (N+1, unbounded memory, pagination, hot-path allocations, blocking I/O), the higher-effective-threshold calibration, anchors 100/75/50/25, and "What you don't flag" preserved verbatim.
- **v1 coupling stripped:** "Use the anchored confidence rubric in the subagent template." -> "...in `schemas/findings-schema.json` (`_meta.confidence_anchors`)."
- **Output-contract swap:** "## Output format" stub replaced with canonical REVIEWER block, persona `performance` (standalone path `./bn-findings-performance.json`).

## bn-api-contract-reviewer (<- ce-api-contract-reviewer)

- **Frontmatter `name`:** `ce-api-contract-reviewer` -> `bn-api-contract-reviewer` (matches filename stem).
- **Frontmatter `model`:** `inherit` -> `sonnet` per invariant 7 (not a highest-stakes reviewer).
- **Frontmatter `tools`:** unchanged (`Read, Grep, Glob, Bash, Write`). No `Agent(...)`. `color: blue` kept.
- **`description`:** unchanged (no v1 skill names).
- **Persona body:** "What you're hunting for" (breaking changes, missing versioning, inconsistent error shapes, undocumented behavior changes, backward-incompatible type changes), anchors 100/75/50/25, and "What you don't flag" preserved verbatim.
- **v1 coupling stripped:** "Use the anchored confidence rubric in the subagent template." -> "...in `schemas/findings-schema.json` (`_meta.confidence_anchors`)."
- **Output-contract swap:** "## Output format" stub replaced with canonical REVIEWER block, persona `api-contract` (standalone path `./bn-findings-api-contract.json`).

## bn-data-migration-reviewer (<- ce-data-migration-reviewer)

- **Frontmatter `name`:** `ce-data-migration-reviewer` -> `bn-data-migration-reviewer` (matches filename stem).
- **Frontmatter `model`:** `inherit` -> `sonnet` per invariant 7 (not a highest-stakes reviewer).
- **Frontmatter `tools`:** unchanged (`Read, Grep, Glob, Bash, Write`). No `Agent(...)`. `color: blue` kept.
- **`description`:** unchanged (no v1 skill names).
- **Persona body:** the three-layer review model (schema drift / migration correctness / verification & rollback), the full Step 0 schema-drift gate (the `git diff <review-base> --name-only -- db/migrate/`, per-dump diffs, drift cross-reference rules, the P1 `autofix_class: manual` finding with `git checkout <review-base>` + `bin/rails db:migrate` suggested fix), all migration-safety hunting items (swapped/inverted mappings, irreversible migrations, missing backfill, deploy-window breaks, orphaned references, broken dual-write, transaction boundaries, hot-table index changes, silent data loss), the verification SQL examples, the P2 verification-gap rule, anchors 100/75/50/25, and "What you don't flag" all preserved verbatim. (Schema-drift / migration-gate logic was the explicitly-protected IP for this file.)
- **v1 coupling stripped:** the upstream `<review-base>` injection mechanic — "Use the review base ref from caller context (`<review-base>` — merge-base SHA or ref)" — rewritten to "Use the review base ref provided in your delegation envelope/context (merge-base SHA or ref) — call it `<review-base>` below." Behavior (schema diffs against the review base) preserved; the v1 caller-context framing replaced with envelope/context framing. "Use the anchored confidence rubric in the subagent template." -> "...in `schemas/findings-schema.json` (`_meta.confidence_anchors`)." (The "per synthesis rules" phrase in the anchor-50 line is generic, not v1-skill-specific, so kept.)
- **Output-contract swap:** "## Output format" stub replaced with canonical REVIEWER block, persona `data-migration` (standalone path `./bn-findings-data-migration.json`).

## bn-reliability-reviewer (<- ce-reliability-reviewer)

- **Frontmatter `name`:** `ce-reliability-reviewer` -> `bn-reliability-reviewer` (matches filename stem).
- **Frontmatter `model`:** `inherit` -> `sonnet` per invariant 7 (not a highest-stakes reviewer).
- **Frontmatter `tools`:** unchanged (`Read, Grep, Glob, Bash, Write`). No `Agent(...)`. `color: blue` kept.
- **Frontmatter formatting:** removed the stray blank line before the closing `---`.
- **`description`:** unchanged (no v1 skill names).
- **Persona body:** "What you're hunting for" (missing error handling on I/O boundaries, retry loops without backoff/limits, missing timeouts, error swallowing, cascading failure paths), anchors 100/75/50/25, and "What you don't flag" preserved verbatim.
- **v1 coupling stripped:** "Use the anchored confidence rubric in the subagent template." -> "...in `schemas/findings-schema.json` (`_meta.confidence_anchors`)."
- **Output-contract swap:** "## Output format" stub replaced with canonical REVIEWER block, persona `reliability` (standalone path `./bn-findings-reliability.json`).

## bn-adversarial-reviewer (<- ce-adversarial-reviewer)

- **Frontmatter `name`:** `ce-adversarial-reviewer` -> `bn-adversarial-reviewer` (matches filename stem).
- **Frontmatter `model`:** kept `inherit` per invariant 7 (adversarial is a highest-stakes reviewer; inherits the session/strong model).
- **Frontmatter `tools`:** unchanged (`Read, Grep, Glob, Bash, Write`). No `Agent(...)` added — `Agent(bn-repro-prover)` is deferred to unit U13 per the port spec and is intentionally NOT present now. `color: red` kept.
- **Frontmatter formatting:** removed the stray blank line before the closing `---`.
- **`description`:** unchanged (no v1 skill names).
- **Persona body:** the depth-calibration block (Quick/Standard/Deep size + risk-signal selection) and all four attack techniques — (1) assumption violation, (2) composition failures, (3) cascade construction, (4) abuse cases, each with its full sub-bullets — preserved verbatim. Anchors 100/75/50/25 preserved. The scenario-oriented-titles guidance, the step-by-step `evidence` guidance, and the `autofix_class: advisory` / `owner: human` default guidance preserved (relocated into the Output contract section). (Attack techniques were the explicitly-protected IP for this file.)
- **v1 coupling stripped:** "## What you don't flag" rewrote the reviewer-ownership cross-references from v1 agent names to Banyan persona descriptions — `ce-correctness-reviewer` -> "the correctness reviewer", `security-reviewer` -> "the security reviewer", `ce-reliability-reviewer` -> "the reliability reviewer", `performance-reviewer` -> "the performance reviewer", `ce-maintainability-reviewer` -> "the maintainability reviewer", `ce-testing-reviewer` -> "the testing reviewer", `ce-api-contract-reviewer` -> "the api-contract reviewer", `ce-data-migration-reviewer` -> "the data-migration reviewer". "Use the anchored confidence rubric in the subagent template." -> "...in `schemas/findings-schema.json` (`_meta.confidence_anchors`)."
- **Output-contract swap:** "## Output format" stub replaced with canonical REVIEWER block, persona `adversarial` (standalone path `./bn-findings-adversarial.json`). The persona-specific output guidance (scenario-oriented titles, step-by-step evidence, advisory/human autofix defaults) was retained as prose appended below the canonical block, since it is persona expertise rather than orchestration coupling.
