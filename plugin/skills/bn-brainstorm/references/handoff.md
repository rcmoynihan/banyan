# Phase 4: Handoff

After the requirements doc is written (or the decision was made to skip one), present
next-step options and execute the user's selection.

When `/bn-brainstorm` is running as `/bn-grow` intake, skip the menu. Return control to
`/bn-grow` with the requirements document path when one exists, otherwise a concise
finalized requirements summary. Also surface any unresolved `Resolve Before Planning`
items or equivalent blocking questions with structured dispositions so `/bn-grow` can recover
or write residuals from artifacts.

Grow intake return shape:

```markdown
## Grow intake handoff

- **Requirements:** <.banyan/brainstorms/...-requirements.md | summary: ...>
- **Safe assumptions recorded:** <bullets or "none">
- **Blockers:**
  - <title, or "none">
    - **Source:** <section / R-ID / whole document>
    - **blocker_class:** no-safe-default | missing-external-authority | permission-cliff |
      unsafe-working-tree | recovery-exhausted
    - **proposed_disposition:** revise-requirements | promote-to-plan-input |
      record-accepted-risk | ask-user
    - **next_safe_action:** <the action `/bn-grow` can take>
    - **resume_from_phase:** intake
```

## The menu

Present the visible options with `AskUserQuestion`. Visibility rules: no requirements
doc hides **Stress requirements** and changes what gets passed downstream (a summary instead
of a path); an unresolved `Resolve Before Planning` section hides **Stress requirements**,
**Plan implementation**, and **Build it now**; a failing direct-to-work gate hides
**Build it now**.

1. **Stress requirements with `/bn-spec-stress` (Recommended)** — Stress-test the
   requirements document for missing scenarios, hidden assumptions, acceptance gaps, and
   plan-affecting risks before planning. Shown only when a requirements document exists and
   `Resolve Before Planning` is empty.
2. **Plan implementation with `/bn-plan`** — Move to `/bn-plan` for
   structured implementation planning (prior-biased generators, judge panel). Shown only
   when `Resolve Before Planning` is empty.
3. **Build it now with `/bn-work` direct mode** — Move to `/bn-work` with the finalized
   brainstorm output as direct task context. `/bn-work` writes the run-local direct work
   spec before delivery; suited to lightweight, well-defined changes. Shown only when
   `Resolve Before Planning` is empty **and** scope is lightweight, success criteria are
   clear, scope boundaries are clear, and no meaningful technical or research questions
   remain (the "direct-to-work gate").
4. **See it first / mock it with `/bn-mock`** — Build a deliberately-fake, semi-functional
   mock under `mock/<slug>/` so design holes surface before planning or building. Shown
   standalone — offered whether or not a requirements document exists, since `/bn-mock` accepts
   free text. Because this menu is skipped entirely under the `/bn-grow` intake guard at
   the top of this file, the mock option is never surfaced inside `/bn-grow` intake.
5. **Keep refining** — More clarifying questions or another approach pass; return to the
   appropriate phase.
6. **Done for now** — Print the closing summary and stop.

## Dispatch

**Stress requirements** — Immediately invoke `/bn-spec-stress` in the current session with
the requirements document path. Do not print the closing summary first.

**Plan implementation** — Immediately invoke `/bn-plan` in the current session. Pass the
requirements document path when one exists; otherwise pass a concise summary of the
finalized brainstorm decisions. Do not print the closing summary first.

**Build it now** — Immediately invoke `/bn-work` in the current session using the
finalized brainstorm output as direct task context. If a compact requirements document
exists, pass its path; `/bn-work` treats non-`.banyan/plans/` paths as direct-mode context
and writes `.banyan/runs/<run-id>/briefs/direct-work-plan.md` itself. Do not print the
closing summary first.

**See it first / mock it** — Immediately invoke `/bn-mock` in the current session, passing
the requirements-doc path when one exists, otherwise the finalized brainstorm summary as
free-text input, reusing the live run; do not print the closing summary first.

**Keep refining** — Return to dialogue (Phase 1.3) or approaches (Phase 2) as the user's
note indicates. Re-run Phase 2.5 and Phase 3 (updating the existing doc) before offering
this menu again.

**Done for now** — Print the closing summary below and stop.

## Compounding

Lessons worth keeping beyond the requirements doc flow through Banyan's normal curation:
runs that spawn subtrees stage candidates automatically, and `/bn-curate` promotes them.
There is no separate capture step in this skill.

## Closing summary

When ending the session (Done for now, or after a dispatched skill returns control and
the user is finished), print:

```
Brainstorm complete.

Decisions: <2-4 bullets — the durable product decisions>
Outstanding: <open questions, or "none">
Doc: <repo-relative path to the requirements doc, or "none written — brief alignment only">
Next: <the natural next step, e.g. "/bn-spec-stress <doc path>">
```

Substitute the actual requirements-doc path written this run. If no doc was warranted,
say so plainly rather than inventing a path.
