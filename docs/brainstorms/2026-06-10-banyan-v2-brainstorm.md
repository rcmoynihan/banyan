---
title: "Compound Engineering v2, reimagined for nested subagents (Banyan founding brainstorm)"
date: 2026-06-10
status: exported-verbatim
provenance: >
  Verbatim export of a Claude Code brainstorming session (2026-06-10) synthesizing
  three research reports: (1) the EveryInc compound-engineering-plugin internals,
  (2) Claude Code 2.1.172 nested-subagent mechanics, (3) the mid-2026 multi-agent
  coding harness landscape. Content below the marker is unedited.
---

<!-- VERBATIM EXPORT BEGINS -->

All three research tracks are done and verified. Here's the synthesis — first the load-bearing facts, then the v2 brainstorm.

## TL;DR

Nested subagents (Claude Code 2.1.172, depth 5) don't just let Compound Engineering parallelize more — they let it change shape. v1 is a hub-and-spoke system where the main session is the only orchestrator and every result must round-trip through it; that single constraint explains most of its awkwardness (report-only review mode, separate validator waves, lossy compounding). v2's big move is **delegating ownership of whole subtrees to "lead" agents with their own context budgets**, while keeping the one law the research is unanimous on: parallelize reads, serialize writes, one writer per file set. And the most important v2 idea isn't about execution at all — it's that **compounding should move down the tree and happen where context is fresh**, instead of being a lossy terminal step at the hub.

## What the research established

**Compound Engineering v1** (43 agents, 39 skills) is explicitly built around the old restriction — its own `AGENTS.md` says *"Agents cannot spawn agents. Skills orchestrate sub-agents (one level deep only)."* Consequences: `ce-code-review` in `mode:agent` can only *report* findings as JSON, and `ce-work` must come back up to the hub to dispatch fix agents; finding validation is a second flat wave instead of reviewers verifying in place; subagents return text only and the orchestrator writes all files; and their open issue #186 documents the core pain — subagent discoveries survive only as summaries in the hub's context, so if compaction hits before `/ce-compound` runs, the learnings come out thin.

**The new feature**: subagents can spawn subagents up to 5 levels deep (2.1.172, shipped June 9). Boris Cherny framed the motivation as **context management, not parallelism**. Key mechanics: a child's only output channel is still its final message; coordination must therefore go through files; `Agent(agent_type)` frontmatter syntax can restrict *which* agents a given agent may spawn; background nested agents auto-deny permission prompts; community cost data says subagent-heavy workflows run 3–15× tokens.

**The landscape verdict** (this is the part that should discipline the "engineering department" metaphor): the 2023–24 paradigm of simulating a software company with PM/architect/engineer/QA role-play (MetaGPT, ChatDev) is precisely what the Berkeley MAST failure study documents collapsing — ChatDev correctness as low as ~25%, with a third of failures being inter-agent misalignment. Anthropic's own Jan 2026 guidance names role-based "problem-centric decomposition" the canonical mistake ("a telephone game where each handoff loses context") and prescribes **context-centric decomposition**: split only where subtasks need genuinely disjoint context. The reconciled rule from the Cognition-vs-Anthropic debate: multi-agent wins for read-heavy, independently verifiable work; a single writer must own coupled write work. Where "more agents" reliably pays: parallel sampling + test-based selection (SWE-bench Lite 15.9%→56% with 250 samples), judge panels, and clean-context reviewers grounded in external signal.

So: v2 should feel like a department in terms of **ownership and accountability**, not in terms of job-title role-play. Hierarchy should follow context boundaries, not org charts.

---

# Compound Engineering v2: a brainstorm

## 1. The architectural inversion: from waves to subtrees

v1's unit of orchestration is the *wave* — the hub fans out N agents, collects N summaries, dedupes, fans out again. v2's unit is the **subtree with a contract**: the main session hands a *lead agent* a goal, an artifact path, and a budget, and the lead runs its own multi-stage orchestration internally, returning only a verdict plus pointers to artifacts.

The main session becomes a **Chief of Staff**: it talks to the user, holds intent and the plan, and almost never touches implementation detail. Its context stays pristine for the entire session — which is exactly what Cherny says nesting is for. Three core leads replace today's biggest flat pipelines:

- **`ce-research-lead`** — owns everything `/ce-plan` Phase 1 does today, but recursively. Today's researchers are one-shot; a v2 researcher who finds a thread (a suspicious migration, a half-deprecated API) can spawn a sub-researcher to chase it. Recursive investigation finally matches naturally recursive problems. The lead dedupes, resolves contradictions between researchers, and returns *one distilled research brief on disk* — the main context never sees raw research output.

