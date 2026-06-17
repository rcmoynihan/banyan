---
name: bn-review
description: "Structured READ-ONLY review of a code change via a lead-owned subtree that selects reviewers and dedupes findings, returning a findings report (review-verdict.md + findings/merged.json). It edits nothing, applies no fixes, and commits nothing -- addressing the findings is the user's call (or run /bn-work to fix them). Use before opening a PR, after finishing a change, or to audit someone else's branch/PR."
argument-hint: "[blank = current branch | PR number/URL | base:<ref>] [--dogfood[=on|auto]]"
---

# bn-review

Thin trunk-side entry to the Banyan review subtree. This skill does four cheap
things -- detect scope, stage the diff into the run dir, build one envelope, and
dispatch `bn-review-lead` -- then presents the findings report the lead writes. All the
orchestration (reviewer selection, dedup, harvesting) lives inside the lead, not here.
Keep this procedure small.

`/bn-review` is **read-only**: it reviews and reports, it does **not** fix. The lead edits
nothing, applies no fixes, and commits nothing — it returns a findings report. The trunk
NEVER checks out or switches branches: selecting a scope is not permission to mutate the
tree. The only writes this skill makes are the run dir and the staged diff under it. To
*act* on the findings, the user addresses them manually or runs `/bn-work` (whose delivery
lead drives the review-fix loop).

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
- If no base can be resolved, do NOT fall back to `git diff HEAD` — an unscoped diff is not
  a review. Stop and ask the user for an explicit `base:<ref>`, a PR number, or a branch
  name. (Note: `/bn-grow` no longer routes through this skill — its delivery phase runs the
  review-fix loop inside `bn-delivery-lead`, which scopes and spawns `bn-review-lead`
  directly — so this skill resolves scope from its own argument.)
- `scope_mode` is one of: `local-aligned`, `pr-remote`, `branch-remote`, `standalone`.
  It selects which refs the diff is staged from (local checkout vs a remote PR/branch). It
  no longer changes the lead's behavior — review is read-only in every mode.

Also resolve the **`dogfood`** flag for the envelope (default **`off`** — `off` is the
safe default: execution-grounded verification stays opt-in so a review never tries to
launch a host repo unbidden):

- A `--dogfood` arg (or `--dogfood=on`/`--dogfood=auto`) sets it: bare `--dogfood` →
  `auto`; `=on` → `on`; `=auto` → `auto`.
- When a caller passes a plan-frontmatter `dogfood:` field, it sets it.
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

**Locate the run.** If you are already in a run (a prior step passed its run ID and run
dir), reuse that run dir — do NOT scaffold a new one; stage the diff and write
`review-verdict.md` under the same `.banyan/runs/<run-id>/` the caller's ledger already
tracks. Otherwise scaffold a run dir, then write the diff into it so the lead reads files,
not prose:

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs review-<slug> \
  --root <repo-root> \
  --objective "<review this change read-only and return a findings report>" \
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
objective:       Review the staged diff for run <run-id> and write a findings report.
                 READ-ONLY: do not edit, fix, or commit.
artifact_path:   .banyan/runs/<run-id>/review-verdict.md
output_format:   Markdown verdict per the review-verdict template: advisory verdict line,
                 actionable findings (also in findings/merged.json), residual/advisory
                 findings, coverage. Nothing applied.
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
boundaries:      READ-ONLY in every scope_mode -- never edit source, apply fixes, run the
                 test suite to validate a fix, commit, push, or open a PR. NEVER touch
                 protected artifacts .banyan/brainstorms, .banyan/plans, .banyan/solutions, or
                 .banyan/runs outside this run's own artifacts. The only writes are the
                 verdict, findings JSON, progress, and lessons-staging under this run.
tool_guidance:   Read, Grep, Glob, read-only Bash (git diff/show/blame/log, gh pr view) to
                 inspect the diff and reproduce a suspicion; Write to its own run artifacts;
                 Agent(...) to spawn its reviewer panel per its own dispatch policy (no
                 finding-owners -- it does not fix).
budget:
  max_children:    16
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

- the advisory verdict line (`Clean` | `Findings: <N actionable>` | `Blocking findings`);
- the **actionable findings** — the to-do list the user can address (also in
  `findings/merged.json`), with `file:line` and why each matters;
- residual / advisory findings (including any dogfood `concern` legs the verifier could not
  drive — "verify manually");
- review coverage (which reviewers ran, and — when the dogfood verifier was in scope —
  whether it drove the app, was skipped (with the reason), or was not run).
- recovery metadata for the user when the verdict carries blocking findings: `blocker_class`,
  `recovery_owner`, `next_safe_action`, and `resume_from_phase`; say `none` when the verdict
  is `Clean`.

Then state explicitly that **the review applied nothing** -- it is read-only, so it edited
no source and made no commit. Addressing the findings is the user's step: fix them manually,
or run `/bn-work` to have the delivery lead drive the fixes. Point the user at
`.banyan/runs/<run-id>/` for the full record (findings, merged findings, ledger).

## Read-only (no permission cliff to cross)

`/bn-review` never edits, fixes, commits, or pushes — there is nothing here that crosses the
permission cliff (invariant 6). The lead returns a findings report; the user (or `/bn-work`)
decides what to act on. This holds in every scope mode and in a background context alike,
because the review writes only its own run artifacts.
