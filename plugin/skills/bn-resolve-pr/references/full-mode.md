# Full Mode

Read this reference when Mode Detection (in SKILL.md) routes to **Full Mode** — no
argument given, or a PR number was provided. Full mode processes all unresolved threads
on the PR.

Throughout, `<scripts>` means `${CLAUDE_PLUGIN_ROOT}/skills/bn-resolve-pr/scripts`.

## 0. Open the Run Ledger

Resolver agents are spawns, so this run coordinates through a ledger (invariants 3, 5):

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs resolve-pr-<PR_NUMBER> --root <repo-root>
```

Capture the run ID and run dir from the two output lines. Fill `ledger.md`: Objective
("resolve review feedback on PR #N"), plan ref "none -- ad hoc run", and an opening log
line. The trunk is this ledger's **single writer** — resolvers write only their own
`findings/resolver-<n>.json` files. Also detect the repo's validation command now
(project instructions > package.json test script > pytest > cargo test > go test), for
step 5 and for resolver envelopes.

## 1. Fetch Unresolved Threads

If no PR number was provided, detect from the current branch:
```bash
gh pr view --json number -q .number
```

Then fetch all feedback using the GraphQL script:

```bash
bash <scripts>/get-pr-comments PR_NUMBER
```

Returns a JSON object with three keys:

| Key | Contents | Has file/line? | Resolvable? |
|-----|----------|---------------|-------------|
| `review_threads` | Unresolved inline code review threads (includes outdated; each carries its `isOutdated` flag so the resolver can account for line drift) | Yes | Yes (GraphQL) |
| `pr_comments` | Top-level PR conversation comments (excludes PR author) | No | No |
| `review_bodies` | Review submission bodies with non-empty text (excludes PR author) | No | No |

If the script fails, fall back to:
```bash
gh pr view PR_NUMBER --json reviews,comments
gh api repos/{owner}/{repo}/pulls/PR_NUMBER/comments
```

## 2. Triage: Separate New from Pending

Before processing, classify each piece of feedback as **new** or **already handled**.

**Review threads**: Read the thread's comments. If there's a substantive reply that
acknowledges the concern but defers action (e.g., "need to align on this", "going to
think through this", or a reply that presents options without resolving), it's a
**pending decision** -- don't re-process. If there's only the original reviewer
comment(s) with no substantive response, it's **new**.

**PR comments and review bodies**: These have no resolve mechanism, so they reappear on
every run. Apply two filters in order:

1. **Actionability**: Skip items that contain no actionable feedback or questions to
   answer. Examples: review wrapper text ("Here are some automated review
   suggestions..."), approvals ("this looks great!"), status badges ("Validated"), CI
   summaries with no follow-up asks. If there's nothing to fix, answer, or decide, it's
   not actionable -- drop it from the count entirely.
2. **Already replied**: For actionable items, check the PR conversation for an existing
   reply that quotes and addresses the feedback. If a reply already exists, skip. If
   not, it's new.

The distinction is about content, not who posted what. A deferral from a teammate, a
previous skill run, or a manual reply all count. Similarly, actionability is about
content -- bot feedback that requests a specific code change is actionable; a bot's
boilerplate header wrapping those requests is not.

**Silent drop.** Non-actionable items are dropped without narration. Do not announce,
list, or count dropped items in conversation, the task list, or the step 9 summary.
Review-bot wrappers from CodeRabbit, Codex, Gemini Code Assist, and Copilot (bodies like
"Here are some automated review suggestions...") commonly appear here -- recognize them
by their boilerplate content, drop silently. Only CI/status bot summaries (Codecov) are
pre-filtered at the script level; everything else relies on this content-aware check so
bot format changes cannot silently hide actionable findings.

If there are no new items across all feedback types, skip steps 3-8 and go straight to
step 9.

## 3. Plan

Create a task list of all **new** unresolved items (`TaskCreate`) -- one entry per
thread or comment to resolve. Add one `## Units` row per dispatch batch to `ledger.md`.

## 4. Implement (PARALLEL)

Process all three feedback types. Review threads are the primary type; PR comments and
review bodies are secondary but should not be ignored.

### Partition into disjoint file sets (invariant 2)

Group items by the files they touch so that **no two resolver agents share a file**:
items referencing the same file go to ONE resolver, which addresses them sequentially.
PR comments / review bodies without file context get their own resolver each (it
identifies the relevant files from the comment text and the PR diff); if its likely
files overlap another group, merge them.

**Batching**: 1-4 resolver groups → dispatch all in parallel. 5+ → batch in groups of 4.

Fixes can occasionally expand beyond their referenced file (e.g., renaming a method
updates callers elsewhere). Step 5 (combined validation) catches test breakage; step 8
(verify) catches unresolved threads. If either surfaces inconsistent changes from
parallel fixes, re-run the affected resolvers sequentially.

### Dispatch

Spawn one `bn-pr-comment-resolver` per group, **foreground**, with this envelope
(numbering the resolvers 1..N):

