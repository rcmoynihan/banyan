---
name: bn-review
description: "Structured review of a code change via a lead-owned subtree that selects reviewers, dedupes findings, and fixes-and-verifies them in place, returning an applied verdict (it commits on a clean tree but never pushes). Use before opening a PR or after finishing a change."
argument-hint: "[blank = current branch | PR number/URL | base:<ref>] [--dogfood[=on|auto]]"
---

# bn-review

Thin trunk-side entry to the Banyan review subtree. This skill does four cheap
things -- detect scope, stage the diff into the run dir, build one envelope, and
dispatch `bn-review-lead` -- then presents the verdict the lead writes. All the
orchestration (reviewer selection, dedup, fix-and-verify, harvesting) lives inside
the lead, not here. Keep this procedure small.

The trunk NEVER checks out or switches branches: selecting a scope is not permission
to mutate the tree. The only writes this skill makes are the run dir and the staged
diff under it. Apply/commit happen inside the foreground lead, in the user's session.

## Step 1: Parse the argument and detect scope

Read the argument and resolve a `<base>` ref plus a `scope_mode`. See the diff-scope
rules below for edge cases; the four modes and the no-checkout rule are mandatory.

- **No arg** -> review the current branch against its detected base. Base is the
  merge-base of HEAD and the branch's upstream/default (`git merge-base HEAD <default>`,
  e.g. origin/main or origin/master). `scope_mode: local-aligned`.
- **`base:<ref>`** -> diff the current checkout against `<ref>`
  (`base = <ref>`). `scope_mode: standalone`.
- **A PR number or URL** -> read scope from `gh pr view <n> --json ...` metadata
  (base ref, head ref/sha, title, body) WITHOUT checking the PR out.
  `scope_mode: pr-remote` -- UNLESS local HEAD already equals the PR head sha, in
  which case the local tree is the PR and `scope_mode: local-aligned`.
- **A branch name** -> diff that remote branch against its base without checkout
  (`base = merge-base <default> <branch>`). `scope_mode: branch-remote`.

Rules that always hold:

- NEVER `git checkout`, `git switch`, or otherwise move HEAD. If a mode needs content
  you do not have locally, fetch read-only (`git fetch`) and diff refs; do not switch.
- If no base can be resolved for a standalone review, inspect the active run first when
  reached from `/bn-grow`: read `delivery-report.md`, `ledger.md`, and the branch / commit
  state to derive the integration base and head. If no scoped base can be derived, surface
  blocker metadata for `residuals.md` (`blocker_class`, `recovery_owner`, `next_safe_action`,
  `resume_from_phase`). Do NOT fall back to `git diff HEAD` -- an unscoped diff is not a review.
- `scope_mode` is one of: `local-aligned`, `pr-remote`, `branch-remote`, `standalone`.
  It drives the lead's APPLY-vs-REPORT decision (Step 4 boundaries).

Also resolve the **`dogfood`** flag for the envelope (default **`off`** — `off` is the
safe default: execution-grounded verification stays opt-in so a review never tries to
launch a host repo unbidden):

- A `--dogfood` arg (or `--dogfood=on`/`--dogfood=auto`) sets it: bare `--dogfood` →
  `auto`; `=on` → `on`; `=auto` → `auto`.
- When invoked via `/bn-grow`, a plan-frontmatter `dogfood:` field sets it.
- Absent both, `dogfood: off`. The lead never spawns the verifier on `off`. On `auto` it
  self-gates on effort and diff shape and degrades to a recorded Coverage skip when the repo is
  not drivable. On `on` the user asserts the repo is drivable, so the lead spawns the verifier
  regardless of diff-shape selection; a capability failure still degrades to the same recorded
  Coverage skip — non-blocking, never a hard error. Resolution against effort and diff shape is
  the lead's job.

## Step 2: Discover intent

Write a 2-3 line summary of what the change is trying to do, from whatever is cheap:
the branch name, `git log --oneline <base>..HEAD`, the PR title+body, or the
conversation so far. Note any uncertainty in one clause; do NOT block on a question or
ask the user before proceeding -- the review runs regardless.

## Step 3: Open the run ledger and stage the diff

**Locate the run.** If you are already in a run (this skill was reached from `/bn-grow` or
a prior step that passed its run ID and run dir), reuse that run dir — do NOT scaffold a
new one; stage the diff and write `review-verdict.md` under the same `.banyan/runs/<run-id>/`
the grow ledger already tracks. Otherwise scaffold a run dir, then write the diff into it
so the lead reads files, not prose:

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs review-<slug> \
  --root <repo-root> \
  --objective "<review this change and return an applied verdict when scope permits>" \
  --plan-ref "<.banyan/plans/...-plan.md, or none -- ad hoc run>" \
  --unit "review|bn-review-lead|in-progress|.banyan/runs/<run-id>/review-verdict.md" \
  --actor trunk
