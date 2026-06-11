# Edit log — U4 leaf agents: 4 researchers + deployment verifier

Ports of v1 compound-engineering leaf agents into Banyan, per the BANYAN AGENT PORT SPEC.
Source tree: `tmp/compound-engineering-upstream/plugins/compound-engineering/agents/`.
All five agents are mid-tier per Banyan invariant 7 (none are correctness/security/adversarial),
so every one is pinned to `model: sonnet`. None carries an `Agent(...)` allowlist — these are leaves.

---

## bn-repo-researcher (<- ce-repo-research-analyst)

- **Frontmatter `name`:** `ce-repo-research-analyst` → `bn-repo-researcher` (matches filename stem).
- **`description`:** kept verbatim — already free of v1 skill names and orchestration coupling.
- **`model`:** `inherit` → `sonnet` (invariant 7 mid-tier tiering).
- **`tools`:** `Read, Grep, Glob, Bash` → `Read, Grep, Glob, Bash, Write`. Added `Write` so the
  researcher can persist its brief artifact (Banyan invariant 3). No web/MCP tools upstream; none
  added (this agent researches the local repo, not the web). No `Agent(...)`.
- **Persona body:** preserved verbatim — full Phase 0 technology/infra scan, scoped-invocation
  table, core responsibilities, research methodology, quality assurance, tool-selection guidance.
- **Output section rename:** upstream `**Output Format:**` heading renamed to `**Brief Structure:**`
  and the `## Repository Research Summary` markdown skeleton kept intact as the brief body.
- **Output contract:** appended the canonical RESEARCHER block (persona `repo`); standalone fallback
  path `./bn-brief-repo.md`.
- **v1 coupling stripped:** none present upstream (no `/ce-plan`, `ce-code-review`,
  `/tmp/compound-engineering`, "orchestrator", or "Integration Points").

## bn-best-practices-researcher (<- ce-best-practices-researcher)

- **Frontmatter `name`:** `ce-best-practices-researcher` → `bn-best-practices-researcher`.
- **`description`:** kept verbatim — no v1 skill names in it.
- **`model`:** `inherit` → `sonnet`.
- **`tools`:** `Read, Grep, Glob, Bash, WebFetch, WebSearch, mcp__context7__*` →
  added `Write` (brief artifact). Web tools (`WebFetch`/`WebSearch`) and `mcp__context7__*` kept —
  this researcher reaches external sources. No `Agent(...)`.
- **Persona body:** preserved the research methodology verbatim — Phase 1 (skills-first), Phase 1.5
  (mandatory deprecation check), Phase 2 (online research via Context7/ctx7/web), Phase 3 (synthesis).
- **v1 skill-name strip:** the "Identify Relevant Skills" hard-coded mapping table (which listed
  v1 plugin-internal skills like `ce-dhh-rails-style`, `ce-frontend-design`,
  `ce-agent-native-architecture`, `ce-compound`, `ce-worktree`, `ce-gemini-imagegen`) was replaced
  with generalized skill-matching guidance (match topic to skill descriptions; prefer skills that
  name the exact technology). The skills-first *methodology* is preserved; only the v1 skill names
  were removed.
- **Source-attribution examples:** the v1-specific `"The dhh-rails-style skill recommends..."` and
  `"From skill: dhh-rails-style"` examples generalized to `<skill-name>` placeholders.
- **Output contract:** appended canonical RESEARCHER block (persona `best-practices`); standalone
  fallback `./bn-brief-best-practices.md`.
- **v1 coupling stripped:** no `/ce-plan`, `ce-code-review`, `/tmp/compound-engineering`,
  "orchestrator", or "Integration Points" present; only the v1 skill *names* were generalized.

## bn-framework-docs-researcher (<- ce-framework-docs-researcher)

- **Frontmatter `name`:** `ce-framework-docs-researcher` → `bn-framework-docs-researcher`.
- **`description`:** kept verbatim.
- **`model`:** `inherit` → `sonnet`.
- **`tools`:** `Read, Grep, Glob, Bash, WebFetch, WebSearch, mcp__context7__*` →
  added `Write`. Web + Context7 MCP tools kept. No `Agent(...)`.
