# Mock-notes schema — the builder's load-bearing artifact (R17 / R18 / R26)

The mock-notes is `bn-mock-builder`'s **load-bearing output** and the gate artifact `/bn-mock`
reads (never the builder's prose — invariant 3). It lives at:

```
.banyan/runs/<run-id>/briefs/mock-notes.md
```

(markdown, in the existing scaffolder-created `briefs/` gate-artifact subdir — R26; no scaffolder
change. If one run mocks several ideas, slug-suffix the filename: `briefs/mock-notes-<slug>.md`.)

**Gate-artifact status (R18):** the learning in this file becomes durable knowledge ONLY by being
routed forward through the `/bn-mock` handoff into an owning skill (`/bn-brainstorm`, `/bn-plan`,
`/bn-spec-stress`). While it sits in the run dir alone, it does not count as durable knowledge.
The disposition table at the end is what makes the routing actionable.

The headings below are **required and named so the schema is grep-checkable**, not left to prose
judgment. Use these exact `##` / `###` heading texts. For an in-place iteration (R22/R28) the
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
- <the exact copy-pasteable per-medium command — see R30 in fidelity-doctrine / handoff>

### Chosen modality + omitted surfaces
- **Primary medium:** GUI | CLI | API | agent-transcript
- **Why this medium:** <one line>
- **Omitted surfaces:** <other surfaces the idea also has, named but not built — or "none">

### Hardcoded scenarios
- <scenario 1 — happy path: what it shows>
- <scenario 2 — edge/empty/error: what it shows>
- <scenario 3 — pressure case: what it shows>
- **Why these three:** <the design-hole-surfacing rationale (R10)>

### Invented decisions with alternatives
- <decision — chosen default — alternatives considered> (R11; reversible + mock-local choices)
- ... (or "none — the input resolved every mock-local choice")

### Unresolved questions
- <high-blast-radius decision rendered as a visible placeholder, with the open question> (R12)
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

- **Disposition values (R20)** are exactly one of: `fold into requirements`, `send to
  spec-stress`, `replan`, `safe to plan/work`, `mock-only`. The routing for each lives in
  `handoff.md`.
- **Plan-impact column (R21)** is populated ONLY when the input was a plan path; each finding gets
  one of `no replan needed`, `requirements revision needed`, `replan before work`, so a
  known-wrong plan is never silently carried into `/bn-work`.
- **The Mock Reality Boundary block** is the per-mock instance of the anti-real-machine doctrine
  (`fidelity-doctrine.md`). Its four sub-bullets — hardcoded / fake / unrepresented /
  must-not-be-inferred — are required; an empty mock is still required to state them.
- **Iteration discipline (R28):** each run appends one `## Iteration N` section. Iteration 1 is
  never edited by iteration 2. The manifest `iteration` integer is bumped in lockstep.