```

- `<slug>` -> kebab-case from the intent (e.g. `review-add-oauth-login`). The script emits
  JSON; capture `run_id`, `run_dir`, `ledger_path`, and `facts`.
- `<repo-root>` -> the target repo's root (`git rev-parse --show-toplevel`).
- Then stage the diff under `.banyan/runs/<run-id>/`:
  - `full.diff`  <- `git diff -U10 <base>` (use `<base>...<head>` form for a remote PR/branch).
  - `files.txt`  <- `git diff --name-only <base>` (same ref form).
- When reusing a grow run, call the script with `--run-id <run-id>` so it returns the same
  structured facts without overwriting the existing ledger. Do not add a duplicate review
  row; grow already seeded the `review` phase row.
- Use `facts.test_command` from the scaffolder for the envelope. "none detected" is valid.

## Step 4: Build the envelope and spawn bn-review-lead

Embed this envelope verbatim in the Agent prompt and spawn `bn-review-lead` (one
child; foreground, in the user's session). Fill every field.

```
=== BANYAN ENVELOPE ===
objective:       Review the staged diff for run <run-id>, then fix-and-verify every
                 confirmed finding in place and return an applied verdict.
artifact_path:   .banyan/runs/<run-id>/review-verdict.md
output_format:   Markdown verdict per the review-verdict template: verdict line,
                 findings applied + commit status, residual findings, coverage.
inputs:
  base_ref:        <base>
  full_diff:       .banyan/runs/<run-id>/full.diff
  files_txt:       .banyan/runs/<run-id>/files.txt
  intent_summary:  <the 2-3 line summary from Step 2>
  scope_mode:      <local-aligned | pr-remote | branch-remote | standalone>
  plan_ref:        <.banyan/plans/...-plan.md, or "none">
  test_command:    <detected repo test command, or "none detected">
  dogfood:         <off | auto | on>   # default off; opt-in execution-grounded verifier
doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md
boundaries:      APPLY (edit + commit on a clean tree) ONLY when scope_mode is
                 local-aligned or standalone; otherwise REPORT only -- propose fixes,
                 do not edit. NEVER push or open a PR. NEVER touch protected artifacts
                 .banyan/brainstorms, .banyan/plans, .banyan/solutions, or .banyan/runs outside this
                 run's own artifacts. One writer per file set.
tool_guidance:   Read, Grep, Glob, Bash to inspect the diff and run the test command;
                 Write to its own run artifacts; Agent(...) to spawn its reviewer panel
                 and finding-owners per its own dispatch policy.
budget:
  max_children:    15
  depth_remaining: 3
effort_class:    <lightweight | standard | deep>
=== END ENVELOPE ===
```

- **effort_class by diff size:** trivial / small diff -> `lightweight`; medium ->
  `standard`; large, OR any diff touching auth / payments / migrations -> `deep`.
- The envelope is the whole contract: base ref, the two staged-diff paths, the intent
  summary, scope_mode, optional plan ref, and the detected test command all travel
  inside it. The lead reads `full.diff` / `files.txt` -- it does not re-derive scope.

## Step 5: Present the verdict

When the lead returns, READ `.banyan/runs/<run-id>/review-verdict.md` (the artifact, not
the lead's final-message prose -- invariant 3) and present to the user:

- the verdict line;
- what was applied and the commit status (or, in REPORT mode, that nothing was applied
  and why);
- residual / unaddressed findings (including any dogfood `concern` legs the verifier
  could not drive — "verify manually");
- review coverage (which reviewers ran, and — when the dogfood verifier was in scope —
  whether it drove the app, was skipped (with the reason), or was not run).
- recovery metadata for `/bn-grow` when the verdict is not ready: `blocker_class`,
  `recovery_owner`, `next_safe_action`, and `resume_from_phase`; say `none` when no recovery
  metadata is needed.

Then state explicitly that **push remains the user's step** -- the lead commits on a
clean tree but never pushes (permission cliff, invariant 6). Point the user at
`.banyan/runs/<run-id>/` for the full record (findings, merged findings, ledger).

## Permission cliff (invariant 6)

Apply and commit happen inside the FOREGROUND lead, in the user's session, where edit
permissions are live. Pushes never happen here at all. If this skill is somehow driven
where edits would be auto-denied (e.g. a background context), the lead REPORTS its
proposed fixes instead of failing silently -- the verdict then reflects REPORT mode and
the user applies from the record.
