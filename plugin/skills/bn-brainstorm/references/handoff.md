# Phase 4: Handoff

After the requirements doc is written (or the decision was made to skip one), present
next-step options and execute the user's selection.

When `/bn-brainstorm` is running as `/bn-grow` intake, skip the menu. Return control to
`/bn-grow` with the requirements document path when one exists, otherwise a concise
finalized requirements summary. Also surface any unresolved `Resolve Before Planning`
items or equivalent blocking questions so `/bn-grow` can stop at its intake gate.

## The menu

Present the visible options with `AskUserQuestion`. Visibility rules: no requirements
doc hides nothing but changes what gets passed downstream (a summary instead of a path);
an unresolved `Resolve Before Planning` section hides **Plan implementation** and
**Build it now**; a failing direct-to-work gate hides **Build it now**.

1. **Plan implementation with `/bn-plan` (Recommended)** — Move to `/bn-plan` for
   structured implementation planning (prior-biased generators, judge panel). Shown only
   when `Resolve Before Planning` is empty.
2. **Build it now with `/bn-work` (skip planning)** — Skip planning and move to
   `/bn-work`; suited to lightweight, well-defined changes. Shown only when `Resolve
   Before Planning` is empty **and** scope is lightweight, success criteria are clear,
   scope boundaries are clear, and no meaningful technical or research questions remain
   (the "direct-to-work gate").
3. **Keep refining** — More clarifying questions or another approach pass; return to the
   appropriate phase.
4. **Done for now** — Print the closing summary and stop.

## Dispatch

**Plan implementation** — Immediately invoke `/bn-plan` in the current session. Pass the
requirements document path when one exists; otherwise pass a concise summary of the
finalized brainstorm decisions. Do not print the closing summary first.

**Build it now** — Immediately invoke `/bn-work` in the current session using the
finalized brainstorm output as context. If a compact requirements document exists, pass
its path. Do not print the closing summary first.

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
Next: <the natural next step, e.g. "/bn-plan <doc path>">
```

Substitute the actual requirements-doc path written this run. If no doc was warranted,
say so plainly rather than inventing a path.
