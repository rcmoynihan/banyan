---
module: "plugin architecture"
date: "2026-06-10"
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - "Evaluating whether to fork an existing Claude Code plugin or build a new skeleton"
  - "Vendored agent prompts carry accumulated prompt refinement worth preserving"
  - "Orchestration structure of the upstream plugin is incompatible with the desired v2 architecture"
tags:
  - fork-vs-greenfield
  - plugin-skeleton
  - vendoring
  - orchestration
  - agent-architecture
---

# Harvest leaf agents into a new plugin skeleton rather than forking or going greenfield

## Guidance

When a v1 Claude Code plugin contains valuable leaf-level agent prompts but an orchestration model that cannot be incrementally migrated, create a new plugin skeleton with its own namespace. Vendor the leaf agent definitions (role prompts, review personas, verification logic) into the new skeleton by direct copy with targeted edits. Adopt the v1 persistence schema (`docs/solutions/` frontmatter, validation script, category taxonomy) verbatim so existing knowledge stores remain readable.

Do not fork: a fork inherits the structural orchestration assumptions across every skill file, creates an immediate divergence from active upstream development, and forces constant merge conflicts in exactly the files being redesigned. Do not start from a blank page: two or more years of accumulated leaf-agent prompt refinement (adversarial review techniques, confidence gates, retrieval strategies, Go/No-Go logic) is the compounding value that survives the architecture change.

Install the new plugin alongside v1 under different command names during the transition to enable a natural A/B comparison on the same branch.

## Why

Forking traps the new project inside the old orchestration model. The one-level-deep constraint in v1 is structural across all skill files — skills-as-sole-orchestrators, subagent contracts, validator wave separation, policy duplication across `references/` — not a config flag. Every meaningful architectural change fights existing structure, and active upstream development (many releases, regular commits) means a fork diverges immediately and either stops merging upstream or conflicts constantly.

Going fully greenfield discards accumulated leaf-agent quality. The role prompts encoding review techniques, retrieval strategies, and verification logic have no opinions about nesting depth; they port almost verbatim and represent refinements that would take substantial time to recreate from scratch.

The persistence schema is worth preserving separately: host repos may already have populated `docs/solutions/` directories. A compatible schema means v2 reads them without migration.

## Applies when

- The target v2 architecture inverts a v1 contract (e.g., a reviewer that may now spawn a verification child, or a lead agent that owns file-writing instead of delegating it).
- The upstream plugin is actively maintained and merging is a realistic concern.
- Existing host repos carry knowledge stores in the v1 `docs/solutions/` format.
- The v1 leaf agents encode durable behavioral rules (not just wiring) that would be expensive to recreate.

## Verification

- The new plugin namespace (e.g., `bn-`) has no naming collision with the v1 namespace (e.g., `ce-`), confirming safe co-installation.
- Each vendored leaf agent file is listed in `vendor/MANIFEST.md` with its upstream SHA pin.
- `docs/solutions/` documents from v1-era host repos validate cleanly against the new plugin's `validate-frontmatter.py`.
- Running both plugins against the same branch (A/B) produces comparable or improved results from the new skeleton.

## Source

[docs/decisions/2026-06-10-fork-vs-greenfield.md](../../../../../docs/decisions/2026-06-10-fork-vs-greenfield.md)