- **`ce-review-lead`** — collapses v1's clumsiest seam. Today: review reports JSON → hub parses → hub dispatches fix agents → separate validator wave. v2: the lead spawns reviewers; each confirmed finding gets a **finding-owner** child that verifies → fixes → re-verifies in its own chain (pipeline semantics inside the tree — a `bugs` finding can be getting fixed while the `perf` reviewer is still reading). The lead returns "Ready to merge" with commits already applied and validated, or a short residual list. The validator wave stops being a phase and becomes a property of every finding's lifecycle.

- **`ce-delivery-lead`** — owns `/ce-work`'s execution loop. Per implementation unit, it makes an **atomizer decision** (borrowed from ROMA's Atomizer→Planner→recurse→Aggregator design): atomic → implement inline; composite → spawn unit-leads in isolated worktrees, each of which owns its own test-fix loop *and its own mini-review* before returning. A unit no longer comes back to the hub half-done.

A structural bonus: the org chart becomes *declared, not prompted*. `Agent(agent_type)` allowlists in each lead's frontmatter encode who may spawn whom — `ce-review-lead: tools: Agent(ce-correctness-reviewer, ce-security-reviewer, ce-finding-owner)`. This also dissolves v1's documented skill-duplication problem: shared dispatch policy lives once, in the lead's system prompt, instead of being copy-pasted across skills' `references/` files.

## 2. Fractal compounding — the idea that actually honors the philosophy

This is the headline. Compound engineering's whole thesis is "each unit of work makes the next easier," yet v1's compounding is a *terminal, hub-level, lossy* step — issue #186 in their own tracker shows lessons evaporating before `/ce-compound` ever runs.

v2 makes compounding **ambient and fractal**:

- **Harvest at the leaves.** Every lead, before returning, spawns a cheap **lesson-harvester** child that mines the subtree's still-fresh context: what didn't work, what surprised us, what convention was discovered. It writes *candidate lessons* to a staging directory (`docs/solutions/.staging/`). The finding-owner that just spent 40k tokens discovering why a retry loop deadlocks writes that lesson *itself*, with full context — not a summary-of-a-summary five levels later.
- **Curate at the trunk, asleep.** A **`ce-knowledge-curator`** runs as a background agent (or cron) doing Letta-style sleep-time compute: merge staging candidates into `docs/solutions/`, dedupe against existing docs, promote repeated lessons into pattern docs, prune stale ones, and make the minimal `CLAUDE.md`/`CONCEPTS.md` edits. `/ce-compound` and `/ce-compound-refresh` stop being commands you remember to run and become the harness's metabolism.
- **Meta-compounding: a harness-engineer agent.** Anthropic's tool-testing agent that rewrote tool descriptions cut downstream task time 40%; the ACE paper's Generator/Reflector/Curator loop gained +10.6% with no weight updates. v2 should have a periodic **`ce-harness-engineer`** that reads run transcripts (subagent transcripts persist on disk at known paths) and proposes diffs *to the plugin's own agents and skills*: "the security reviewer false-positived on the same pattern in 6 runs — here's a prompt edit." The system that produces the system improves too. That is compound engineering applied to itself, and it's only practical now because subtree transcripts are cleanly scoped units of evidence.

## 3. The ledger: stigmergy as the nervous system

