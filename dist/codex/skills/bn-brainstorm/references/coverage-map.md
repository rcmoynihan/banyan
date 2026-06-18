# Product-Surface Coverage & Expansion Lenses

This file carries the two lenses a Deep brainstorm applies before it converges. Phase 1.2's rigor
gaps interrogate whether the **premise** is sound (is this worth building, for whom, against what
alternative). These two go further:

- **Breadth (coverage)** — has the **system's surface** actually been explored: what it produces,
  how people touch it, what it reasons about, how hard it works per unit of output? A Deep
  brainstorm can have a rock-solid premise and still converge on a doc that never said what the
  product *is* in enough detail to plan. Coverage catches that.
- **Expansion (generative)** — has anyone proposed the **non-obvious additions**? A brainstorm can
  be fully specified within the frame the user walked in with and still miss the high-leverage
  feature, enhancement, or reframe nobody thought to raise. Expansion catches *that* — the failure
  of under-imagination, not under-specification.

Both lenses load in two places: as complements to the rigor probes during Phase 1.3, and — the
load-bearing use — through the fresh-context `bn-brainstorm-coverage-reviewer` at the Phase 2.4
convergence gate, which reads the running shape from outside the dialogue's convergence pull. The
two lenses behave differently at the gate: **thin surfaces block** silent convergence (explore or
explicitly defer); **expansion opportunities are opt-in** challengers the user is free to decline.

---

## Breadth (coverage) lens

## How to apply it (same discipline as the rigor gaps)

This is **agent-internal analysis, not a user-facing checklist and not a scored rubric.** Walk the
catalog, judge each surface, and raise only the load-bearing thin ones — folded into dialogue, not
fired as a gauntlet. There is no count to hit and no percentage to clear. A tight, richly-explored
opening can clear the whole catalog with zero probes; a one-paragraph product idea will light up
most of it.

Judge each surface as one of three states:

- **explored** — the dialogue (or the opening prompt) settled it concretely enough that planning
  would not have to invent it. Leave it alone.
