# Banyan implementation plan

**Date:** 2026-06-10 · **Plan ID:** 001 · **Type:** feat · **Status:** draft

Banyan is a Claude Code plugin: a hierarchical, self-compounding agent harness built for nested subagents (Claude Code ≥ 2.1.172, depth 5). It harvests the leaf-level assets of EveryInc's compound-engineering-plugin (MIT) and replaces its hub-and-spoke orchestration with **lead agents that own subtrees**, a **file-based run ledger**, **delegation envelopes with budgets**, and **fractal lesson harvesting**.

Source documents:
- Founding brainstorm: `docs/brainstorms/2026-06-10-banyan-v2-brainstorm.md`
- Architecture decision: `docs/decisions/2026-06-10-fork-vs-greenfield.md`

## Design invariants (apply to every unit below)

1. **Context-centric decomposition.** A new agent layer exists only for a context reason: disjoint reading, isolated writing, or fresh-context judging. Never for role-play.
2. **One writer per file set.** Reads parallelize; writes serialize within a subtree. Parallel writers only across disjoint git worktrees, merged by their parent.
3. **Artifacts over prose.** Every delegation names an output artifact path. Final messages are a verdict plus paths. Parents read files, not summaries.
4. **Decompose on failure, not eagerly.** Default depth is 1–2. Depth 3–5 is reserve capacity triggered by failure or context pressure (ADaPT rule).
5. **Budgets are explicit.** Every spawn carries a delegation envelope (objective, artifact path, format, boundaries, child/model/depth budget).
6. **Permission cliff.** Background nested agents auto-deny permission prompts. Pushes, migrations, deletions, and anything prompt-worthy stay at trunk level or run foreground.
7. **Model tiering.** Strong model at trunk and leads; Sonnet-class mid-tree; Haiku-class for harvesters and scouts. Declared per-agent via `model:` frontmatter.
8. **v1 compatibility at the persistence layer.** Banyan reads and writes the compound-engineering `docs/solutions/` schema unchanged, so existing knowledge stores keep working.

---

## Phase 0 — Scaffold and dev loop

