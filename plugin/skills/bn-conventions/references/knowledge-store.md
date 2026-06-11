# Knowledge store: docs/solutions/ (v1-compatible)

Banyan's durable memory lives in `docs/solutions/` in the *target repo* (not the
plugin). Each entry is one markdown file: YAML frontmatter that classifies the
solution, then a prose body. This format is inherited verbatim from the
compound-engineering v1 plugin so existing knowledge stores keep working
(AGENTS.md invariant 8). Read this before writing a solution doc.

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

Files are grouped into category subdirectories under `docs/solutions/`. The v1
category mapping derives the directory from `problem_type`:

    build_error          -> docs/solutions/build-errors/
    test_failure         -> docs/solutions/test-failures/
    runtime_error        -> docs/solutions/runtime-errors/
    performance_issue    -> docs/solutions/performance-issues/
    database_issue       -> docs/solutions/database-issues/
    security_issue       -> docs/solutions/security-issues/
    ui_bug               -> docs/solutions/ui-bugs/
    integration_issue    -> docs/solutions/integration-issues/
    logic_error          -> docs/solutions/logic-errors/
    developer_experience -> docs/solutions/developer-experience/
    workflow_issue       -> docs/solutions/workflow-issues/
    best_practice        -> docs/solutions/best-practices/
    documentation_gap    -> docs/solutions/documentation-gaps/
    architecture_pattern -> docs/solutions/architecture-patterns/
    design_pattern       -> docs/solutions/design-patterns/
    tooling_decision     -> docs/solutions/tooling-decisions/
    convention           -> docs/solutions/conventions/

A target repo may instead group by a domain-meaningful category name (the Banyan
fixture uses `correctness/`, `reliability/`, `security/`). Both layouts are
valid: v1 compatibility is a property of the *frontmatter contract*, not the
directory name. Match the target repo's existing `docs/solutions/` convention;
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
  or at `docs/solutions/` as a whole). The per-field validation rules are
  untouched.
- Harvested candidate lessons use this same body/frontmatter format but live in
  the run ledger's `lessons-staging/`, never in `docs/solutions/`. They carry one
  extra **staging-only** key, `status: candidate`, which is **not** part of the v1
  schema — it is Banyan-internal bookkeeping that the curator **strips on promotion**.
  A doc only lands in `docs/solutions/` after the curator removes `status:` and the
  doc passes `validate-frontmatter.py`, so the committed knowledge store stays
  byte-for-byte v1-compatible. (Run the validator on a staged candidate with
  `status:` still present and it passes anyway — the validator checks parser safety,
  not a field allow-list — but promotion strips it regardless to keep intent clear.)
- `docs/solutions/*.md` is a protected artifact (AGENTS.md section 5): no agent
  may delete, gitignore, or "clean up" these files; a finding proposing removal
  is discarded during synthesis.
- Search `docs/solutions/` before writing a new solution so memory compounds
  rather than fragmenting into near-duplicates.
- Validate any doc you write:
  `python ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/validate-frontmatter.py <path>`
  (or point it at the directory). A non-zero exit means fix and retry.
