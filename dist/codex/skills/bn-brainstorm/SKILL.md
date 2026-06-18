---
name: bn-brainstorm
description: "Explore requirements and approaches through collaborative dialogue, then write a right-sized requirements document. Use when the user says \"let's brainstorm\", \"what should we build\", or \"help me think through X\", presents a vague or ambitious feature request, or seems unsure about scope or direction -- even without explicitly asking to brainstorm."
argument-hint: "[feature idea or problem to explore]"
---

# Brainstorm a Feature or Improvement

**Note: The current year is 2026.** Use this when dating requirements documents.

Brainstorming helps answer **WHAT** to build through collaborative dialogue. It precedes
`/bn-spec-stress`, which pressure-tests requirements, and `/bn-plan`, which answers **HOW**
to build them.

The durable output of this workflow is a **requirements document**. In other workflows this might be called a lightweight PRD or feature brief. Keep the workflow name `brainstorm`, but make the written artifact strong enough that planning does not need to invent product behavior, scope boundaries, or success criteria.

This skill does not implement code. It explores, clarifies, and documents decisions for later planning or execution. It is a **trunk-level dialogue** skill: a pure-dialogue brainstorm spawns nothing and opens no run ledger. Optional read-only delegated branches (research grounding in Phase 1.1 and Deep critique loops in Phase 2) open a run ledger lazily per branch and use `bn-research-lead` for artifact-backed grounding. When reached from `/bn-grow`, this skill runs as **grow intake**: it completes the requirements artifact step, returns the requirements document path or finalized summary to `/bn-grow`, and skips the standalone handoff menu.

Grow intake is more autonomous than standalone brainstorming. Ask the user only when the missing
answer changes product behavior and has no safe default. Otherwise write the requirements doc with
the assumption explicit in **Assumptions**, **Dependencies**, **Plan Inputs**, or **Resolve Before
Planning** as appropriate, and return blocker dispositions to `/bn-grow` so the grow trunk can run
its recovery ladder.

The requirements doc lands in `.banyan/brainstorms/` — a **protected artifact family** (AGENTS.md §5): no Banyan agent may delete or "clean up" anything under it. This skill creates and updates docs there; it never removes them.

**IMPORTANT: All file references in generated documents must use repo-relative paths (e.g., `src/models/user.rb`), never absolute paths. Absolute paths break portability across machines, worktrees, and teammates.**

## Core Principles

1. **Assess scope first** - Match the amount of ceremony to the size and ambiguity of the work.
2. **Be a thinking partner** - Suggest alternatives, challenge assumptions, and explore what-ifs instead of only extracting requirements.
3. **Resolve product decisions here** - User-facing behavior, scope boundaries, and success criteria belong in this workflow. Detailed implementation belongs in planning.
4. **Keep implementation out of the requirements doc by default** - Do not include libraries, schemas, endpoints, file layouts, or code-level design unless the brainstorm itself is inherently about a technical or architectural change.
5. **Right-size the artifact** - Simple work gets a compact requirements document or brief alignment. Larger work gets a fuller document. Do not add ceremony that does not help planning.
6. **Apply YAGNI to carrying cost, not coding effort** - Prefer the simplest approach that delivers meaningful value. Avoid speculative complexity and hypothetical future-proofing, but low-cost polish or delight is worth including when its ongoing cost is small and easy to maintain.

## Interaction Rules

These rules apply to every brainstorm, including the universal (non-software) flow routed to `references/universal-brainstorming.md`.