### U1: Plugin skeleton
- **Goal:** Installable, empty-but-valid Claude Code plugin named `banyan`, namespace prefix `bn-`.
- **Dependencies:** none.
- **Files:** `.claude-plugin/plugin.json` (or marketplace manifest), `plugin/agents/`, `plugin/skills/`, `plugin/AGENTS.md` (Banyan's own conventions doc — the invariants above, plus "leads orchestrate subtrees; allowlists declare the org chart").
- **Approach:** Mirror the structural conventions of compound-engineering's plugin layout where they aren't orchestration-specific (skills as `SKILL.md` + `references/`, agents as markdown + frontmatter).
- **Verification:** `claude` session lists the plugin; a stub `/bn-hello` skill runs; a stub agent is spawnable via the Agent tool.

### U2: Dev/test harness
- **Goal:** Fast iteration loop and a fixture repo for end-to-end tests.
- **Files:** `test/fixture-repo/` (small app with a deliberate bug inventory and a real test suite), `scripts/dev-install.ps1` (symlink/copy plugin into a sandbox project), `scripts/smoke.ps1`.
- **Approach:** The fixture repo is the standing test bed for every later unit: seeded bugs for review, seeded `docs/solutions/` entries for retrieval tests, seeded plan docs for delivery tests.
- **Verification:** `scripts/smoke.ps1` installs the plugin into the fixture and runs the stub skill headlessly (`claude -p`).

## Phase 1 — Vendor v1's leaf assets

### U3: Vendoring pipeline + provenance
- **Goal:** Reproducible import of upstream agent files with license compliance and drift tracking.
- **Dependencies:** U1.
- **Files:** `scripts/vendor.ps1`, `vendor/MANIFEST.md` (upstream repo, commit SHA, file list, local-edit log), `LICENSES/compound-engineering-MIT.txt`.
- **Approach:** Pin to a specific upstream commit. Every local edit to a vendored file gets a one-line entry in the manifest (what changed, why). Re-running the script diffs upstream against our pinned base and reports — never auto-merges.
- **Verification:** Script runs clean; manifest lists every vendored file with SHA; MIT notice present.

### U4: Port the leaf agents
- **Goal:** The reviewer personas, researchers, and utility agents available under Banyan, minimally edited for the nested world.
- **Dependencies:** U3.
- **Files:** `plugin/agents/bn-*.md` — initial set: the 6 always-on reviewers (correctness, testing, maintainability, project-standards, agent-native, learnings-researcher) + conditional reviewers (security, performance, api-contract, data-migration, reliability, adversarial) + researchers (repo-research, learnings, best-practices, framework-docs, web) + `bn-deployment-verifier`.
- **Approach:** Rename to `bn-` prefix. Edits limited to: (a) tool grants where a v2 contract differs (a lead carries an `Agent(...)` allowlist; reviewer personas stay read-only leaves — the adversarial reviewer remains read-only, and execution-grounded verification is delivered by `bn-dogfood-verifier` plus finding-owner repro replays, not a reviewer-spawned prover); (b) output contract changed from "return JSON text" to "write JSON to the artifact path in your envelope, return verdict + path"; (c) strip v1 orchestration references. Log every edit in `vendor/MANIFEST.md`.
- **Verification:** Each agent spawnable standalone against the fixture repo; reviewer agents produce schema-valid findings files; learnings-researcher retrieves a seeded solution doc.

### U5: Persistence layer compatibility
- **Goal:** Banyan reads/writes the v1 knowledge store format exactly.
- **Dependencies:** U3.
- **Files:** `plugin/schemas/solution-frontmatter.yaml` (vendored), `plugin/skills/bn-conventions/scripts/validate-frontmatter.py` (vendored), `scripts/validate-frontmatter.py` (repo-root launcher), `plugin/skills/bn-conventions/references/knowledge-store.md` (the docs/solutions taxonomy, category list, two-track doc structure).
- **Verification:** Validator passes on seeded fixture solutions; a doc written by a Banyan agent passes the vendored validator.

## Phase 2 — The coordination substrate

### U6: Run ledger specification + skill
- **Goal:** The stigmergic nervous system: a file layout every Banyan run uses, and helpers for it.
- **Dependencies:** U1.
- **Files:** `plugin/skills/bn-conventions/references/ledger.md` (spec), run layout:
  ```
  docs/runs/<run-id>/
    ledger.md            # task ledger: facts, plan, unit statuses (Magentic-One outer loop)
    progress/<agent>.md  # per-subtree progress notes
    findings/            # review findings JSON, one file per finding
    briefs/              # research briefs, plan-judge outputs
    lessons-staging/     # harvested candidate lessons (consumed by curator)
  ```
- **Approach:** Run IDs are `YYYY-MM-DD-NNN-<slug>`. Ledger writes are append-mostly; unit statuses are single-writer (the lead that owns the unit). `docs/runs/` is local run state for resumability and audit while work is active; durable knowledge is promoted into `docs/solutions/`, and fixture/eval runs live in explicit fixture/eval paths.
- **Verification:** Spec doc reviewed; a scripted dry-run creates a conforming run dir; two concurrent writers to different progress files don't collide.

### U7: Delegation envelope convention
- **Goal:** A standard envelope every Banyan spawn carries, and the prompt-level contract for honoring it.
- **Dependencies:** U6.
- **Files:** `plugin/skills/bn-conventions/references/envelope.md`; an envelope template block embedded in every lead's system prompt.
- **Approach:** Envelope fields: `objective`, `artifact_path`, `output_format`, `boundaries` (explicit do-not-touch), `tool_guidance`, `budget {max_children, model_tier, depth_remaining}`, `effort_class (lightweight|standard|deep)`. Leads must echo the envelope into their progress file on start (makes violations auditable from the ledger). Depth accounting is prompt-level (decrement `depth_remaining` when spawning) since the harness exposes no depth counter.
- **Verification:** Fixture test — a lead given `max_children: 2` spawns ≤2; a child given `depth_remaining: 0` completes inline instead of delegating; envelope echoed in progress files.

## Phase 3 — First subtree: review (the A/B milestone)

### U8: `bn-review-lead` + `bn-finding-owner`
- **Goal:** The flagship lead: full review subtree that selects reviewers, dedupes findings, and fixes-and-verifies in place — returning an applied verdict, not a report.
- **Dependencies:** U4, U6, U7.
- **Files:** `plugin/agents/bn-review-lead.md` (tools: `Agent(bn-correctness-reviewer, bn-testing-reviewer, bn-maintainability-reviewer, bn-project-standards-reviewer, bn-agent-native-reviewer, bn-learnings-researcher, bn-security-reviewer, bn-performance-reviewer, bn-api-contract-reviewer, bn-data-migration-reviewer, bn-reliability-reviewer, bn-adversarial-reviewer, bn-finding-owner)` + read/write/bash), `plugin/agents/bn-finding-owner.md`, `plugin/skills/bn-review/SKILL.md` (thin trunk-side entry: scope detection, envelope construction, dispatch, verdict presentation).
- **Approach:**
  - Lead internalizes v1's reviewer-selection matrix (always-on six + conditionals by diff content) and effort scaling (trivial diff → zero spawns, inline check).
  - Reviewers write findings to `findings/`, return paths. Lead dedupes by v1's fingerprint rule (file + line ±3 + normalized title; cross-reviewer agreement promotes confidence; suppress <75 except P0 at 50+).
  - Each surviving finding → one `bn-finding-owner` child: independently verify (fresh context, external signal: run the failing case) → fix → re-run tests → write outcome. Pipeline semantics: finding-owners start as soon as their finding is confirmed, while other reviewers still run.
  - Single-writer law: finding-owners get disjoint file sets; overlapping findings are batched to one owner. Lead never edits files itself; it merges, runs the full suite, and commits (`fix(review): ...`) only if the pre-review tree was clean — preserving v1's safety contract.
  - Keep v1's protected-artifacts rule (never act on findings proposing deletion of `docs/brainstorms|plans|solutions|runs`).
- **Verification:** Against the fixture repo's seeded bug inventory: ≥ v1 recall on seeded P0/P1 bugs, fixes applied with green suite, residuals correctly reported. No file written outside finding-owner scopes.

### U9: A/B evaluation vs `/ce-code-review`
- **Goal:** Evidence the subtree design beats the flat wave before building more leads.
- **Dependencies:** U8.
- **Files:** `eval/review-ab/protocol.md`, `eval/review-ab/results/`.
- **Approach:** Same branches (fixture + 3–5 real PRs from your own projects), both pipelines, blind-ish scoring rubric: seeded-bug recall, false-positive rate, % findings fixed-and-verified vs merely reported, wall-clock, total tokens, trunk-context consumed. Token telemetry via OTEL `agent_id`/`parent_agent_id` spans if available, else transcript accounting.
- **Verification:** Written results doc with a go/no-go recommendation for Phase 4. This is the project's first real gate.

## Phase 4 — Research and planning subtrees

### U10: `bn-research-lead`
- **Goal:** Recursive research subtree returning one distilled brief on disk.
- **Dependencies:** U4, U7; gated on U9 go.
- **Files:** `plugin/agents/bn-research-lead.md` (tools: `Agent(bn-repo-researcher, bn-learnings-researcher, bn-best-practices-researcher, bn-framework-docs-researcher, bn-web-researcher, bn-thread-chaser)`), `plugin/agents/bn-thread-chaser.md` (small recursive investigator: may spawn one more of itself if `depth_remaining > 0`).
- **Approach:** Lead dispatches researchers per v1's intent rules, then triages their outputs: contradictions → targeted follow-up spawn; promising threads → `bn-thread-chaser`. Synthesizes `briefs/research-brief.md` (findings, contradictions resolved, open questions, sources). Trunk never sees raw research.
- **Verification:** Fixture scenario with a planted two-hop trail (a doc that references a migration that references a config) — brief must surface the leaf fact; depth budget respected.

### U11: `/bn-plan` + plan-judge subtree
- **Goal:** Planning skill producing v1-compatible plan docs (Implementation Units, stable U-IDs), with deepening replaced by a real judge panel.
- **Dependencies:** U10.
- **Files:** `plugin/skills/bn-plan/SKILL.md`, `plugin/agents/bn-plan-generator.md` (parameterized prior: mvp-first | risk-first | ops-first), `plugin/agents/bn-plan-judge.md` (rubric-scored).
- **Approach:** Trunk (single writer) drafts the plan from the research brief. For standard/deep efforts: spawn 2–3 generators with different priors → panel of 3 independent judges scores all drafts against a rubric (feasibility, coherence, scope discipline, verification quality) → trunk synthesizes from the winner, grafting runner-up ideas. Writes `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md`.
- **Verification:** Plans pass v1 structural conventions; judge scores recorded in `briefs/`; lightweight efforts skip the panel entirely (effort scaling observable in the ledger).

## Phase 5 — Delivery subtree

### U12: `bn-delivery-lead`, `bn-unit-lead`, `bn-integrator`
- **Goal:** Execution engine: atomizer decisions, worktree-isolated unit subtrees with self-test and mini-review, single integrator.
- **Dependencies:** U8 (reuses review machinery), U11.
- **Files:** `plugin/agents/bn-delivery-lead.md`, `plugin/agents/bn-unit-lead.md` (tools include `Agent(bn-unit-lead)` for one level of recursive splitting, plus reviewer types for mini-review), `plugin/agents/bn-integrator.md`, `plugin/skills/bn-work/SKILL.md`.
- **Approach:**
  - Delivery-lead reads the plan, makes per-unit atomizer decisions: atomic → implement inline (itself, serial); composite → spawn unit-leads in `isolation: worktree`.
  - Unit-lead owns its unit end-to-end: implement → test-fix loop → scoped mini-review (one correctness reviewer over its own diff) → conventional commits → return verdict + branch ref. May split once more **only on failure or context pressure** (envelope-gated).
  - Integrator (single writer for the merge) merges branches in dependency order, runs the full suite, resolves conflicts or bounces a unit back with a specific envelope.
  - Optional sampling mode (deferred — see "Deferred to follow-up work"): a unit flagged `contested` would get 2–3 parallel attempts selected by tests, gated on runnable tests. The shipped delivery subtree does not sample competing attempts; `bn-unit-lead` splits once on genuine over-size or failure, not into parallel rival implementations.
  - Permission cliff: delivery subtree never pushes; push/PR remains a trunk-level `bn-ship` step (vendor v1's commit/push/PR utilities).
- **Verification:** Fixture plan with 3 units (two independent, one dependent): parallel worktrees, dependency-ordered merge, green suite, per-unit mini-review evidence in the ledger. Failure injection: a unit whose tests can't pass must escalate per envelope, not loop forever.

## Phase 6 — Fractal compounding

### U13: `bn-lesson-harvester` + subtree-boundary harvesting
- **Goal:** Lessons captured where context is fresh — every lead's exit path includes a harvest.
- **Dependencies:** U8 (first host), then wired into U10/U12 leads.
- **Files:** `plugin/agents/bn-lesson-harvester.md` (Haiku-class, write access limited to `lessons-staging/`), harvest step appended to each lead's prompt.
- **Approach:** Before returning, each lead spawns one harvester with a pointer to its progress file and findings: capture what-didn't-work, surprises, discovered conventions as candidate docs in v1 solution format (marked `status: candidate`). Cheap by construction: one Haiku child per subtree, bounded output.
- **Verification:** After a review run on the fixture, staging contains ≥1 candidate accurately describing a real dead-end from the run (checked by hand the first times); candidates pass the frontmatter validator.

### U14: `bn-knowledge-curator` (sleep-time compute)
- **Goal:** Background consolidation: staging → `docs/solutions/`, dedup, pattern promotion, pruning, minimal `CLAUDE.md`/`CONCEPTS.md` discoverability edits.
- **Dependencies:** U13.
- **Files:** `plugin/agents/bn-knowledge-curator.md`, `plugin/skills/bn-curate/SKILL.md` (manual trigger + post-run background dispatch from trunk; optionally a cron/scheduled invocation).
- **Approach:** Grep-first overlap detection (v1's 5-dimension rule): high overlap → update existing doc, else promote candidate. Repeated lessons (≥3 related docs) → propose a pattern doc. Runs in background with pre-granted write scope limited to `docs/solutions/`, `CONCEPTS.md`, `CLAUDE.md`; anything else is report-only (permission cliff).
- **Verification:** Seed staging with a near-duplicate of an existing solution + a novel candidate: curator merges the first, promotes the second, and the staging dir is empty after; learnings-researcher retrieves the promoted doc in the next run.

### U15: `/bn-grow` (the full pipeline, replaces `/lfg`)
- **Goal:** End-to-end: ledger open → research subtree → plan + judge → delivery subtree → review subtree → ship gate → curator dispatch, from a trunk that stays small.
- **Dependencies:** U10, U11, U12, U8, U14.
- **Files:** `plugin/skills/bn-grow/SKILL.md`.
- **Approach:** Thin trunk choreography with explicit gates between subtrees (plan file exists; code changed; review verdict ready; suite green). Trunk-context budget target: <20% of window for a medium feature — measure it.
- **Verification:** Full fixture feature end-to-end headlessly; ledger tells the complete story; trunk context measured against target.

## Phase 7 — The moonshot

### U16: `bn-harness-engineer`
- **Goal:** Periodic agent that mines run transcripts/ledgers for recurring harness failures and proposes diffs to Banyan's own agents and skills.
- **Dependencies:** U15 + several real runs of accumulated ledger data.
- **Files:** `plugin/agents/bn-harness-engineer.md`, `plugin/skills/bn-tune/SKILL.md`, `docs/harness-changelog.md`.
- **Approach:** Inputs: `docs/runs/` ledgers + subagent transcripts (persisted under `~/.claude/projects/.../subagents/`). Looks for: repeated reviewer false positives, envelope violations, budget overruns, dead-end patterns. Output: PR-style proposed diffs to `plugin/` files with evidence citations — **never self-applies**; human merges. Each applied change logged with its evidence.
- **Verification:** On ≥5 runs of accumulated data, produces ≥1 actionable, evidence-cited proposal a human judges correct. (Soft gate; this unit is exploratory.)

---

## Cross-cutting workstreams

- **Token telemetry:** per-run token/cost accounting from OTEL spans or transcripts, reported in the ledger from U8 onward. The 3–15× multiplier is the project's main external risk; measure it from day one.
- **Effort scaling everywhere:** every entry skill classifies lightweight/standard/deep and the classification must visibly change spawn counts (assert in fixture tests).
- **Upstream watch:** docs for 2.1.172+ are still catching up; re-verify `Agent(agent_type)` allowlist semantics in nested contexts (U7's fixture test covers this) and watch changelog for depth-cap or SendMessage changes. If experimental Agent Teams (`SendMessage`) stabilizes, leads gain mid-flight steering — revisit U8/U12 contracts then.

## Sequencing and gates

```
Phase 0 (U1,U2) → Phase 1 (U3,U4,U5) → Phase 2 (U6,U7) → Phase 3 (U8,U9)
                                                              │ GATE: A/B results
                                                              ▼
                                    Phase 4 (U10,U11) → Phase 5 (U12) → Phase 6 (U13,U14,U15) → Phase 7 (U16)
```

Phases 0–3 are the minimum credible product: a working review subtree with evidence it beats the flat design. Everything after is gated on U9.

## Risks

| Risk | Mitigation |
|---|---|
| Token costs make deep trees uneconomical | Model tiering (U7 envelopes), effort scaling, telemetry from U8; decompose-on-failure default keeps most runs shallow |
| Telephone-game quality loss at depth | Artifacts-over-prose invariant; ledger as ground truth; U9 measures quality directly |
| `Agent(agent_type)` semantics in nested contexts undocumented | U7 fixture test verifies empirically before anything depends on it |
| Background permission auto-deny silently breaks deep agents | Invariant 6; risky ops trunk-only; leads report needs upward |
| Harvester noise pollutes the knowledge store | `status: candidate` staging + curator gate + human-checked early runs (U13/U14) |
| Upstream v1 drifts under our vendored files | Pinned SHA + manifest + diff-report script (U3); we own divergence deliberately |

## Deferred to follow-up work

- Multi-platform export (v1's converter approach) — Claude Code only for now.
- Cron-scheduled curator and product-pulse style reporting.
- Verifier-gated sampling / multiple-attempt mode, including `contested` units (cost gate).
- Agent Teams / SendMessage integration (blocked on the feature leaving experimental).
