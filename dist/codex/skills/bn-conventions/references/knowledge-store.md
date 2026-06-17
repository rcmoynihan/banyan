# Knowledge store: .banyan/solutions/ (v1-compatible)

Banyan's durable memory lives in `.banyan/solutions/` in the *target repo* (not the
plugin). Each entry is one markdown file: YAML frontmatter that classifies the
solution, then a prose body. This format is inherited verbatim from the
compound-engineering v1 plugin (AGENTS.md invariant 8). Read this before
writing a solution doc.

The canonical, machine-readable contract is `plugin/schemas/solution-frontmatter.yaml`
(a byte-for-byte copy of upstream's `schema.yaml`). This doc summarizes it for an
agent at write time; when the two disagree, the schema wins.

## The two tracks

Every doc belongs to exactly one track, determined by its `problem_type`:

- **Bug track** -- a defect or failure that was diagnosed and fixed.
- **Knowledge track** -- a practice, pattern, convention, decision, workflow
  improvement, or documentation gap.

The track decides which fields are *required* beyond the shared core (below).
Pick `problem_type` first; the track follows from it.

### problem_type enums by track

Bug track (`problem_type` is one of):

    build_error, test_failure, runtime_error, performance_issue,
    database_issue, security_issue, ui_bug, integration_issue, logic_error

Knowledge track (`problem_type` is one of):

    best_practice, documentation_gap, workflow_issue, developer_experience,
    architecture_pattern, design_pattern, tooling_decision, convention

Prefer the narrowest applicable value. `best_practice` is the fallback only when
no narrower knowledge-track value fits.

## Required frontmatter (BOTH tracks)

| field | type | rule |
|---|---|---|
| `module` | string | Module or area affected. |
| `date` | string | ISO date, must match `YYYY-MM-DD`. |
| `problem_type` | enum | One of the values above; determines the track. |
| `component` | enum | See component enum below. |
| `severity` | enum | `critical`, `high`, `medium`, or `low`. |

`component` is one of:

    rails_model, rails_controller, rails_view, service_object, background_job,
    database, frontend_stimulus, hotwire_turbo, email_processing, brief_system,
    assistant, authentication, payments, development_workflow,
    testing_framework, documentation, tooling

(The enum is Rails-flavored because of v1's origin. Pick the closest fit; do not
invent new values -- strict enum matching is validated. `service_object`,
`tooling`, `documentation`, and `development_workflow` are domain-neutral.)

## Bug-track required fields (in addition to the core)

| field | type | rule |
|---|---|---|
| `symptoms` | array[string] | 1-5 observable symptoms (errors, broken behavior). |
| `root_cause` | enum | See root_cause enum below. |
| `resolution_type` | enum | See resolution_type enum below. |

`root_cause` is one of:

    missing_association, missing_include, missing_index, wrong_api, scope_issue,
    thread_violation, async_timing, memory_leak, config_error, logic_error,
    test_isolation, missing_validation, missing_permission,
    missing_workflow_step, inadequate_documentation, missing_tooling,
    incomplete_setup

`resolution_type` is one of:

    code_fix, migration, config_change, test_fix, dependency_update,
    environment_setup, workflow_improvement, documentation_update,
    tooling_addition, seed_data_update

## Knowledge-track fields

The knowledge track has **no required fields beyond the shared core**. These are
all optional:

- `applies_when` -- array[string], max 5: conditions where the guidance applies.
- `symptoms` -- array[string], max 5: observable gaps or friction that prompted it.
- `root_cause` -- enum (same values as above), if there is a specific one.
- `resolution_type` -- enum (same values as above), if a change was made.

## Optional fields (both tracks)

- `related_components` -- array[string]: other components involved.
- `tags` -- array[string], max 8: search keywords, lowercase, hyphen-separated.

## Optional fields (bug track only)

- `rails_version` -- string matching `X.Y.Z`. Only meaningful on bug-track docs.

## Backward compatibility

Docs created before the track system may carry bug-track fields (`symptoms`,
`root_cause`, `resolution_type`) on knowledge-type `problem_type`s. These are
valid legacy docs. Do not strip those fields during a refresh unless the doc is
being rewritten for other reasons. When creating NEW docs, follow the track
rules above.

## YAML safety (silent-corruption avoidance)

Strict YAML parsers silently misread some unquoted scalars. The packaged
validator (`skills/bn-conventions/scripts/validate-frontmatter.py`) catches
these before they corrupt a doc. To stay clean:

- Wrap any array-of-strings item (`symptoms`, `applies_when`, `tags`,
  `related_components`, or any array field) in double quotes when it starts with
  a YAML reserved indicator -- one of `` ` `` `[` `*` `&` `!` `|` `>` `%` `@` `?`
  -- or when it contains the substring `: `.
- Quote any top-level scalar value that contains ` #` (space-then-hash, treated
  as a comment delimiter and silently truncated) or `: ` (treated as a nested
  mapping).

Example -- breaks strict YAML:

    symptoms:
      - `flush-cache` does not restore mDNS

Example -- parses cleanly:

    symptoms:
      - "`flush-cache` does not restore mDNS"

## Directory / category taxonomy

Files are grouped into category subdirectories under `.banyan/solutions/`. The v1
category mapping derives the directory from `problem_type`:

    build_error          -> .banyan/solutions/build-errors/
    test_failure         -> .banyan/solutions/test-failures/
    runtime_error        -> .banyan/solutions/runtime-errors/
    performance_issue    -> .banyan/solutions/performance-issues/
    database_issue       -> .banyan/solutions/database-issues/
    security_issue       -> .banyan/solutions/security-issues/
    ui_bug               -> .banyan/solutions/ui-bugs/
    integration_issue    -> .banyan/solutions/integration-issues/
    logic_error          -> .banyan/solutions/logic-errors/
    developer_experience -> .banyan/solutions/developer-experience/
    workflow_issue       -> .banyan/solutions/workflow-issues/
    best_practice        -> .banyan/solutions/best-practices/
    documentation_gap    -> .banyan/solutions/documentation-gaps/
    architecture_pattern -> .banyan/solutions/architecture-patterns/
    design_pattern       -> .banyan/solutions/design-patterns/
    tooling_decision     -> .banyan/solutions/tooling-decisions/
    convention           -> .banyan/solutions/conventions/

A target repo may instead group by a domain-meaningful category name (the Banyan
fixture uses `correctness/`, `reliability/`, `security/`). Both layouts are
valid: v1 compatibility is a property of the *frontmatter contract*, not the
directory name. Match the target repo's existing `.banyan/solutions/` convention;
use the problem_type mapping above only when seeding a fresh store. The
frontmatter `problem_type` -- not the path -- is the source of truth.

## Document body structure (the two tracks)

The body is prose, written so a future engineer can act on it without any other
context. Shape it by track:

Bug-track body:

    # <one-line title: the defect, not the fix>
    ## Problem      -- where it lives and what it breaks
    ## Symptoms     -- the observable failures (mirror the frontmatter symptoms)
    ## Root cause   -- the underlying technical cause
    ## Solution     -- the fix, with a minimal code snippet
    ## Prevention   -- the test or review hot-spot that catches a regression

Knowledge-track body:

    # <one-line title: the guidance, stated as a rule>
    ## Guidance / Convention  -- the rule, stated imperatively
    ## Why                    -- the failure mode it prevents
    ## Applies when           -- conditions (mirror applies_when if present)
    ## Verification           -- the test or check that proves it holds

These headings are a guide, not a rigid schema -- the validator checks only
frontmatter, not body headings. Keep the body concrete: name the boundary, show
the minimal snippet, and state the one test that distinguishes correct from
broken. Omit process exhaust (no "captured at phase X", no "next steps").

## How Banyan stays v1-compatible (invariant 8)

- Banyan reads and writes this frontmatter contract unchanged. The schema file
  is a verbatim copy of upstream's `schema.yaml`; the validator is upstream's,
  with only a directory-walk plumbing edit (it can be pointed at a single file
  or at `.banyan/solutions/` as a whole). The per-field validation rules are
  untouched.
- Harvested candidate lessons use this same body/frontmatter format but live in
  the run ledger's `lessons-staging/`, never in `.banyan/solutions/`. They carry
  **staging-only** keys that are **not** part of the v1 schema — Banyan-internal
  bookkeeping the curator **strips on promotion**. A doc only lands in
  `.banyan/solutions/` after the curator removes every staging-only key and the doc
  passes `validate-frontmatter.py`, so the curated knowledge store stays
  byte-for-byte v1-compatible. The staging-only keys are `status: candidate`,
  `claim_type`, and `intervention` (the claim_type doctrine is below); the
  validator's clean-store guard rejects any of them on a `.banyan/solutions/` doc,
  so a staging key can never leak into the curated store.
- `.banyan/solutions/*.md` is a protected artifact (AGENTS.md section 5): no agent
  may delete or "clean up" these files, and a reviewer finding
  proposing removal is discarded during synthesis. The one exception is the
  `bn-knowledge-curator` deleting a drifted entry under `/bn-learn --refresh`,
  foreground, after explicit per-doc user confirmation; AGENTS.md section 5 is
  authoritative for that carve-out, and background curation never deletes.
- Search `.banyan/solutions/` before writing a new solution so memory compounds
  rather than fragmenting into near-duplicates.
- Validate any doc you write:
  `python ~/.codex/skills/banyan/skills/bn-conventions/scripts/validate-frontmatter.py <path>`
  (or point it at the directory). A non-zero exit means fix and retry.

## Claim type: the staging-only causal gate

A candidate's central claim is either *causal* — a bug-track `root_cause`, or a
knowledge-track rule that asserts *why* something must be done — or it is not (a
discovered convention, a path, a tooling decision that records *what* without a
why-it-breaks mechanism). The causal candidates are the durable-poison vector: a
wrong "why" promoted into `.banyan/solutions/` misleads every future reader. Every
candidate therefore carries one staging-only `claim_type` describing the strength
of its central claim:

| value | meaning | who may write it |
|---|---|---|
| `tested` | a parent re-ran an **executed** artifact that isolated the mechanism (a `repro_command` the lead/finding-owner re-ran, a red→green counterexample) and the candidate cites it in `intervention:`. | only a producer mining a record that shows that executed intervention. |
| `inspected` | the claim was read or observed in code but not isolated by an executed intervention. | the default-and-ceiling for onboarding derivatives, which only transcribe untrusted legacy text. |
| `assumed` | a hypothesis never isolated; also the conservative default the curator applies when a candidate arrives with **no** `claim_type`. | any producer. |

Rules every producer and the curator share:

- **One `claim_type` per candidate**, attached to its causal core — never per
  sentence (a per-sentence proof bundle confabulates and is not the contract).
- **`tested` requires a present `intervention:` citation** naming the
  parent-owned executed artifact that isolated the mechanism — what was
  disabled/isolated so the failure was reproduced without the cause, or the
  counterexample that went green only with the cause removed. **Prose alone never
  earns `tested`**; a self-described "I verified this" is not an executed
  artifact. The honesty of `tested` is enforced *upstream*, at the lead /
  finding-owner acceptance boundary that actually re-ran the artifact — the
  curator only checks, by Read, that the citation exists; it does not re-execute.
- **The curator's promotion gate** (in `bn-knowledge-curator.md`): a *causal*
  candidate promotes to `.banyan/solutions/` **only** when `claim_type: tested` with
  a present `intervention:`. A causal candidate that is `inspected`/`assumed`, or
  `tested` with no `intervention:` (an uncited "tested" does not qualify), is **held
  in staging** and reported — not promoted as an established cause, never lost.
  *Non-causal* candidates promote normally regardless of `claim_type`. When unsure
  whether a claim is causal, treat it as causal and hold.
- `claim_type` and `intervention` are **stripped on promotion** exactly as
  `status: candidate` is, and the validator's clean-store guard blocks them from a
  curated doc — the curated store stays byte-for-byte v1.

`claim_type` (`tested | inspected | assumed`) is for **lessons / solution
candidates only**. Review and dogfood findings use a separate field,
`verification_status`, owned by the review cluster; the two vocabularies are
distinct and must not be conflated.

## Marking staleness and supersession (body prose, never frontmatter)

When a `.banyan/solutions/` doc drifts from the current codebase or is superseded by
a newer doc, record that **in the doc body**, never as a new frontmatter key.
Adding a `status:`, `stale:`, or `superseded_by:` key to a curated doc would
break the v1 frontmatter contract (invariant 8) the same way `status: candidate`
would — and the clean-store guard rejects `status:` outright. Body prose is
v1-neutral and is still visible to any reader and to `bn-learnings-researcher`.

Append a short `## Status` note near the end of the body:

    ## Status
    Superseded by `.banyan/solutions/<category>/<successor>.md` on YYYY-MM-DD — <one-line reason>.

or, for a doc whose referenced code/paths have drifted but that has no successor
yet:

    ## Status
    Stale as of YYYY-MM-DD — <what drifted: the referenced path/API/behavior no longer exists>.

The frontmatter is the contract; the body carries the lifecycle. A stale-marking
edit must still pass `validate-frontmatter.py` (it touches only the body).
