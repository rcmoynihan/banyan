---
title: "Deeper nesting as fundamental unlocks (Banyan brainstorm)"
date: 2026-06-11
status: assessed
provenance: >
  Distills a Codex discussion on whether Banyan could use deeper nesting for
  fundamental new capabilities, combined with an evidence review (published
  multi-agent results through early 2026), adversarial critique, and
  step-through simulations of the candidate mechanisms on concrete tasks.
---

# Deeper nesting as fundamental unlocks

The question: can deeper nesting compute something structurally different from what a single agent or flat panel can compute, beyond context focus?

The short answer: rarely, and only for one reason — **context independence, not hierarchy**. Most of the candidate mechanisms below turn out to be artifact conventions, sequences, or breadth wearing nesting language. The artifacts themselves (typed counterexamples, executable proof obligations, routed fact cards) are genuinely valuable; the depth mostly is not. No published system shows positive evidence for depth 3–4 — every successful result is depth ≤ 2 (Anthropic's research system, RLM-style recursion, CodeMonkeys-style parallel sampling are all two-level), telephone-game loss and the decomposition tax compound per hop, and Banyan's own review A/B eval showed detection *parity* with the flat baseline — the measured win was trunk footprint, not depth.

## The design bar

Every extra depth level must **add an execution, not an opinion**.

This sharpens the weaker form ("every level must produce a verifier, a counterexample, or a proof bundle"), which leaves a loophole: a proof bundle whose fields are self-reported is model testimony wearing a schema. Every child in a tree is the same model with the same training-induced blind spots, so depth multiplies *correlated* testimony; prompted adversarialism does not decorrelate it. Only execution does.

## The keystone: execution-grounded claims

Every mechanism below lives or dies on the same fault line. Claims split into two classes:

- **Machine-checkable** — a `repro_command` the parent actually re-runs, a counterexample test that is red on the old code and green on the fix, mutation kills, lint, suite counts. These carry real proof-carrying-code force (Necula's asymmetry: the consumer's job collapses from proving to checking). Re-running a repro costs seconds and a few hundred tokens. Meta's TestGen-LLM / Assured-LLMSE line is the production existence proof: every artifact clears measurable filters (builds, passes, improves coverage) before a human sees it.
- **Self-reported** — "files inspected", "remaining uncertainty", "why the parent may trust this", causal explanations. These are the prose the format was meant to replace. Under verification pressure models confabulate them ("tests run: yes" is the cheapest token sequence a model can emit), and the reward-hacking literature documents models special-casing tests and gaming checkers when gated on them.

A second, subtler limit: **verification validates fixes, never explanations.** A causally-wrong bundle with a green repro passes every gate a run can afford. The blast radius matters because the lesson-harvester → curator pipeline can promote a false cause into `.banyan/solutions/` — the knowledge store is the durable-poison vector.

The shared convention that follows, and the highest-leverage single change:

- Every claim carries `claim_type: tested | inspected | assumed`.
- `tested` requires citing the **intervention** that isolates the mechanism (e.g., "counterexample goes green with only the claimed mechanism disabled"), not just a passing suite.
- Parents re-run the `repro_command` before accepting any bundle, counterexample, or card. This is the one verification cheap enough to mandate at every acceptance boundary.
- The curator promotes causal claims to `.banyan/solutions/` only when `claim_type: tested`. Wrong-but-green survives in-run; it must not survive into the knowledge store.

## The mechanisms, assessed

### 1. Counterexample-driven recursion — strongest; keep, de-romanticized

The only mechanism whose trigger is an external executable signal (an actually-failing test) rather than model self-report, and the best-grounded: CEGIS-style counterexample feedback beats generic retry across models in peer-reviewed LLM-repair results (AAAI 2025, 1,431-program benchmark; TiCoder's failure-driven loop, +46% pass@1). It also aligns with what Banyan already does — decompose-on-failure is invariant 4, `bn-unit-lead` splits once on failure, `bn-debug-lead` runs prediction-first investigators.

The CEGIS framing flatters it, though: there is no formal spec, no sound verifier, and no termination guarantee. A failing integration test does not name the guilty unit — `bn-integrator`'s bounce attribution is *positional* (which merge turned the suite red), not causal, and the defect often lives in a different unit's file boundary, where today's contract forces a `blocked` return and a wasted round-trip. With weak tests, failure-gated recursion degrades into special-case whack-a-mole.

**Form worth building:**

- Bounces are typed counterexample objects, not prose: claim violated, `repro_command`, observed output verbatim, green-without ref, suspect slice (file:line ranges), and an explicit `attribution_confidence` line ("merge-order only" vs causal).
- **Boundary re-assignment on bounce**: the counterexample's suspect slice, not the original plan partition, defines the re-dispatched unit's file boundary.
- The re-dispatched unit-lead may spend one child on a fresh-context causal investigator whose context is *only* the counterexample plus the suspect slice, with an intervention requirement on its causal claim. Reuse `bn-hypothesis-investigator` rather than minting a new agent type.
- Hard caps: two bounces, one probe level, then escalate to the trunk. Depth-4 probes almost never pay — an investigator handles a single-cause failure itself.

Simulated cost is roughly neutral against today's thrash-prone re-dispatch (~25–40k tokens per bounce cycle either way), with better attribution.

### 2. Proof-carrying subtasks — keep the checkable kernel, discard the costume

As originally conceived (every child returns claim / files inspected / tests run / counterexamples checked / remaining uncertainty / trust justification), this is a depth-0 schema change with a fatal confabulation problem, and it fails the design bar — the leaf produces the bundle, and leaves already exist.

Gutted to its kernel it becomes the connective tissue for everything else:

- A required `repro_command` (or verify command) per unit/finding outcome, which the parent **executes before accepting** the artifact.
- `claim_type` tagging on every claim in progress files and findings, per the keystone convention.
- Optionally, files-inspected cross-checked against tool logs — a harness/hook feature, not a prompt feature.

What "verify a tree of claims" oversells: claims are entangled ("unit A correct *given* B's interface holds") and a tree cannot represent the cross-edges, so a green leaf-tree does not verify composition. Composition failure is why `bn-integrator` exists; the tree does not replace it.

### 3. Builder-breaker-repairer — keep as a review mode, not a game

The three roles are siblings under one lead — a sequence at one level, not depth. Critics demonstrably catch bugs (CriticGPT: ~85% of inserted bugs vs 25% for humans), and execution-grounded judging fixes the known weakness of LLM judges (biased, gameable, beaten by confident formatting). But the strongest objection lands precisely here: same-model adversarialism manufactures **false confidence in exactly the domains where overconfidence is most expensive** (auth, payments, concurrency, migrations). The breaker's threat model is the builder's threat model; a green run is the same model agreeing with itself, and it will be read as security assurance. No published controlled result shows the full three-role loop beating a single strong critic plus counterexample feedback at equal token budget.

The runnable-counterexample requirement is achievable in-process, which is what saves the mechanism: scope-escalation tests, error-oracle indistinguishability tests, revocation tests, store-contains-no-plaintext tests are each ~40 deterministic lines under an existing test harness. Where infra is missing (no HTTP layer, no running server, timing channels), the breaker physically cannot produce a runnable exploit — and that degrade must be typed, not dropped. "Repairer fixes only proven failures" as a rule silently discards every untestable concern, which is the failure mode.

**Form worth building:**

- A breaker variant of `bn-adversarial-reviewer` with Write access to a breaker-owned `counterexamples/` dir under the run ledger (one-writer rule: the builder's worktree is not the breaker's file set; the integrator adopts surviving counterexamples into `test/` at merge).
- Findings typed `proven` (runnable counterexample attached, red run output cited) or `concern` (`claim_type: inspected`, file:line, why untestable here). `proven` findings gate the applied verdict — no verdict while a counterexample is red or unadjudicated. `concern` findings route into the ordinary `bn-finding-owner` stream.
- Triggered by the existing risky-domain effort matrix, not universally.
- Genuine depth appears only narrowly: a breaker child that builds a missing test fixture (context quarantine for scaffolding), or one that minimizes a flaky repro to a deterministic one.

### 4. Verifier-gated sampling — best-evidenced, most likely to buy nothing

The literature here is the strongest of any mechanism: AlphaCode/AlphaCode 2, Large Language Monkeys (coverage scales log-linearly over four orders of magnitude of samples — *with* automatic verifiers; without them selection plateaus around 100 samples), CodeT, CodeMonkeys (where ~12 points of coverage die in the selection gap even with model-generated tests). Quantitative, replicated, real.

Two objections cap it in practice. First, where a strong verifier exists, a single agent *iterating against it* (generate → run → fix) usually beats one-shot best-of-N at 1/N the cost, because it uses verifier output as feedback rather than as a filter; best-of-N wins only when attempt variance is high and iteration is impossible. Second, samples are correlated — same model, same spec — and if the gating tests came from the same model, this is selection among clones, gated by a clone. Simulated multiplier: ~3.3× (the mandatory mini-review and harvester spawns multiply silently), and when the existing suite is strong and the unit small, all attempts tie on every hard signal and selection degenerates to diff-size taste at full price.

**Form worth building (last, and opt-in):**

- Plan-frontmatter `sampling: N` honored by `bn-delivery-lead` at `deep` effort only.
- Pre-gate: sample only when the unit's done-condition includes currently-red tests or an executable invariant, *and* the spec admits genuinely different strategies. Diversify attempt priors (mvp / risk / ops, as the plan generators do) to partially decorrelate.
- Verifier is a leaf agent that **pre-registers 4–6 spec-derived mutants before reading any attempt** ("drop the invalidation on write", "invalidate the wrong key") and scores suite kills per attempt alongside suite / lint / diff size / boundary compliance. Real mutation tooling (install + minutes of runtime) is impractical mid-run; pre-registered mutants are the affordable substitute, and registering them spec-first avoids biasing toward any attempt's structure.
- Abort path: a scorecard that ties on all hard signals picks smallest-diff and **records that sampling bought nothing**, feeding `/bn-tune` so the contested-unit heuristic improves.
- Losing attempts' staged lessons are discarded with them.

### 5. Test generation before implementation — do not build as a subtree

TDD-for-LLMs results are real (+12–26 points class-level correctness; TiCoder) but unit/class-scale, with hidden reference tests doing the grading. At repo scale the oracle is circular: the test subtree, the implementation subtree, and a test-fidelity judge all derive from the same prose requirements via the same model — the misunderstanding is encoded twice and then certified. The empirical test-generation literature confirms the exact failure path: LLM-generated tests fail mostly via incorrect assertions. A frozen pre-test suite also invites teaching-to-the-test and forces a cross-subtree contract renegotiation whenever implementation discovers the spec is wrong (common).

The plan-judge panel already produces acceptance criteria; the marginal value of frozen executable pre-tests over those criteria does not cover the front-loaded latency. What survives of the idea lives inside the breaker (mechanism 3): behavioral tests written *after* implementation, against the spec, adversarially — which dodges the freeze problem and breaks half the correlation.

### 6. In-run fact cards — smallest, least risky, build first

A research subtree that discovers a load-bearing invariant ("session IDs are recycled after logout; the new store must tolerate collisions") should make it retrievable inside the same run, not only after curation. This is not recursion and not depth — it is the ledger's coordination-through-files invariant plus a convention (~40 lines of contract text, no new agents). The blackboard-architecture literature supports shared structured state (token-efficiency wins on reasoning tasks; directly attacks the top measured inter-agent failure modes — information withholding and duplicated work), though not yet for coding agents specifically.

The non-obvious design constraint, from simulation: **pull fails silently at depth.** A unit-lead two levels down never reads `facts/` because nothing in its contract says to, and envelopes are the only channel into a nested agent. Routing must be push-based.

**Form worth building:**

- `.banyan/runs/<run-id>/facts/<slug>.md`, one card per file (one-writer clean), with a pointer line in the ledger's `## Facts / Context`. Card fields: `claim`, `provenance` (file:line and, ideally, a citing test), `must_hold` (the obligation on downstream work), `binds_to` (path globs), `status: verified | unverified`, `consumers`.
- The lead that synthesizes a subtree's output writes the cards; the delivery-lead **routes by `binds_to`** — cards matching a unit's file boundary are pushed verbatim into that unit's envelope (capped top-K, with a pointer to `facts/` for the rest). Pull remains the backstop for the trunk and review lead.
- `bn-review-lead` checks each `must_hold` card whose `binds_to` intersects the diff: confirm a test pins it or dispatch a finding.
- Poisoning containment: `verified` requires provenance citing a test or intervention; consumers of `unverified` cards spot-check the cited lines (one Read, ~300 tokens) and treat the card as a question, not a premise; the curator promotes only `verified` cards. A wrong card is worse than no card — it propagates one subtree's misreading laterally with the authority of distilled knowledge, and a false-negative card ("IDs are never reused") gets laundered through three subtrees with a confident audit trail.

## What depth actually buys

Two cases, both narrow:

1. **A fresh witness rooted at a failure.** The causal investigator whose context contains only the counterexample, uncontaminated by the unit-lead's beliefs about its own code. This is the one place an extra level computes something a flat shape does not get cheaply — and one level suffices.
2. **Context quarantine for scaffolding.** A breaker spawning one child to build a missing test fixture so its adversarial context stays clean.

Everything else attributed to depth is attributable to the artifacts — and the artifacts have the longer shelf life. Growing context windows steadily erode depth-as-context-management; they do not erode execution-grounded verification. A repro command is worth re-running no matter how big the window gets.

## Build order

1. **Typed-claims convention** — `claim_type` + mandatory repro re-run on acceptance + curator promotion gating. The keystone; protects the knowledge store, the one place in-run errors become durable.
2. **Fact cards with `binds_to` routing** (mechanism 6) — tiny, flat, immediately useful.
3. **Counterexample bounces + boundary re-assignment + causal investigator** (mechanisms 1+2 reduced) — edits to `bn-integrator.md`, `bn-delivery-lead.md`, `bn-unit-lead.md`; reuse `bn-hypothesis-investigator`.
4. **Breaker mode with executable counterexamples** (mechanism 3) — gated to the risky-domain effort matrix.
5. **Verifier-gated sampling** (mechanism 4) — opt-in, pre-gated, with an abort path that records null results.
6. Test-gen-first: not built separately; absorbed into 3 and the plan acceptance criteria.

## Mechanical constraints that bind everything

- **Envelopes are the only channel into a nested agent.** Nothing is inherited implicitly across a depth boundary, so push-by-routing beats pull everywhere — for fact cards and equally for counterexample bounces.
- **Mandatory spawns multiply silently.** Every unit-lead brings a mini-review and a harvester; sampling and re-dispatch multiply them. `max_children` accounting needs explicit language (three sampled attempts plus a verifier nearly exhaust a delivery-lead's budget), and discarded attempts' staged lessons are discarded with them.
- **Depth accounting is prompt-level, not runtime-enforced.** All budget discipline falls back to envelope text if the host runtime does not enforce allowlists (`/bn-doctor` Check 3 probes this); mechanisms that assume hard caps must state them in the contracts that hold without enforcement.

## Key evidence

Multi-agent failure base rates and design guidance: MAST taxonomy ([arXiv:2503.13657](https://arxiv.org/abs/2503.13657)); Cognition, "Don't Build Multi-Agents" and the follow-up carve-out (parallel intelligence, single-threaded writes); Anthropic's multi-agent research system (multi-agent ≈ 15× chat tokens; coding called out as a poor fit; two-level hierarchy). Sampling + verification: Large Language Monkeys ([arXiv:2407.21787](https://arxiv.org/abs/2407.21787)); CodeMonkeys ([arXiv:2501.14723](https://arxiv.org/abs/2501.14723)); AlphaCode 2 tech report; CodeT ([arXiv:2207.10397](https://arxiv.org/abs/2207.10397)). Counterexample loops: CEGIS-LLM repair (AAAI 2025, [paper](https://ojs.aaai.org/index.php/AAAI/article/view/32046)); TiCoder ([arXiv:2404.10100](https://arxiv.org/abs/2404.10100)). Adversarial roles: CriticGPT; Prover-Verifier Games ([arXiv:2407.13692](https://arxiv.org/abs/2407.13692)) — including the legibility tax; Kenton et al. on debate requiring information asymmetry ([arXiv:2407.04622](https://arxiv.org/pdf/2407.04622)). Executable gating in production: Meta TestGen-LLM / Assured LLMSE ([arXiv:2402.09171](https://arxiv.org/abs/2402.09171)). Test-generation failure modes: incorrect-assertion prevalence ([arXiv:2406.18181](https://arxiv.org/html/2406.18181v1)). Confabulation under verification pressure: Anthropic reward-hacking results ([post](https://www.anthropic.com/research/emergent-misalignment-reward-hacking)). Shared in-run state: blackboard MAS ([arXiv:2507.01701](https://arxiv.org/abs/2507.01701)); A-MEM ([arXiv:2502.12110](https://arxiv.org/html/2502.12110v1)).