```
=== BANYAN ENVELOPE ===
objective:       Evaluate and resolve the assigned PR feedback item(s): fix what holds,
                 divert what doesn't, per your rubric.
artifact_path:   docs/runs/<run-id>/findings/resolver-<n>.json
output_format:   JSON: { "resolver": "resolver-<n>", "results": [ { "verdict",
                 "feedback_id", "feedback_type", "reply_text", "files_changed",
                 "reason", "decision_context"? } ] } -- one entry per assigned item.
inputs:
  pr_number:     <PR_NUMBER>
  test_command:  <repo validation command, or "none detected">
  items:         <for each assigned item: feedback_type (review_thread | pr_comment |
                 review_body), thread/comment ID, file path and location fields (line,
                 originalLine, startLine, originalStartLine -- any can be null),
                 isOutdated flag, and the FULL comment text of the thread>
boundaries:      Edit ONLY this file set: <exact files, or "the files this comment
                 implicates -- identify and state them in your artifact">. Never touch a
                 sibling resolver's files. Never commit, push, reply, resolve threads, or
                 run any gh mutation. Run targeted tests only -- the trunk runs the full
                 suite once. Never touch protected artifacts (docs/brainstorms,
                 docs/plans, docs/solutions, docs/runs except your own artifact_path).
tool_guidance:   Read/Grep/Glob to inspect; Edit to fix; Bash for targeted tests and
                 read-only git; Write only to artifact_path.
budget:
  max_children:    0
  model_tier:      inherit
  depth_remaining: 1
effort_class:    standard
=== END ENVELOPE ===
```

### Resolver verdicts

- `fixed` -- code change made as requested
- `fixed-differently` -- code change made, but with a better approach than suggested
- `replied` -- no code change needed; answered a question, explained a design decision,
  or judged a correct point not worth a change
- `not-addressing` -- feedback is factually wrong about the code; skip with evidence
- `declined` -- observation may be valid, but implementing the suggested fix would
  actively make the code worse; reply cites the specific harm
- `needs-human` -- cannot determine the right action; needs user decision

Each resolver returns ONE line (`fixed 2, replied 1 -> docs/runs/<run-id>/findings/resolver-3.json`).
**Read the artifact files, not the prose** (invariant 3), to drive every later step.

## 5. Validate Combined State

After all resolvers complete, aggregate `files_changed` across every outcome file. If
it's empty -- all verdicts are `replied`, `not-addressing`, `declined`, or `needs-human`
-- skip steps 5 and 6 entirely and proceed to step 7.

Resolvers ran only targeted tests on their own changes. This step runs the project's
full validation **once** against the combined diff to catch cross-agent interactions
that targeted runs can't see.

1. **Run the project's validation command** (from step 0). Run once, not per-agent.
2. **Green** -> proceed to step 6.
3. **Red, failures touch files resolvers changed** -> one inline diagnose-and-fix pass.
   Re-run validation. If still red, escalate with a `needs-human` item containing the
   test output; do **not** commit.
4. **Red, failures touch only files no resolver changed** -> treat as pre-existing.
   Proceed to step 6, but add a footer to the commit message:
   `Note: pre-existing failure in <test> not addressed by this PR.`

Record the validation outcome (command run, pass/fail counts, any pre-existing failures
noted) in `ledger.md`'s log and for the step 9 summary.

## 6. Commit and Push

1. Stage only files reported in resolver outcome artifacts and commit with a message
   referencing the PR:

```bash
git add [files from resolver outcomes]
git commit -m "Address PR review feedback (#PR_NUMBER)

- [list changes from resolver outcomes]"
```

2. Push to remote:
```bash
git push
```

## 7. Reply and Resolve

After the push succeeds, post replies and resolve where applicable. Reply texts come
from the `reply_text` fields in the outcome artifacts. The mechanism depends on the
feedback type.

### Reply format

All replies should quote the relevant part of the original feedback for continuity.
Quote the specific sentence or passage being addressed, not the entire comment if it's
long.

For fixed items:
```markdown
> [quoted relevant part of original feedback]

Addressed: [brief description of the fix]
```

For items not addressed:
```markdown
> [quoted relevant part of original feedback]

Not addressing: [reason with evidence, e.g., "null check already exists at line 85"]
```

For declined items:
```markdown
> [quoted relevant part of original feedback]

Declined: [specific harm cited, e.g., "this would add a defensive null check the type
system already guarantees" or "violates the no-premature-abstraction guidance in
CLAUDE.md"]
```

For `needs-human` verdicts, post the reply but do NOT resolve the thread. Leave it open
for human input.

### Review threads

0. **Verify the thread ID** before replying. GitHub Enterprise can return inconsistent
   node IDs for the same thread depending on the query path. Always confirm the ID from
   `get-pr-comments` resolves to the correct thread:
