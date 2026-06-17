# Edit log — document-review lenses (spec-stress)

Three document-review reviewer personas ported from
`plugins/compound-engineering/agents/ce-*.md` to `plugin/agents/bn-spec-*-reviewer.md` and wired
into `/bn-spec-stress` as standard/deep leaf lenses alongside the native scenario, assumption, and
threat reviewers. Upstream, these run under compound-engineering's `document-review` skill against
either requirements or plan documents and emit findings JSON with a confidence rubric. Banyan ports
the **hunting expertise** (dimensional rating, premise/strategy protocol, consistency patterns) but
reshapes the output to the spec-stress **candidate contract** (Source / Trigger / Gap / Disposition)
and scopes each to the requirements stage, so the trunk synthesizes them into the four-bucket
`spec-stress.md` gate exactly as it does the native lenses.

---

## bn-spec-design-reviewer (<- ce-design-lens-reviewer)

- **Frontmatter `name`:** `ce-design-lens-reviewer` -> `bn-spec-design-reviewer` (matches stem).
- **Frontmatter `model`:** `sonnet` -> `opus`, matching the `bn-spec-*-reviewer` family (invariant 7);
  the strawman/gap judgment benefits from the stronger model.
- **Frontmatter `tools`:** `Read, Grep, Glob` -> `Read, Grep, Glob, Write` (leaf writes its own
  candidate artifact); `color: purple` to match the spec-stress family. No `Agent(...)`.
- **Persona body:** the five rating dimensions (information architecture, interaction state
  coverage, user-flow completeness, responsive/accessibility, unresolved design decisions) and the
  AI-slop checklist preserved. The requirements-stage deferral guidance ("flag an implicit deferral
  that would block planning, not an explicit TBD") preserved.
- **v1/document-review coupling stripped:** the `<review-context>` `Document type:`/`Origin:`
  slot-reading and the numeric `0-10 / findings ≤7` rating-emission mechanic replaced with the
  spec-stress candidate bar (Source/Trigger/Gap/Disposition) and `Resolve Before Planning` /
  `Plan Input` / `Accepted Risk` dispositions. The shared-`subagent-template.md` confidence-rubric
  reference dropped (spec-stress lenses do not emit confidence anchors).
- **Output-contract swap:** findings JSON replaced with the spec-stress Markdown candidate block;
  verdict line `spec-design: <count> candidates -> <artifact_path>`. Spawn-gated in
  `bn-spec-stress/SKILL.md` on a user-facing surface at standard/deep effort.

## bn-spec-product-reviewer (<- ce-product-lens-reviewer)

- **Frontmatter `name`:** `ce-product-lens-reviewer` -> `bn-spec-product-reviewer` (matches stem).
- **Frontmatter `model`:** kept Opus-class (`inherit` -> `opus`, invariant 7).
- **Frontmatter `tools`:** `Read, Grep, Glob` -> `Read, Grep, Glob, Write`; `color: purple`. No
  `Agent(...)`.
- **Persona body:** the five techniques (premise challenge, strategic consequences, implementation
  alternatives, goal-requirement alignment, prioritization coherence) and the external-vs-internal
  product-context weighting preserved.
- **Origin suppression re-homed to the Banyan pipeline:** upstream suppresses premise/prioritization
  re-litigation when `Document type: plan AND Origin:` is a path. Banyan re-expresses this as an
  `inputs.requirements_origin` slot (`brainstorm | external`): when the requirements came from
  `/bn-brainstorm` (premise already validated in the brainstorm phase), Technique 1 and Technique 5
  are suppressed and Techniques 2/4 are gated to new-weight/visible-drift — preserving Banyan's
  "decide once, don't re-decide" discipline. The skill sets the slot from the input source.
- **Output-contract swap:** findings JSON replaced with the spec-stress candidate block (plus an
  `Origin`/`Product context` header); verdict line `spec-product: <count> candidates ->
  <artifact_path>`. Spawn-gated at standard/deep when the requirements carry product weight.

## bn-spec-coherence-reviewer (<- ce-coherence-reviewer)

- **Frontmatter `name`:** `ce-coherence-reviewer` -> `bn-spec-coherence-reviewer` (matches stem).
- **Frontmatter `model`:** `haiku` -> `opus`, matching the spec-stress family (invariant 7) — the
  strawman-resistance judgment is reasoning-heavy, not a mechanical lookup.
- **Frontmatter `tools`:** `Read, Grep, Glob` -> `Read, Grep, Glob, Write`; `color: purple`. No
  `Agent(...)`.
- **Persona body:** the inconsistency classes (contradictions, terminology drift, structural gaps,
  broken references, ambiguity, unresolved dependency contradictions) and the strawman-resistance
  guidance preserved.
- **`safe_auto` machinery dropped:** upstream owns six `safe_auto` / `confidence: 100`
  mechanically-fixable patterns. Banyan's spec-stress is read-only and emits dispositioned
  candidates (it never auto-fixes a requirements doc), so the `safe_auto` emission path is removed;
  the underlying patterns survive as hunting heuristics that produce candidates.
- **Output-contract swap:** findings JSON / `safe_auto` replaced with the spec-stress candidate
  block; verdict line `spec-coherence: <count> candidates -> <artifact_path>`. Spawn-gated at
  standard/deep on a doc with four or more requirements / multiple sections.
