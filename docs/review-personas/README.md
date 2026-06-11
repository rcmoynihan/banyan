# Review personas

This directory holds host-repo reviewer personas for `/bn-review`. Each persona file
with a `when:` frontmatter key becomes a candidate panel member: when its condition
matches the diff under review, `bn-review-lead` spawns the generic `bn-custom-reviewer`
to embody it. Files without a `when:` key — like this README — are never spawned.

Format spec and a full worked example:
[`plugin/skills/bn-review/references/review-personas.md`](../../plugin/skills/bn-review/references/review-personas.md).

The shape, in brief:

```markdown
---
name: pwsh-style
when: "the diff touches the PowerShell dev scripts under scripts/"
paths:
  - "scripts/**/*.ps1"
---

# PowerShell Script Reviewer

## What you're hunting for

- Missing `#requires -Version 7` on new scripts.
- `Write-Host` used where output should go to the pipeline.

## What you don't flag

- Style covered by PSScriptAnalyzer defaults.
```

Banyan keeps this directory README-only: its own reviews run the shipped panel.