Child→parent is still only a final message, and at depth 5 a summary-of-a-summary-of-a-summary is the telephone game MAST warns about. So v2 adopts the convergent practice of every serious 2025–26 system (Magentic-One's ledgers, Agent Teams' file-locked task list, Yegge's Beads): **the filesystem is the ground truth; final messages are pointers.**

Each run gets `docs/runs/<run-id>/` containing a **task ledger** (facts, plan, unit statuses — Magentic-One's outer loop), per-subtree **progress notes**, `findings/`, and `lessons-staging/`. Rules: every delegation names the artifact path the child must write; every final message is ≤ a verdict + paths; parents read artifacts, not prose. Side benefits: the user can watch a run live by watching the ledger; runs become resumable after interruption; and `ce-session-historian`/`ce-product-pulse` get structured data for free.

## 4. Delegation envelopes and budget contracts

Anthropic's research-system retro is blunt: early orchestrators spawned 50 subagents for simple queries, and vague delegations caused duplicated work. With 5 levels available, this failure mode compounds geometrically. v2 should standardize a **delegation envelope** — every spawn carries: objective, output artifact path, output format, explicit boundaries ("do not touch X"), tool guidance, and a **budget**: roughly how many children you may spawn, which model tier they run, and how much remaining depth you may use ("you're at depth 2; you may go 2 deeper").

Two corollaries:

- **Effort-scaling rules live in the leads.** A trivial diff gets zero reviewers spawned and an inline check; a 500-line auth change gets the full adversarial panel. v1's Lightweight/Standard/Deep classification already does this at the hub — v2 pushes the dial into every lead.
- **Model tiering down the tree.** Trunk and leads on the strong model; mid-tree workers on Sonnet-class; harvesters and scouts on Haiku-class. This is how you keep 3–15× token multiplication from becoming the headline cost story, and it mirrors what the 36k-star wshobson/agents collection already does flat.

## 5. Sampling and judging — spend depth where verification exists

The most empirically solid "more agents" win is sampling + selection, and nesting makes it composable at any level:

- **Contested implementation units**: the unit-lead spawns 2–3 parallel attempts in separate worktrees and selects by tests — *gated on tests actually existing*, per the Large Language Monkeys caveat that selection is the bottleneck without verifiers.
- **Plan judging**: `/ce-plan`'s "deepening pass" becomes a real judge subtree — N independent approach generators with different priors (MVP-first, risk-first, ops-first), then a PoLL-style panel of cheap judges, then synthesis from the winner. Today this is one agent rereading its own plan; Huang et al. showed intrinsic self-correction without external signal degrades output.
- **Adversarial review** keeps v1's excellent `ce-adversarial-reviewer` but gives it depth: it can spawn a child to *actually attempt* the cascade failure it hypothesizes (in a worktree, with tests) rather than merely asserting it.

## 6. What v2 must *not* do

- **No SDLC theater.** No PM-agent talking to an architect-agent talking to an engineer-agent. Every layer must exist for a context reason (disjoint reading, isolated writing, fresh-context judging), or it's just latency and token burn. MAST is the cautionary tale; "department" is a metaphor for ownership, not a screenplay.
- **Don't nest eagerly.** ADaPT's result is the right default: decompose *on failure or context pressure*, not preemptively. Most tasks should still run at depth 1–2; depth 3–5 is reserve capacity for when a unit blows up or an investigation goes deep.
- **One writer per file set, always.** Nesting localizes the read-parallel/write-serial law; it doesn't repeal it. Each lead is the "single-threaded Cognition agent" for its domain; parallel writers exist only across disjoint worktrees, merged by their parent (a dedicated **integrator/gatekeeper** child can own merge + full-suite + final commit).
- **Mind the permission cliff.** Background nested agents auto-deny permission prompts. Risky operations (pushes, migrations, deletions) must stay at trunk level or run foreground; leads should *report* the need rather than silently fail deep in the tree.

## 7. What `/lfg` v2 looks like

The pipeline stops being a sequential chain of skills in one context and becomes a season of subtree delegations from a nearly-empty trunk:

1. Chief of Staff (main session) clarifies intent with the user, opens the run ledger.
2. → `ce-research-lead` subtree → research brief on disk.
3. Plan drafted at trunk (writes stay with one writer), judged by a plan-judge subtree.
4. → `ce-delivery-lead` subtree → units fan out to unit-leads in worktrees, each self-testing and mini-reviewing; integrator merges.
5. → `ce-review-lead` subtree → findings fixed-and-verified in place; verdict returns.
6. Harvesters fire at every subtree boundary throughout; the sleep-time curator consolidates after the run.
7. Trunk presents the user a short narrative + the ledger, having spent maybe 15% of its context window on the entire feature.

The deep win: because the trunk stays small, sessions stop being the unit of work. A v2 session can plausibly span days and many features — which loops back to the philosophy, because the longer the harness lives, the more its compounding loop matters relative to any single task.

---

**Where I'd start if this were getting built** (it isn't, per your brief — but as a forcing function for the ideas): `ce-review-lead` is the highest-leverage first move. It eliminates v1's most visible architectural scar (report → re-dispatch → validator wave), it's read-heavy-then-scoped-writes so it's squarely in multi-agent's win zone, and it's a self-contained subtree you can A/B against `/ce-code-review` on real PRs. Fractal harvesting is the most *philosophically* important idea but depends on lead subtrees existing first. And the harness-engineer is the moonshot — the piece that would make v2 not just compatible with nesting, but the first harness whose compounding loop includes itself.

<!-- VERBATIM EXPORT ENDS -->