1. **Ask one question at a time** - One question per turn, even when sub-questions feel related. Stacking several questions in a single message produces diluted answers; pick the single most useful one and ask it.
2. **Prefer single-select multiple choice** - Use single-select when choosing one direction, one priority, or one next step.
3. **Use multi-select rarely and intentionally** - Use it only for compatible sets such as goals, constraints, non-goals, or success criteria that can all coexist. If prioritization matters, follow up by asking which selected item is primary.
4. **Default to `AskUserQuestion`** - It includes a free-text fallback ("Other"), so options scaffold the answer without confining it — well-chosen options surface dimensions the user may not have separated, and pick-plus-optional-note is lower activation energy than composing prose from scratch. This default holds for opening and elicitation questions too, not only narrowing. Never silently skip the question.
5. **Use an open-ended question only when the question is genuinely open** - Drop the blocking tool only when (a) the answer is inherently narrative ("walk me through how you got here"), (b) the question is diagnostic or introspective and presented options would unintentionally influence the user's answer (e.g., "what concerns you most?" — a 4-option menu would nudge them toward those axes rather than the ones actually on their mind), or (c) you cannot write 3-4 genuinely distinct, plausibly-correct options that cover the space without padding or strawmen. The test: if you'd be straining to fill the option slots, the question is open — ask it open-ended. Rule 1 still applies: still one question per turn.
6. **Open-ended questions earn their place only when they're specific enough to elicit a substantive answer** - Apply Rule 5 silently: just ask the question, do not narrate the form choice. The question itself must give the user something concrete to anchor on. Good: *"What's the most concrete thing someone's already done about this — paid for it, built a workaround, quit a tool over it?"* (this is one of Phase 1.2's rigor probes — it earns its open-endedness by naming what counts as an answer). Too thin: *"What's your take?"* (nothing to bite into; user defaults to a one-liner that wastes the open question). Avoid (a) narrating the form choice ("the most useful question I can ask here is..."), (b) framings that imply a short answer ("briefly", "in one sentence"), (c) yes/no traps, and (d) AI-slop warmth wrappers ("take it wherever feels relevant").
7. **Ground volatile external facts before you pose them** - Before you put a question, option, or premise to the user that turns on a fast-moving external fact — a third-party product's capabilities, an API surface or parameters, version-specific behavior, pricing, or a model's name/limits, and **especially the capabilities of other AI coding tools or competitor agents** — treat it as stale by default and confirm it against a source you fetch this session (one `WebSearch`/`WebFetch` is usually enough; the opt-in `bn-research-lead` branch in Phase 1.1 is the heavier escalation when one search is not enough). Your confidence is not evidence; reasoning over a premise does not verify it. State such a fact as settled only if you can cite the source you just fetched; otherwise verify it now or present it explicitly as unverified. Grounding a premise first never licenses inventing one. If grounding contradicts the premise, say so and re-pose the options. Stable facts — language syntax, settled CS, math — and incidental mentions are exempt; this fires only when the fact is **load-bearing** for a product decision.
8. **Delegate solo investigation; keep the dialogue inline** - The collaborative ideation with the user — the back-and-forth, the alternatives, the what-ifs — is this skill's whole job and stays at the trunk. But when you need facts or options you do not have and the answer means an open-ended search, multi-file reading, or a generate-and-weigh research loop, dispatch a disposable one-off subagent (an `Explore` for ad-hoc repo search, the opt-in `bn-research-lead` branch in Phase 1.1 for grounded research) and fold only its short return into the dialogue — never run that loop in your own context. Cheap bounded orientation (one quick lookup, a single named file) stays inline.

## Output Guidance

- **Keep outputs concise** - Prefer short sections, brief bullets, and only enough detail to support the next decision.
- **Use repo-relative paths** - When referencing files, use paths relative to the repo root (e.g., `src/models/user.rb`), never absolute paths. Absolute paths make documents non-portable across machines and teammates.

## Feature Description

<feature_description> #$ARGUMENTS </feature_description>

**If the feature description above is empty, ask the user:** "What would you like to explore? Please describe the feature, problem, or improvement you're thinking about."

Do not proceed until you have a feature description from the user.

## Execution Flow

### Phase 0: Resume, Assess, and Route

#### 0.0 Output Format

The requirements doc is always **markdown** (`.md`). Read `references/markdown-rendering.md` for format principles; it pairs with `references/brainstorm-sections.md`, which describes what the brainstorm contains.

#### 0.1 Resume Existing Work When Appropriate

If the user references an existing brainstorm topic or document, or there is an obvious recent matching `*-requirements.md` file in `.banyan/brainstorms/`:
- Read the document
- Confirm with the user before resuming: "Found an existing requirements doc for [topic]. Should I continue from this, or start fresh?"
- If resuming, summarize the current state briefly, continue from its existing decisions and outstanding questions, and update the existing document instead of creating a duplicate

#### 0.1b Classify Task Domain

Before proceeding to Phase 0.2, classify whether this is a software task. The key question is: **does the task involve building, modifying, or architecting software?** -- not whether the task *mentions* software topics.

**Software** (continue to Phase 0.2) -- the task references code, repositories, APIs, databases, or asks to build/modify/debug/deploy software.

**Non-software brainstorming** (route to universal brainstorming) -- BOTH conditions must be true:
- None of the software signals above are present
- The task describes something the user wants to explore, decide, or think through in a non-software domain

**Neither** (respond directly, skip all brainstorming phases) -- the input is a quick-help request, error message, factual question, or single-step task that doesn't need a brainstorm.