```bash
# Extract numeric comment ID from the comment URL (e.g. discussion_r2589700 → 2589700)
GH_REPO=OWNER/REPO gh api repos/{owner}/{repo}/pulls/comments/COMMENT_ID --jq .node_id
bash <scripts>/get-thread-for-comment PR_NUMBER COMMENT_NODE_ID OWNER/REPO
```
The returned `id` is the authoritative thread ID to use for reply and resolve. If it
differs from what `get-pr-comments` returned, use the one from this script.

1. **Reply**:
```bash
echo "REPLY_TEXT" | bash <scripts>/reply-to-pr-thread THREAD_ID
```
Check that the returned comment URL contains the correct `OWNER/REPO` and PR number
before proceeding.

2. **Resolve**:
```bash
bash <scripts>/resolve-pr-thread THREAD_ID
```

### PR comments and review bodies

These cannot be resolved via GitHub's API. Reply with a top-level PR comment referencing
the original:

```bash
gh pr comment PR_NUMBER --body "REPLY_TEXT"
```

Include enough quoted context in the reply so the reader can follow which comment is
being addressed without scrolling.

## 8. Verify

Re-fetch feedback to confirm resolution:

```bash
bash <scripts>/get-pr-comments PR_NUMBER
```

The `review_threads` array should be empty (except `needs-human` items).

**If new threads remain**, check the iteration count for this run:

- **First or second fix-verify cycle**: Repeat from step 2 for the remaining threads.
- **After the second fix-verify cycle** (3rd pass would begin): Stop looping. Surface
  remaining issues to the user with context about the recurring pattern: "Multiple
  rounds of feedback on [area/theme] suggest a deeper issue. Here's what we've fixed so
  far and what keeps appearing." Use the same `needs-human` escalation pattern -- leave
  threads open and present the pattern for the user to decide.

PR comments and review bodies have no resolve mechanism, so they will still appear in
the output. Verify they were replied to by checking the PR conversation.

## 9. Summary and Harvest

First, **dispatch the lesson harvester** (there is no lead on this run, so the trunk
fires the finalization spawn itself — background, do not wait on it):

```
=== BANYAN ENVELOPE ===
objective:       Mine this just-finished resolve-pr run's record for genuinely reusable
                 candidate lessons and stage them.
inputs:          Ledger: docs/runs/<run-id>/ledger.md; outcomes dir: docs/runs/<run-id>/findings/
artifact_path:   docs/runs/<run-id>/lessons-staging/
output_format:   0-3 v1-format solution docs (one file per candidate, status: candidate),
                 per knowledge-store.md. Write nothing if no lesson is worth keeping.
boundaries:      Write ONLY under lessons-staging/. Never touch docs/solutions/, source,
                 or protected artifacts.
tool_guidance:   Read/Grep/Glob to mine; Write only to lessons-staging/. No Agent, Bash,
                 or Edit.
budget:
  max_children:    0
  model_tier:      haiku
  depth_remaining: 1
effort_class:    lightweight
=== END ENVELOPE ===
```

Spawn it as `bn-lesson-harvester` with `model: haiku`. Then update `ledger.md` (units
done, closing log line) and present a concise summary of all work done. Group by
verdict, one line per item describing *what was done* not just *where*. This is the
primary output the user sees.

Format:

```
Resolved N of M new items on PR #NUMBER:

Fixed (count): [brief description of each fix]
Fixed differently (count): [what was changed and why the approach differed]
Replied (count): [what questions were answered]
Not addressing (count): [what was skipped and why]
Declined (count): [what was declined and the harm cited]

Validation: [one line -- e.g., "node --test passed (893/893)" or "passed with
pre-existing failure in X noted"; omit when no code changes were committed]
Run artifacts: docs/runs/<run-id>/
```

If any resolver returned `needs-human`, append a decisions section. These are rare but
high-signal. Each `needs-human` result carries a `decision_context` field with a
structured analysis: what the reviewer said, what the resolver investigated, why it
needs a decision, concrete options with tradeoffs, and the resolver's lean if it has
one.

Present the `decision_context` directly -- it's already structured for the user to read
and decide quickly:

```
Needs your input (count):

1. [decision_context from the outcome artifact -- includes quoted feedback,
   investigation findings, why it needs a decision, options with
   tradeoffs, and the recommendation if any]
```

The `needs-human` threads already have a natural-sounding acknowledgment reply posted
and remain open on the PR.

If there are **pending decisions from a previous run** (threads detected in step 2 as
already responded to but still unresolved), surface them after the new work:

```
Still pending from a previous run (count):

1. [Thread path:line] -- [brief description of what's pending]
   Previous reply: [link to the existing reply]
   [Re-present the decision options if the original context is available,
   or summarize what was asked]
```

Use `AskUserQuestion` to ask about all pending decisions (both new `needs-human` and
previous-run pending) together. If there are only pending decisions and no new work was
done, the summary is just the pending items. Never silently skip. After the user
decides, process the remaining items: fix the code, compose the reply, post it, and
resolve the thread. If the user doesn't respond, the items remain open on the PR for
later handling.
