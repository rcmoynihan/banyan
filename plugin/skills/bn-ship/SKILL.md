---
name: bn-ship
description: "Commit, push, and open a PR with an adaptive, value-first description that scales in depth with the change. Use when the user says \"commit and PR\", \"ship this\", \"create a PR\", or \"open a pull request\" -- including after /bn-grow's ship gate. Also handles description-only flows (\"write a PR description\", \"rewrite the PR body\", \"describe this PR\") without committing or pushing."
argument-hint: "[blank = full workflow | PR number/URL for description-only/update]"
---

# Git Commit, Push, and PR

## The permission cliff

This skill is **the one place in Banyan allowed to push or open a PR**. It runs at the
trunk, foreground, with the user present (AGENTS.md invariant 6). It is never dispatched
as or from inside a subagent or subtree — subtrees commit at most; they report the need
to ship upward. If you detect you are running where permission prompts would auto-deny
(a background or nested context), STOP and report instead of pushing.

It spawns no agents and opens no run ledger (the ledger audits delegation; a zero-spawn
procedure has nothing to audit).

**Asking the user:** when this skill says "ask the user", use `AskUserQuestion`. Never
silently skip the question.

## Mode

- **Description-only** — user wants *just* a description ("write/draft a PR description",
  "describe this PR", or pasted a PR URL/number alone). Run Step 4 only; print the
  result. Apply only if the user asks. If a PR ref was pasted, pass it to Step 4 so Pre-A
  resolves the right range.
- **Description update** — user wants to refresh/rewrite an existing PR's description
  with no commit/push intent. If no open PR, report and stop. Otherwise run Step 4 (PR
  mode using the existing PR's URL), then Step 5 to preview, confirm, and apply via
  `gh pr edit`.
- **Full workflow** — otherwise. Run Steps 1-5 in order.

## Context

The labeled sections below contain pre-populated data — use them directly.

**Git status:**
!`git status`

**Working tree diff:**
!`git diff HEAD`

**Current branch:**
!`git branch --show-current`

**Recent commits:**
!`git log --oneline -10`

**Remote default branch:**
!`git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo 'DEFAULT_BRANCH_UNRESOLVED'`

**Existing PR check:**
!`gh pr view --json url,title,state 2>/dev/null || echo 'NO_OPEN_PR'`

---

## Step 1: Resolve branch and PR state

The remote default branch returns something like `origin/main`; strip the `origin/`
prefix. If it returned `DEFAULT_BRANCH_UNRESOLVED` or bare `HEAD`, try
`gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`. If both fail, fall
back to `main`.

Branch routing:

- **Detached HEAD** — explain a branch is required and ask whether to create a feature
  branch. If yes, derive a name from the change content. If no, stop.
- **On default branch with work to do** (uncommitted, unpushed, or no upstream) —
  automatically create a feature branch (pushing the default directly is not supported).
  Derive a name from the change content and continue at Step 3, which handles branch
  creation safely. Do not ask whether to branch — committing on the default is not an
  option here.
- **On default branch with no work** — report no feature branch work and stop.
- **Feature branch** — continue.

Note the existing PR URL from the PR check if `state: OPEN`. Step 5 uses it to route
between new-PR and existing-PR application.

## Step 2: Determine conventions

Match repo style for commit messages and PR titles per the commit doctrine in
`${CLAUDE_PLUGIN_ROOT}/skills/bn-commit/SKILL.md` Step 2 (project instructions in
context > recent commits > conventional commits as default; `fix:` over `feat:` when
ambiguous). The user may override.

## Step 3: Commit and push

If on the default branch, branch creation needs to handle stale local `<base>`, unpushed
commits on local `<base>`, and uncommitted changes that collide with the fresh remote
base. Read `references/branch-creation.md` and follow its decision flow before
continuing.

Build the commits per the commit doctrine in
`${CLAUDE_PLUGIN_ROOT}/skills/bn-commit/SKILL.md` Steps 3-4: scan for naturally distinct
concerns and split into 2-3 logical commits at file level only when the separation is
obvious; stage specific files by name (**never `git add -A` or `git add .`**); commit
with a heredoc message.

Then push:

```bash
git push -u origin HEAD
```

If the working tree is clean and all commits are already pushed, this step is a no-op.

## Step 4: Compose the PR title and body

**You MUST read `references/pr-description-writing.md`** in full — the core principle at
the top governs every step. The only input it needs from this skill is the PR ref, if one
was identified by mode dispatch (description-only with a pasted URL, or description
update).

**Evidence decision** before composition. Two short-circuits, then the question:

1. **User explicitly asked for evidence** ("ship with a demo", "include a screenshot") —
   use what they provide. If nothing usable is provided, note briefly and proceed
   without.
2. **Agent judgment on authored changes** — if you authored the commits and know the
   change is non-observable (internal plumbing, type-only, backend refactor without
   user-facing effect, docs/markdown/changelog/CI/test-only, pure refactors), skip the
   prompt without asking.

Otherwise, if the branch diff changes observable behavior (UI, CLI output, API behavior
with runnable code, generated artifacts, workflow output) and evidence is not blocked
(unavailable credentials, paid services, deploy-only infrastructure, hardware), ask:
"This PR has observable behavior. Include evidence in the PR description?"

- **Provide evidence** — the user supplies a URL or a markdown embed; splice it as a
  `## Demo` section.
- **Skip** — proceed without an evidence section.

Then continue with the rest of the reference (Steps Pre-A through D) to compose the
title and body.

## Step 5: Apply and report

**Description-only mode** — print the title and body. Stop unless the user asks to
apply.

**New PR** (full workflow, no existing PR from Step 1) — apply per "Applying via gh"
below using `gh pr create`. Report the URL.

**Existing PR** (full workflow, found in Step 1) — the new commits are already on the PR
from Step 3. Report the PR URL, then ask whether to rewrite the description.

- **No** — done.
- **Yes** — run Step 4 if not already done, then preview and apply (see below).

**Description update mode, or existing-PR rewrite confirmed** — preview before applying.
Ask: "New title: `<title>` (`<N>` chars). Summary leads with: `<first two sentences>`.
Total body: `<L>` lines. Apply?" If declined, the user may pass focus text back for a
regenerate; do not apply. If confirmed, apply per "Applying via gh" below using
`gh pr edit` and report the URL.

---

## Applying via gh

The body **must** be written to a temp file and passed via `--body-file <path>`. Never
use `--body-file -`, stdin pipes, heredoc-to-stdin, or `--body "$(cat ...)"` — wrappers
and stdin handling can silently produce an empty PR body while `gh` still exits 0 and
returns a URL.

```bash
BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/bn-pr-body.XXXXXX") && cat > "$BODY_FILE" <<'__BN_PR_BODY_END__'
<the composed body markdown goes here, verbatim>
__BN_PR_BODY_END__
```

The quoted sentinel keeps `$VAR`, backticks, and any literal `EOF` inside the body from
being expanded.

For `<TITLE>`: substitute verbatim. If it contains `"`, `` ` ``, `$`, or `\`, escape
them or switch to single quotes.

```bash
gh pr create --title "<TITLE>" --body-file "$BODY_FILE"   # new PR
gh pr edit   --title "<TITLE>" --body-file "$BODY_FILE"   # existing PR
```