**If non-software brainstorming is detected:** Read `references/universal-brainstorming.md` and use those facilitation principles. Skip Phases 0.2–4 below — the **Core Principles and Interaction Rules above still apply unchanged**, including one-question-per-turn and the default to `AskUserQuestion`.

#### 0.2 Assess Whether Brainstorming Is Needed

**Clear requirements indicators:**
- Specific acceptance criteria provided
- Referenced existing patterns to follow
- Described exact expected behavior
- Constrained, well-defined scope

**If requirements are already clear:**
Keep the interaction brief. Confirm understanding and present concise next-step options rather than forcing a long brainstorm. Only write a short requirements document when a durable handoff to planning or later review would be valuable. Skip Phase 1.1 and 1.2 entirely — go straight to Phase 1.3 or Phase 2.5 in announce-mode (synthesis emitted for visibility, no blocking confirmation), then to Phase 3.

#### 0.3 Assess Scope

Use the feature description plus a light repo scan to classify the work:
- **Lightweight** - small, well-bounded, low ambiguity
- **Standard** - normal feature or bounded refactor with some decisions to make
- **Deep** - cross-cutting, strategic, or highly ambiguous

If the scope is unclear, ask one targeted question to disambiguate and then proceed.

**Deep sub-mode: feature vs product.** For Deep scope, also classify whether the brainstorm must establish product shape or inherit it:

- **Deep — feature** (default): existing product shape anchors decisions. Primary actors, core outcome, positioning, and primary flows are already established in the product or repo. The brainstorm extends or refines within that shape.
- **Deep — product**: the brainstorm must establish product shape rather than inherit it. Primary actors, core outcome, positioning against adjacent products, or primary end-to-end flows are materially unresolved. Existing code lowers the odds of product-tier but does not by itself rule it out — a half-built tool with ambiguous shape is still product-tier.

Product-tier triggers additional Phase 1.2 questions and additional sections in the requirements document. Feature-tier uses the current Deep behavior unchanged.

#### 0.4 Multiple Ideas or Proposals

When the user asks to explore multiple ideas, proposals, or directions, classify the set before drilling into any one item.

- **Alternatives for one goal** — Treat them as Phase 2 approaches. Keep the conversation anchored on the shared problem, compare value, risk, carrying cost, fit with constraints, and available evidence, then converge on one recommended direction or a small intentional bundle. Rejected or deferred options become Scope Boundaries when material.
- **Independent candidates** — Run a portfolio brainstorm. Keep each candidate separate, compare them on the same axes, and ask the user whether they want to select one, rank them, sequence them, or carry several forward. Do not merge unrelated candidates into one requirements document unless the user intentionally chooses a bundle.
- **Several surviving proposals** — When the output is a decision aid rather than a plan-ready feature, write one comparison brief using the Phase 3 brainstorm metadata and path rules. Write separate requirements documents only for proposals the user wants to take to planning. A single requirements document for a bundle must distinguish shared requirements from per-proposal requirements so `/bn-plan` can split tracks cleanly.
- **Too many candidates** — Ask the user to pick a batch or top 3-5. Shallow coverage of a long list produces weaker decisions than a bounded comparison.

If the relation between candidates or the desired output is unclear, ask one triage question using the Interaction Rules before Phase 1.1. Multiple ideas can still be Lightweight, Standard, or Deep; the count alone does not determine scope.

### Phase 1: Understand the Idea

#### 1.1 Existing Context Scan

Scan the repo before substantive brainstorming. Match depth to scope:

**Lightweight** — Search for the topic, check if something similar already exists, and move on. This is cheap bounded orientation; do it inline.

**Standard and Deep** — The orientation scan fans out across many files, so dispatch it as a disposable one-off `Explore` subagent rather than reading all of it into the dialogue context yourself. Give it both passes below and have it return a short grounding note (paths plus one-line findings); you read the note and fold it into the dialogue.

*Constraint Check* — project instruction files (`AGENTS.md`, and `CLAUDE.md` only if retained as compatibility context) for workflow, product, or scope constraints that affect the brainstorm; `STRATEGY.md` if it exists — the product's target problem, approach, persona, and active tracks are direct input to what this brainstorm should deliver and should shape scope, success criteria, and which approaches are aligned vs out-of-scope; and `CONCEPTS.md` at repo root if it exists — the project's authoritative vocabulary. Use these names in dialogue, approaches, and the requirements doc; map user-offered synonyms back.

*Topic Scan* — relevant terms, the most relevant existing artifact if one exists (brainstorm, plan, spec, skill, feature doc), and adjacent examples covering similar behavior.

Fold the grounding note's findings into the dialogue; if nothing obvious appears, say so and continue. Two rules govern technical depth, and these stay inline because they are cheap, targeted reads rather than an open-ended scan:

1. **Verify before claiming** — When the brainstorm touches checkable infrastructure (database tables, routes, config files, dependencies, model definitions), read the relevant source files to confirm what actually exists. Any claim that something is absent — a missing table, an endpoint that doesn't exist, a dependency not in the Gemfile, a config option with no current support — must be verified against the codebase first; if not verified, label it as an unverified assumption. This applies to every brainstorm regardless of topic.

2. **Defer design decisions to planning** — Implementation details like schemas, migration strategies, endpoint structure, or deployment topology belong in planning, not here — unless the brainstorm is itself about a technical or architectural decision, in which case those details are the subject of the brainstorm and should be explored.

**Research grounding and external context** (opt-in, Standard and Deep only) — never auto-dispatch. When the user asks for deeper grounding, or the dialogue hits a question a short scan cannot answer (how does this codebase actually do X? has the team solved this before? what's the industry standard?), offer to dispatch `bn-research-lead`.

Grounding may include external web research when outside context could change approach selection, scope boundaries, or success criteria: existing best practices, state-of-the-art (SotA) prior art, open-web examples, competitor or adjacent-product signals, cross-domain analogies, and current documentation. Do not restrict `bn-research-lead` to repo-local context unless the user asks for local-only grounding; the lead's effort scaling decides whether to use `bn-best-practices-researcher`, `bn-framework-docs-researcher`, or `bn-web-researcher`. If the user accepts deeper research, that acceptance covers these read-only external searches unless the user restricts sources.

If accepted:

1. Use the caller's run ledger if this brainstorm is running as `/bn-grow` intake. Otherwise open the run ledger **now** (lazily — only this branch needs one):
   `node ~/.codex/skills/banyan/skills/bn-conventions/scripts/new-run.mjs brainstorm-<slug> --root <repo-root> --objective "<ground the brainstorm question>" --plan-ref "none -- brainstorm grounding" --unit "research|bn-research-lead|in-progress|.banyan/runs/<run-id>/briefs/brainstorm-grounding.md" --actor trunk`
   Parse the JSON output and use `run_id`, `run_dir`, `ledger_path`, and `facts`.
2. Spawn `bn-research-lead` **foreground** with a standard envelope: `objective` = the grounding question, including any external best-practice, SotA, or prior-art dimension that matters; `artifact_path` = `.banyan/runs/<run-id>/briefs/brainstorm-grounding.md`; boundaries read-only; `tool_guidance` permits read-only repo research plus WebSearch/WebFetch/Context7 through the research lead's external researchers when external grounding helps; budget `{ max_children: 6, depth_remaining: 3 }`; `effort_class` by question breadth.
3. READ the brief file (not the lead's prose) and fold its findings into the dialogue.
4. Note the brief's path in the requirements doc so `/bn-plan` can reuse it instead of re-researching.

#### 1.2 Product Pressure Test

Before generating approaches, scan the user's opening for rigor gaps. Match depth to scope.

This is agent-internal analysis, not a user-facing checklist. Read the opening, note which gaps actually exist, and raise only those as questions during Phase 1.3 — folded into the normal flow of dialogue, not fired as a pre-flight gauntlet. A fuzzy opening may earn three or four probes; a concrete, well-framed one may earn zero because no scope-appropriate gaps were found.

**Lightweight:**
- Is this solving the real user problem?
- Are we duplicating something that already covers this?
- Is there a clearly better framing with near-zero extra cost?

**Standard — scan for these gaps:**

- **Evidence gap.** The opening asserts want or need, but doesn't point to anything the would-be user has already done — time spent, money paid, workarounds built — that would make the want observable. When present, ask for the most concrete thing someone has already done about this.

- **Specificity gap.** The opening describes the beneficiary at a level of abstraction where the agent couldn't design without silently inventing who they are and what changes for them. When present, ask the user to name a specific person or narrow segment, and what changes for that person when this ships.

- **Counterfactual gap.** The opening doesn't make visible what users do today when this problem arises, nor what changes if nothing ships. When present, ask what the current workaround is, even if it's messy — and what it costs them.

- **Attachment gap.** The opening treats a particular solution shape as the thing being built, rather than the value that shape is supposed to deliver, and hasn't been examined against smaller forms that might deliver the same value. When present, ask what the smallest version that still delivers real value would look like.

Plus these synthesis questions — not gap lenses, product-judgment the agent weighs in its own reasoning:
- Is there a nearby framing that creates more user value without more carrying cost? If so, what complexity does it add?
- Given the current project state, user goal, and constraints, what is the single highest-leverage move right now: the request as framed, a reframing, one adjacent addition, a simplification, or doing nothing?

Favor moves that compound value, reduce future carrying cost, or make the product meaningfully more useful or compelling. Use the result to sharpen the conversation, not to bulldoze the user's intent.

**Deep** — Standard lenses and synthesis questions plus:
- Is this a local patch, or does it move the broader system toward where it wants to be?

**Deep — product** — Deep plus:

- **Durability gap.** The opening's value proposition rests on a current state of the world that may shift in predictable ways within the horizon the user cares about. When present, ask how the idea fares under the most plausible near-term shifts — and push past rising-tide answers every competitor could make.

- What adjacent product could we accidentally build instead, and why is that the wrong one?
- What would have to be true in the world for this to fail?

These questions force an explicit product thesis and feed the Scope Boundaries subsections
("Deferred for later" and "Outside this product's identity"), Dependencies, and Assumptions
in the requirements document.

#### 1.3 Collaborative Dialogue

Follow the Interaction Rules above. Use `AskUserQuestion` per those rules.

**Guidelines:**
- Ask what the user is already thinking before offering your own ideas. This surfaces hidden context and prevents fixation on AI-generated framings.
- Start broad (problem, users, value) then narrow (constraints, exclusions, edge cases)
- **Rigor probes fire before Phase 2 and are open-ended, not menus.** Narrowing is legitimate, but Phase 1 cannot end with un-probed rigor gaps. Each scope-appropriate gap from Phase 1.2 fires as a **separate** direct open-ended probe — one probe satisfies one gap, not multiple. Standard brainstorms scan four gap lenses (evidence, specificity, counterfactual, attachment); Deep-product adds durability (five total), but only the gaps actually present in the opening must be probed. Surface those probes progressively across the conversation — interleaving with narrowing moves is fine, as long as every scope-appropriate gap that was found in Phase 1.2 has been probed open-ended before Phase 2. Rigor probes map to Interaction Rule 5(b): a 4-option menu signals which kinds of evidence count and lets the user pick rather than produce. Open-ended questions force them to produce real observation or surface their uncertainty. Examples (one per gap): *evidence — "What's the most concrete thing someone's already done about this — paid, built a workaround, quit a tool over it?"* / *specificity — "Can you name a team you've actually watched hit this, or are you reasoning?"* / *counterfactual — "What do teams do today when this breaks — who reconciles?"* / *attachment — "Before we move to shapes or approaches — what's the smallest version that would still prove the bet right, and what's excluded?"* — **attachment is the final rigor probe before Phase 2 when the attachment gap is present. Fire it regardless of whether a specific shape has emerged through narrowing; its job is to pressure-test the user's implicit framing of the product before Phase 2 inherits it** / *durability — "Under the most plausible near-term shifts, how does this bet hold?"* If the answer reveals genuine uncertainty, record it as an explicit assumption in the requirements document rather than skipping the probe.
- **Deep tiers probe breadth of surface, not just premise.** The rigor gaps above test whether the *premise* is sound; for Deep-product and Deep-feature they are joined by the **product-surface coverage lens** in `references/coverage-map.md`, which tests whether the system's surface — what it produces, how users touch it, what it reasons about, how hard it vets each unit of output — has actually been explored. Apply it with the same discipline: scan internally, raise only load-bearing thin surfaces as open-ended probes folded into dialogue, surfaced progressively. A richly-specified opening earns zero. This is the inline complement to the Phase 2.4 convergence gate, which is the unbiased backstop before synthesis.
- **Deep tiers also expand the idea, not only specify it.** Being a thinking partner (Core Principle 2) means actively surfacing the non-obvious — feature proposals, enhancements, and reframes the user likely would not have reached on their own — not just answering what is asked. The **expansion lens** in `references/coverage-map.md` governs this: offer high-leverage, low-carrying-cost additions as opt-in challengers (per Core Principle 6 and the Phase 2 higher-upside alternative), never as scope the user must accept. Declining is a normal, fine outcome — the point is that the user *sees* the option rather than never learning it existed. Phase 2.4's fresh-context pass is the backstop that catches high-leverage ideas the dialogue missed.
- Clarify the problem frame, validate assumptions, and ask about success criteria
- Make requirements concrete enough that planning will not need to invent behavior
- Surface dependencies or prerequisites only when they materially affect scope
- Resolve product decisions here; leave technical implementation choices for planning
- Bring ideas, alternatives, and challenges instead of only interviewing

**Before exiting Phase 1.3: integration check.** Mentally combine what the user has said so far and surface any non-obvious consequences the dialogue hasn't probed. If user-stated X plus user-stated Y plus your-default-Z produces a downstream effect the user is unlikely to have tracked through one-question-at-a-time dialogue ("if mute lives on the rule AND we don't warn on delete, then rule-delete silently loses pause state"), probe it now while you're still in dialogue. One probe per genuine combination effect, asked open-ended, same discipline as rigor probes. Phase 2.5's call-outs are a safety net for residuals (silent agent inferences, pre-loaded contexts with no dialogue) — NOT a punt list for consequences you could have asked about now.

**Exit condition:** Continue until the idea is clear AND no integration-check questions are pending, OR the user explicitly wants to proceed. **For Deep tiers, "clear" also requires that no load-bearing product surface remains untouched — the Phase 2.4 convergence gate enforces this.** The "user explicitly wants to proceed" escape still applies, but when load-bearing surfaces are still untouched it must be a *named, explicit deferral* of those surfaces (the user choosing to leave them for planning or later), never a silent convergence past them.

### Phase 2: Explore Approaches

If multiple plausible directions remain, propose **2-3 concrete approaches** based on research and conversation. Otherwise state the recommended direction directly.

Use at least one non-obvious angle — inversion (what if we did the opposite?), constraint removal (what if X weren't a limitation?), or analogy from how another domain solves this. The first approaches that come to mind are usually variations on the same axis.

Present approaches first, then evaluate. Let the user see all options before hearing which one is recommended — leading with a recommendation before the user has seen alternatives anchors the conversation prematurely.

When useful, include one deliberately higher-upside alternative:
- Identify what adjacent addition or reframing would most increase usefulness, compounding value, or durability without disproportionate carrying cost. Present it as a challenger option alongside the baseline, not as the default. Omit it when the work is already obviously over-scoped or the baseline request is clearly the right move.

At product tier, alternatives should differ on *what* is built (product shape, actor set, positioning), not *how* it is built. Implementation-variant alternatives belong at feature tier.

For each approach, provide:
- Brief description (2-3 sentences)
- Pros and cons
- Key risks or unknowns
- When it's best suited

**Approach granularity: mechanism / product shape, not architecture.** Approach descriptions name mechanism-level distinctions ("pause as a rule property" vs "pause as an event filter" vs "pause as a separate entity") and product-relevant trade-offs (plan-tier coupling, complexity surface, migration difficulty). They do NOT name implementation specifics — column names, table names, file paths, service classes, JSON shapes, exact method names. Those are `/bn-plan`'s job. Bringing architecture forward at brainstorm time forces the user to make architectural decisions on the brainstorm's intentionally-shallow research, and the synthesis at Phase 2.5 then has to filter out the leak.

**Deep critique loop (optional).** For Deep scope, or when the user asks for devil's advocate, steelman, strawman, or proposal-stress analysis, you may run a bounded fresh-context critique pass before the final recommendation. This is an analytic loop, not role-play: the delegated lead critiques proposals from fresh context and writes a brief; it does not become a persona in a staged debate.

Use `bn-research-lead` as the delegated lead. If grounding has not run and both grounding and critique are needed, combine them into one research objective and one artifact. If a separate critique pass is warranted, open a separate lazy run for that branch so the research lead's fixed `progress/bn-research-lead.md` remains single-writer. In `/bn-grow` intake, prefer one combined research/critique pass inside the caller's run ledger; if the pass surfaces a no-safe-default product decision, return it through the grow intake blocker contract instead of spinning unbounded loops.

The critique objective should name the candidate approaches and ask for:
- **Steelman** — the strongest credible case for each serious proposal.
- **Devil's advocate** — concrete failure modes, missing evidence, adoption friction, and cases where the proposal solves the wrong problem.
- **Strawman check** — the oversimplified or superficially attractive version that should not be built because it misses the actual value.
- **External grounding** — best practices, state-of-the-art prior art, open-web examples, and cross-domain analogies when those could materially change the recommendation.

READ the critique brief file, not the lead's final-message prose, and fold it into the approach comparison, recommendation, call-outs, and requirements doc. One critique pass is the default; a second pass needs a material unresolved uncertainty and a clear reason the next pass will answer it. The critique pass informs the recommendation, but the trunk remains responsible for presenting choices and the user remains the authority on product direction.

After presenting all approaches, state your recommendation and explain why. Prefer simpler solutions when added complexity creates real carrying cost, but do not reject low-cost, high-value polish just because it is not strictly necessary.

If one approach is clearly best and alternatives are not meaningful, skip the menu and state the recommendation directly.

If relevant, call out whether the choice is:
- Reuse an existing pattern
- Extend an existing capability
- Build something net new

### Phase 2.4: Convergence Gate (Deep tiers only)

**Skip this phase entirely for Lightweight and Standard tiers, and on the Phase 0.1b non-software route.** For Deep-product and Deep-feature, run it once after approaches are chosen and before the Phase 2.5 synthesis — the convergence boundary, where the dialogue is most tempted to declare the product "clear" while its surface is still thin or its idea space under-imagined.

The trunk has been in the dialogue and is biased toward closing — it has rapport, momentum, and a coherent paragraph in hand. This gate brings a **fresh-context reader** to judge the brainstorm from outside that pull, the same reason Banyan uses fresh-context checkers elsewhere (`bn-plan-checker`, the spec-stress lenses). It carries two lenses: **breadth** (is what's in scope specified enough?) and **expansion** (what high-leverage, non-obvious additions has nobody proposed?). It is one delegated pass, not a persona debate.

1. **Open a run lazily** if this branch has not already. Reuse the grounding branch's run if one is open (add a coverage unit to its ledger); in `/bn-grow` intake reuse the caller's ledger. Otherwise:
   `node ~/.codex/skills/banyan/skills/bn-conventions/scripts/new-run.mjs brainstorm-<slug> --root <repo-root> --objective "<the brainstorm question>" --plan-ref "none -- brainstorm convergence gate" --unit "coverage|bn-brainstorm-coverage-reviewer|in-progress|.banyan/runs/<run-id>/briefs/brainstorm-coverage.md" --actor trunk`
   Parse the JSON and use `run_id`, `run_dir`, `facts`.
2. **Write the running-shape note** to `.banyan/runs/<run-id>/briefs/brainstorm-coverage-input.md`: the product idea as it now stands, plus a terse record of what each surface area has and has not settled in dialogue. The internal three-bucket draft you compose for Phase 2.5 (Stated / Inferred / Out of scope) is the natural source — write it here as the critic's input rather than holding it only in your head.
3. **Spawn `bn-brainstorm-coverage-reviewer` foreground** with a standard envelope: state the tier (`deep-product` or `deep-feature`); `input` = the running-shape note path; `doctrine` includes `~/.codex/skills/banyan/skills/bn-brainstorm/references/coverage-map.md` and any grounding/critique brief; `artifact_path` = `.banyan/runs/<run-id>/briefs/brainstorm-coverage.md`; boundaries read-only; budget `{ max_children: 0, depth_remaining: 0 }`.
4. **READ the artifact** (the file, not the final-message prose). It has two parts — handle them differently:
   - **Thin surfaces (breadth — blocking).** For each load-bearing thin surface, fold its probe back into dialogue and keep exploring, one open-ended probe at a time, same discipline as the rigor probes. `none` here means the brainstorm is genuinely broad enough.
   - **Expansion opportunities (generative — opt-in).** Present these to the user as challengers — "here are a few things worth considering that we haven't" — each with its rough carrying cost named honestly. The user accepts (fold into scope) or declines. **Declining does not block convergence**; the value is that the user saw the option. Do not pad this — a sharp idea or two beats a list, and `none` is fine.
5. **Honor the gate at convergence.** Do not proceed to Phase 2.5 while load-bearing thin surfaces remain. If the user signals "move on" / "just write it" while thin surfaces remain, do not comply silently: name the untouched surfaces in one breath and ask the user to choose explicitly — explore now, defer to planning, or defer to later — using the blocking question tool (`AskUserQuestion`). An explicit deferral is a legitimate exit (record the deferred surfaces under Outstanding Questions / Scope Boundaries in the doc); silent convergence is not. Expansion opportunities never gate — they are offered and the user's "no" is final.

Fire the gate once. Re-run it only if the user did substantial new exploration after the first pass and a re-check is genuinely warranted — not on every revision.

### Phase 2.5: Synthesis Summary

**STOP. Before composing the synthesis, read `references/synthesis-summary.md`.** The two-stage shape (internal three-bucket draft → chat-time scoping synthesis), the Path A / Path B gate, the four scoping synthesis sections with their keep tests, the tier-aware bullet budget with re-cut rule, anti-pattern guidance, soft-cut behavior, self-redirect support, and internal-draft routing into doc body sections all live there. Composing a synthesis without these rules loaded reliably produces malformed output — pasting the full internal three-bucket draft verbatim into chat, implementation-detail leakage into the scoping synthesis, the proposal-pitch anti-pattern. **Each scoping synthesis bullet must pass the affirmability test (can the user evaluate this without reading code?) AND the detail test (1–2 lines max, conversational not documentary); over-share and over-detail are the failure modes to avoid.** This is not optional supplementary reading; it is the source of truth for how the phase behaves.

Surface a scoping synthesis to the user before Phase 3 writes the requirements doc — the user's last opportunity to correct scope before the artifact lands. The scoping synthesis is shaped like what two product collaborators would confirm before writing a PRD, not like a comprehensive audit or a one-line preview.

Fires for **all tiers** including Lightweight. Skip Phase 2.5 entirely on the Phase 0.1b non-software (universal-brainstorming) route.

**Path A vs Path B:** the scoping synthesis shape depends on TWO signals — whether any blocking question fired AND what tier Phase 0.3 classified the scope as.

- **Path A — no blocking questions fired AND tier is Lightweight**: announce-mode. Emit "What we're building" prose only (1–3 sentences), then proceed to Phase 3 doc-write in the same turn. No other sections, no confirmation question. Do NOT end the turn waiting for acknowledgment. The user can revise after the doc lands if the shape is wrong — Lightweight Path A docs are short, post-hoc revision is cheap.
- **Path B — at least one blocking question fired, OR tier is Standard / Deep-feature / Deep-product**: full tier-aware scoping synthesis with confirmation gate. Two scenarios fire Path B: (a) the user invested answer-time during dialogue, or (b) the user pre-loaded substantive scope content (Phase 0.2 fast-path with a richly-specified opening prompt). Either way, the substance earns a real checkpoint. Confirmation is unconditional even when zero call-outs survive the keep test.

**Why the tier guard on Path A**: Phase 0.2's fast path serves two very different cases — a tight one-liner that needs no dialogue ("fix the typo on line 47") and a richly pre-loaded brainstorm context that ALSO needs no dialogue because the user pre-stated everything. Without the tier guard, both route to Path A and the pre-loaded case gets a 1-sentence checkpoint for what may be 20+ items worth of scope. Tier-classifying Phase 0.3 distinguishes the two — pre-loaded substance makes the tier Standard or Deep, which then routes to Path B.

### Phase 3: Capture the Requirements

Write or update a requirements document only when the conversation produced durable decisions worth preserving — see `references/brainstorm-sections.md` "Decide whether a doc is warranted at all" for the criteria and the bug-fix stress test. Skip document creation when the user only needs brief alignment and the decisions can flow downstream (`/bn-plan`, commit message, `.banyan/solutions/`) without a brainstorm artifact in the middle.

When a doc is warranted, compose it using:

- `references/brainstorm-sections.md` — section contract (outcomes, hard floor, include-when-material catalog, agency rules, ID conventions).
- `references/markdown-rendering.md` — how the sections are presented on the page.

**Write tight.** A section being material is not license to pad it. Hold every kept section to the prose-economy discipline in `references/brainstorm-sections.md`: one idea per sentence, a requirement is intent plus at most one qualifier, defer forks to Outstanding Questions rather than specifying both arms, resolve superseded text in place rather than stacking strata. Before declaring the doc written, run the named test there — could a reader find a contradiction in each section in one pass?

Write to `.banyan/brainstorms/YYYY-MM-DD-<topic>-requirements.md`. Confirm with the absolute path so the reference is clickable. If a grounding or critique brief was produced, reference its path in the doc.

#### Vocabulary Capture — after the requirements doc (only if CONCEPTS.md already exists)

**Skip this step entirely if `CONCEPTS.md` does not exist at repo root** — this skill does not create it.

Run this **after** the approaches, the scope synthesis, and the requirements doc — that is where the canonical term often gets chosen or corrected, so capturing during early dialogue (before this point) would miss the final resolved name. If it exists, scan the full dialogue and the requirements doc for **resolved** domain terms — terms where the conversation actively pinned down a precise local meaning, not terms merely mentioned in passing. **Resolved means the definition is settled, not still under discussion.** Provisional terms that may still revise stay in the conversation only.

For each resolved term: if missing, add it; if present but new precision surfaced, refine it; if already consistent, no action.

**Domain entities, named processes, and status concepts with project-specific meaning only.** Not file paths, class names, function signatures, or implementation decisions — `CONCEPTS.md` is a glossary, not a spec or catch-all.

Follow the format set by existing entries. Apply edits silently. (If Phase 3 skipped the doc, still run this against the resolved dialogue.)

### Phase 4: Handoff

Present next-step options and execute the user's selection. Read `references/handoff.md` for the option logic, dispatch instructions, grow-intake return contract, and closing summary format.
