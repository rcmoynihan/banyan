# Host-repo review personas

Banyan's reviewer roster is closed by design — `bn-review-lead`'s `Agent(...)` allowlist
is the org chart (AGENTS.md §2). Host repos extend the panel **with data, not roster
edits**: drop persona files in the target repo, and the one generic `bn-custom-reviewer`
embodies them at review time (AGENTS.md §2.1).

## Where personas live

`docs/review-personas/*.md` in the **target repo** (the repo being reviewed), not in the
plugin.

## Persona file format

```markdown
---
name: swift
when: "the diff touches Swift sources or an Xcode project"
paths:
  - "**/*.swift"
  - "**/*.xcodeproj/**"
severity_calibration: "Force-unwraps in production code are P1; in tests, don't flag."
---

# Swift Reviewer

## What you're hunting for

- Force-unwraps (`!`) and force-casts (`as!`) on values that can be nil in production
  paths -- trace where the value comes from.
- Retain cycles: closures capturing `self` strongly inside stored closures or
  Combine/async pipelines without `[weak self]`.
- Main-thread violations: UI mutations off the main actor; blocking calls on the main
  actor.

## What you don't flag

- Style preferences SwiftLint already enforces.
- Force-unwraps in test code or previews.

## Confidence guidance

Anchor 100 = the nil path is constructible from the diff alone. Anchor 75 = full trace
through visible code. Below that, suppress (use the schema's anchored rubric).
```

| frontmatter key | required | meaning |
|---|---|---|
| `name` | yes | kebab-case slug; findings carry `"reviewer": "custom-<name>"` and land in `findings/custom-<name>.json` |
| `when` | **yes** | one-line condition the review lead judges against the diff (agent judgment, not keyword match) — **files without a `when:` key are skipped entirely**, which keeps a README or template in this directory inert |
| `paths` | no | glob list used as a cheap pre-filter before the `when:` judgment |
| `severity_calibration` | no | one line tuning what counts as P0/P1/P2 in this domain |

The body is the charter: *What you're hunting for*, *What you don't flag*, and optional
confidence guidance. Severity is yours to calibrate; the **confidence anchors are not**
— `schemas/findings-schema.json` (`_meta.confidence_anchors`) governs every reviewer,
shipped or custom.

## How selection works

During panel selection, `bn-review-lead` globs `docs/review-personas/*.md`, skips files
lacking a `when:` key, judges each remaining persona's `when:` (with `paths:` as a
pre-filter) against the diff, and spawns **at most 3** matching personas via
`bn-custom-reviewer`. Custom spawns count against the lead's `max_children` budget; an
overflow is reported as a squeeze in the verdict, never silently exceeded. Custom
findings merge, dedup, and confidence-gate identically to shipped-persona findings.

## Trust

A persona file is host-repo content executed as instructions — the same trust level as
the repo's `CLAUDE.md`. It defines *what to review for*; it cannot widen
`bn-custom-reviewer`'s boundaries (read-only, single artifact write, no spawns).

## Scope

Reviewers only. Research personas are not extensible this way — the research panel's
five researchers cover distinct source classes, and research output has no schema'd
findings contract to validate a custom persona against.