- **mentioned-only** — named but not pinned down. A word exists ("it has a feed", "users get a
  mock") but the actual shape behind the word is unresolved. Raise it **if load-bearing**.
- **untouched** — never addressed at all. Raise it **if load-bearing**.

**Load-bearing** is the filter that keeps this from becoming interrogation: a surface is
load-bearing when leaving it thin would force planning to invent product behavior, or would let two
reasonable builders ship materially different products from the same doc. A surface that genuinely
does not apply to this product is not a gap — drop it silently, don't probe to prove a negative.

Each raised surface becomes **one open-ended probe** (Interaction Rule 5/6 shape — name what counts
as an answer, don't offer a menu that pre-shapes it). One probe per surface, surfaced
progressively, interleaved with everything else — never a stacked list.

## The catalog (Deep — product)

A product-tier brainstorm establishes product shape rather than inheriting it, so the full surface
is in play:

- **Output / deliverable.** What *exactly* is the artifact the system hands the user, in full? Not
  the category ("a mock", "a brief", "an idea") — the concrete anatomy of one complete unit of
  output, including what's in it and what's deliberately not.
- **Interaction & UX surfaces.** Where and how does a person touch this — the surfaces, channels,
  and control points (not pixels or visual taste; that's the design lens's job downstream). How
  they steer it, receive from it, and act on what it gives them.
- **Internal decomposition / reasoning.** What does the system actually *do* between input and
  output — the stages of the machine, what it reasons about at each, whether there are distinct
  sub-steps or sub-agents. The *shape* of the machine, not its implementation (schemas, libraries,
  and file layout stay bn-plan's job).
- **Due-diligence / rigor depth per unit of output.** How much work goes into each item before it
  reaches the user — how thoroughly it's vetted, scored, researched, or filtered. This is the knob
  that usually separates "precision tool" from "slop firehose," so it's almost always load-bearing
  for a precision product.
- **Market / prior-art / competitive grounding.** What else already does this, where the product
  sits against it, and what's genuinely differentiated versus table stakes. Often pairs with the
  durability rigor gap but is distinct: durability asks "does the bet survive the world shifting,"
  this asks "is the bet already occupied."
- **Data / sources / inputs.** Where the raw material comes from, at what cost, under what access
  limits or terms, and how that constrains the rest of the system.
- **Lifecycle & state over time.** What persists between runs, how things recur, accumulate,
  dedupe, expire, or evolve — the product's behavior across time, not just one pass.
- **Monetization / tiers / segments.** Only when the product carries a business model: who pays,
  for what, how tiers gate value, and how that interacts with cost. Drop entirely for a tool with
  no commercial dimension.
- **Failure / degraded / empty states.** First run with nothing learned yet, nothing-found,
  low-confidence, partial, or error paths. What the product does when it *can't* do its happy-path
  job is part of what the product is.

## Tier scaling (Deep — feature)

A feature-tier brainstorm inherits product shape — actors, positioning, and primary flows are
already established — so most surfaces are already settled outside this brainstorm and are **not**
load-bearing here. Apply only the subset the feature genuinely puts in play, typically:

- **Output / deliverable** — what this feature specifically produces or changes.
- **Interaction & UX surfaces** — the new or changed touch-points.
- **Internal decomposition** — only if the feature introduces non-trivial new machine behavior.
- **Failure / degraded / empty states** — the new states this feature creates.

Market grounding, monetization, data-sourcing, and product-wide lifecycle are inherited from the
product and only re-open if the feature materially disturbs them.

Standard and Lightweight tiers do not use this lens at all — their surface is small enough that the
Phase 1.2 rigor gaps and the Phase 2.5 synthesis already cover it.

---

## Expansion (generative) lens

Coverage asks "is what we have specified?" Expansion asks "what *should* be here that nobody
raised?" The user walked in with a frame — a problem and a rough shape — and a brainstorm that only
fills in that frame inherits all of its blind spots. The point of a thinking partner is to see past
the frame: the high-leverage feature the user didn't know to want, the enhancement that compounds
the core value, the reframe that makes the whole thing more useful, durable, or compelling.

This is a generative move, so apply it with judgment and restraint, not as a quota:

- **Aim outside the frame, not at its edges.** A good expansion is something the user plausibly
  *would not have reached on their own* — an adjacent capability, a different framing of the core
  job, a way the pieces already in scope could combine into something more. Restating an obvious
  next feature is not expansion; it's filler.
- **Lead with leverage, gate on carrying cost.** Favor additions that compound the core value,
  reduce future carrying cost, or materially raise usefulness — and weigh each against Core
  Principle 6 (YAGNI on carrying cost). Name the rough cost honestly alongside the upside. A
  low-cost, high-delight addition clears easily; a heavy speculative one needs a real reason.
- **Offer, never impose.** Every expansion is a **challenger the user is free to decline.** Present
  it as "worth considering," surface the trade-off, and let the user's "no" be final. Declining is
  a normal, healthy outcome — the value was delivered the moment the user *saw* the option. This
  lens never blocks convergence.
- **A sharp one or two beats a list.** Two genuinely non-obvious, high-leverage proposals are worth
  more than six edge-of-frame ones. If nothing rises to that bar, surfacing nothing is correct.

The same fresh-context advantage that makes the convergence-gate reader good at coverage makes it
good at expansion: it is not anchored on the user's framing, so it can see what the framing excluded.

## What these lenses are NOT

- **Not premise re-litigation.** Whether the idea is worth building, for whom, against what
  alternative — that's Phase 1.2's rigor gaps. Both lenses assume the premise.
- **Not doc pressure-testing.** Finding contradictions, hidden assumptions, and acceptance gaps in
  a *finished* requirements doc is `/bn-spec-stress`'s job, downstream. These lenses run *before*
  the doc exists, on the live dialogue, to stop a thin or under-imagined doc from being written in
  the first place.
- **Not implementation design.** Schemas, endpoints, libraries, file layout, exact data shapes —
  all bn-plan's. "Internal decomposition" means the shape of the machine at product altitude, never
  its code.
- **Not a completeness score.** There is no threshold, no N-of-M, no percentage. Coverage outputs a
  short list of load-bearing thin surfaces, or nothing; expansion outputs a sharp proposal or two,
  or nothing.
- **Not scope-creep by the agent.** Expansion offers; it does not decide. The user owns product
  direction; an expansion the user declines is dropped, not re-litigated.
