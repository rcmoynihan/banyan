---
title: "Decision: new plugin skeleton that harvests v1's leaf assets (not a fork, not pure greenfield)"
date: 2026-06-10
status: accepted
provenance: Verbatim export of the follow-up recommendation from the founding brainstorm session.
---

<!-- VERBATIM EXPORT BEGINS -->

Neither a straight clone nor a true from-scratch build — I'd recommend a **new plugin skeleton that harvests v1's leaf-level assets**. The reasoning falls out of where the repo's value actually lives versus where the old constraint is baked in.

**What's worth keeping is the leaves, and they port almost verbatim.** The 43 agent definitions are mostly role prompts with read-only contracts — the adversarial reviewer's four attack techniques, the learnings-researcher's grep-first frontmatter retrieval strategy, the conditional reviewer-selection criteria, the deployment-verification Go/No-Go logic. None of that has any opinion about nesting; it's two years of accumulated prompt refinement you'd be foolish to rewrite from a blank page. Same for the persistence layer: the `docs/solutions/` frontmatter schema, the validation script, the category taxonomy, the `CONCEPTS.md` convention. That's the compounding substrate and it carries over unchanged — which matters even more if you have existing repos with populated `docs/solutions/` directories you want v2 to keep reading.

**What's not worth keeping is the orchestration, and that's exactly what a fork would trap you in.** The one-level-deep assumption isn't a config flag you can flip — it's structural across all 39 skills: skills-as-sole-orchestrators, `mode:agent` report-only contracts, the validator wave as a separate phase, "subagents return text, orchestrator writes files," and shared policy duplicated across `references/` files precisely *because* there was no lead agent to own it. Converting that incrementally inside a fork means every meaningful change fights the existing structure, and you inherit 39 skills' worth of orchestration logic written for a model you're abandoning. You'd spend more time deleting than designing.

There's also a maintenance argument: the repo is actively developed (173 releases, regular commits). A fork diverges immediately — you either stop merging upstream and the fork is effectively a from-scratch project with extra baggage, or you keep merging and conflict constantly in the orchestration files you've rewritten.

So concretely:

1. **Start a new plugin** (your own namespace, e.g. `ce2-`) with the v2 architecture: lead agents with `Agent(agent_type)` allowlists, the run ledger, delegation envelopes.
2. **Vendor the leaf agents** from upstream — copy the reviewer/researcher/utility agent files in, with small edits where v2 inverts a contract (e.g., a reviewer that may now spawn a verify-or-fix child gains the Agent tool; the "never write files" rule relaxes inside owned subtrees).
3. **Adopt the persistence schema as-is** so v2 is drop-in compatible with any `docs/solutions/` knowledge you've already accumulated.
4. **Keep v1 installed alongside** during the transition — different command names means no collision, and it gives you a natural A/B: run `/ce-code-review` and your `ce2-review-lead` against the same branch and compare. That review-lead subtree is still where I'd start, for the reasons from the brainstorm.

The mental model: v1's *agents* are employees worth re-hiring; v1's *skills* are the org chart you're explicitly reorganizing. Take the people, not the process docs.

<!-- VERBATIM EXPORT ENDS -->

> **Post-decision note:** the project namespace chosen for Banyan is `bn-` (e.g. `/bn-review`, `bn-review-lead`), superseding the `ce2-` placeholder used in the text above.