- **Persona body:** preserved verbatim — documentation-gathering source order (Context7 MCP /
  ctx7 CLI / web), best-practices identification, GitHub research, source-code analysis via
  `bundle show`, workflow process, mandatory deprecation/sunset check, quality standards.
- **Output Format:** kept the upstream 7-section numbered structure (Summary, Version Information,
  Key Concepts, Implementation Guide, Best Practices, Common Issues, References) as the brief body.
- **Output contract:** appended canonical RESEARCHER block (persona `framework-docs`); standalone
  fallback `./bn-brief-framework-docs.md`.
- **v1 coupling stripped:** none present upstream.

## bn-web-researcher (<- ce-web-researcher)

- **Frontmatter `name`:** `ce-web-researcher` → `bn-web-researcher`.
- **`description`:** kept verbatim.
- **`model`:** already `sonnet` upstream — unchanged (already compliant with invariant 7).
- **`tools`:** upstream had NO `tools:` line (inherited all tools). Added an explicit least-privilege
  line: `Read, Grep, Glob, Bash, WebFetch, WebSearch, Write`. `WebFetch`/`WebSearch`/`Bash` included
  because the agent's whole job is web research (spec: keep web access); `Write` added for the brief
  artifact. No `Agent(...)`.
- **Persona body:** preserved verbatim — source-reading principles, 5-step methodology
  (preconditions, scoping, narrowing/deep-extraction, gap-filling, stop criteria), Output Format
  (research-value assessment + Prior Art / Adjacent Solutions / Market & Competitor Signals /
  Cross-Domain Analogies / Sources), token budget, untrusted-input handling, tool guidance.
- **v1 coupling stripped:** removed the entire `## Integration Points` section, which named
  `ce-ideate` (Phase 1 grounding) and `ce-plan` (Phase 1.3 external research) and `ce-brainstorm`
  as the invoking skills. Body references to "the caller"/"calling agent" are generic and were kept.
- **Output contract:** appended canonical RESEARCHER block (persona `web`); standalone fallback
  `./bn-brief-web.md`. (This replaces the upstream Integration Points return mechanic.)

## bn-deployment-verifier (<- ce-deployment-verification-agent)

- **Frontmatter `name`:** `ce-deployment-verification-agent` → `bn-deployment-verifier`.
- **`description`:** kept verbatim.
- **`model`:** `inherit` → `sonnet` (mid-tier; this agent emits a checklist, it is not a
  correctness/security/adversarial reviewer).
- **`tools`:** `Read, Grep, Glob, Bash` → `Read, Grep, Glob, Bash, Write`. Kept all inspection tools
  (`Read, Grep, Glob, Bash`) per spec; added `Write` for the brief artifact. No `Agent(...)`.
- **Persona body:** preserved verbatim — the 6-section Go/No-Go checklist template (Define
  Invariants, Pre-Deploy Audits, Migration/Backfill Steps, Post-Deploy Verification, Rollback Plan,
  Post-Deploy Monitoring), all SQL/Ruby verification snippets, and the rollback decision logic.
- **OUTPUT-BLOCK CHOICE: RESEARCHER block (persona `deployment`), NOT the REVIEWER block.**
  Rationale: the spec routes the verifier to the REVIEWER block *only if* it emits findings JSON
  conforming to `schemas/findings-schema.json`. This upstream agent does not — it produces a
  Go/No-Go deployment CHECKLIST / report (markdown checkboxes, SQL audits, a rollback table), with
  no findings/confidence/severity schema anywhere. Per the spec's fallback, a checklist-producing
  verifier uses the RESEARCHER block with persona `deployment` and keeps its checklist structure as
  the brief body. The upstream `**Output Format:**` heading was renamed to `## Brief Structure` and
  its `# Deployment Checklist` skeleton kept intact; standalone fallback `./bn-brief-deployment.md`.
- **v1 coupling stripped:** removed the `## When to Use This Agent` section. It contained the only
  v1-orchestration coupling in the file — the invocation trigger "Data Migration Expert flags
  critical findings" referenced another v1 agent. The remaining triggers in that section were
  generic ("PR touches database migrations", "involves backfills") and are already captured by the
  `description`, so the section was dropped wholesale rather than partially rewritten. No
  `/ce-plan`, `ce-code-review`, `/tmp/compound-engineering`, or "orchestrator" present.
