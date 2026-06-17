# Mock-notes schema — the builder's load-bearing artifact

The mock-notes is `bn-mock-builder`'s **load-bearing output** and the gate artifact `/bn-mock`
reads (never the builder's prose — invariant 3). It lives at:

```
.banyan/runs/<run-id>/briefs/mock-notes.md
```

(markdown, in the existing scaffolder-created `briefs/` gate-artifact subdir; no scaffolder change.
If one reused run mocks several ideas, the trunk selects a slug-suffixed filename
`briefs/mock-notes-<slug>.md` for the second-and-later slug — see `SKILL.md` Step 3a, which sets
both the spawn envelope's `artifact_path` and the read-back path so collisions never silently
overwrite a prior slug's notes.)

**Gate-artifact status:** the learning in this file becomes durable knowledge ONLY by being
routed forward through the `/bn-mock` handoff into an owning skill (`/bn-brainstorm`, `/bn-plan`,
`/bn-spec-stress`). While it sits in the run dir alone, it does not count as durable knowledge.
The disposition table at the end is what makes the routing actionable.

The headings below are **required and named so the schema is grep-checkable**, not left to prose
judgment. Use these exact `##` / `###` heading texts. For an in-place iteration the
builder appends a new `## Iteration N` block; prior iterations are never rewritten.

## Required structure

```markdown
# Mock notes: <slug>

## Iteration <N>

### Input source
- **Kind:** free-text | requirements-doc | plan
- **Source input:** <the free text, or the repo-relative path to the requirements/plan doc>
- **Run id:** <run-id>

### Mock path
- `mock/<slug>/`

### Run command
- <the exact copy-pasteable per-medium run/open command — see the per-medium command list in
  fidelity-doctrine / handoff>

### Chosen modality + surface inventory
- **Primary medium:** GUI | CLI | API | agent-transcript
- **Why this medium:** <one line>
- **Surface inventory:** every surface of the idea, each in exactly one tier:

| surface | tier | note |
|---------|------|------|
| <surface> | built-to-fidelity \| navigable-placeholder \| omitted-with-rationale | <one line: scenarios covered, or why placeholder/omitted> |

### Hardcoded scenarios
- <scenario 1 — happy path: what it shows>
- <scenario 2 — edge/empty/error: what it shows>
- <scenario 3 — pressure case: what it shows>
- **Why these three:** <the design-hole-surfacing rationale>

### Invented decisions with alternatives
- <decision — chosen default — alternatives considered> (reversible + mock-local choices)
- ... (or "none — the input resolved every mock-local choice")

### Unresolved questions
- <high-blast-radius decision rendered as a visible placeholder, with the open question>
- ... (or "none")

### Mock Reality Boundary
- **Hardcoded:** <values/responses that are faked constants, not computed>
- **Fake:** <flows that look real but do nothing — login, save, submit, payment>
- **Unrepresented:** <parts of the idea deliberately not built in this mock>
- **Must-not-be-inferred:** <conclusions a viewer must NOT draw — e.g. "prices are decided",
  "this scales", "auth works"; the anti-real-machine traps>

### Planning impact
- <what the mock revealed that changes the requirements/plan — the design holes found>

### Suggested requirements patches
- <concrete proposed additions/changes to the requirements, as proposals only (propose-never-patch)>
- ... (or "none")

### Disposition table
| finding | disposition | (plan-impact, if input was a plan) |
|---------|-------------|-------------------------------------|
| <finding 1> | fold into requirements \| send to spec-stress \| replan \| safe to plan/work \| mock-only | no replan needed \| requirements revision needed \| replan before work \| n/a |
| <finding 2> | ... | ... |
```

## Field notes

- **Disposition values** are exactly one of: `fold into requirements`, `send to
  spec-stress`, `replan`, `safe to plan/work`, `mock-only`. The routing for each lives in
  `handoff.md`.
- **Surface tiers** are exactly one of: `built-to-fidelity`, `navigable-placeholder`,
  `omitted-with-rationale` (`fidelity-doctrine.md` §1.5). Every surface of the idea appears in the
  surface inventory in exactly one tier; control surfaces (onboarding, cold-start, auth, profile,
  billing, settings) are navigable-placeholders rather than prose omissions whenever they are
  needed to see the whole app.
- **Plan-impact column** is populated ONLY when the input was a plan path; each finding gets
  one of `no replan needed`, `requirements revision needed`, `replan before work`, so a
  known-wrong plan is never silently carried into `/bn-work`.
- **The Mock Reality Boundary block** is the per-mock instance of the anti-real-machine doctrine
  (`fidelity-doctrine.md`). Its four sub-bullets — hardcoded / fake / unrepresented /
  must-not-be-inferred — are required; an empty mock is still required to state them.
- **Iteration discipline:** each run appends one `## Iteration N` section. Iteration 1 is never
  edited by iteration 2. The trunk computes `N` (the next iteration number) and passes it as the
  envelope's `inputs.iteration`; the builder writes that value verbatim into both the `## Iteration
  N` heading and the manifest `iteration` integer (in lockstep), and does not increment it itself.
