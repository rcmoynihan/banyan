# Edit log — lifecycle skills (bn-commit, bn-ship)

Two trunk-level lifecycle skills ported from `plugins/compound-engineering/skills/`.
The git/PR workflow doctrine is preserved; the edits remove multi-platform plumbing,
swap the evidence-capture dispatch for a direct user question, and anchor the skills to
Banyan's permission cliff (invariant 6).

---

## bn-commit/SKILL.md (<- skills/ce-commit/SKILL.md)

- **Frontmatter:** `name` -> `bn-commit`; added `argument-hint` (Banyan skill contract);
  description quoted.
- **Platform stripping:** removed the "On platforms other than Claude Code" routing and
  the entire "Context fallback" section; the multi-platform blocking-question-tool
  enumeration (Codex/Gemini/Pi) collapsed to `AskUserQuestion`. The `!`-prefixed
  dynamic-context blocks are kept.
- **Banyan framing paragraph added:** trunk-level/foreground, zero spawns, no run
  ledger; commit in scope, push belongs to `/bn-ship`; never invoked inside a subtree
  (subtree commits are owned by `bn-review-lead`/`bn-integrator`); names this skill the
  shared commit doctrine `/bn-ship` references.
- **Step 5:** added the closing do-not-push pointer to `/bn-ship`.
- Workflow Steps 1-4 (context, convention priority, fix-over-feat default, file-level
  logical commits, named-file staging, heredoc commit) preserved verbatim-in-spirit.

## bn-ship/SKILL.md (<- skills/ce-commit-push-pr/SKILL.md)

- **Frontmatter:** `name` -> `bn-ship`; added `argument-hint`; description gains the
  "including after /bn-grow's ship gate" trigger.
- **New "The permission cliff" section:** bn-ship is the ONE place in Banyan allowed to
  push or open a PR; trunk/foreground only; stops and reports if running where prompts
  auto-deny; zero spawns, no run ledger.
- **Platform stripping:** same as bn-commit ("Asking the user" reduced to
  `AskUserQuestion`; context fallback removed; `!` blocks kept).
- **Step 2 + Step 3 commit doctrine de-duplicated:** convention matching and logical
  commits now point at `${CLAUDE_PLUGIN_ROOT}/skills/bn-commit/SKILL.md` Steps 2-4
  instead of restating them; ship-specific parts (branch-creation flow trigger,
  `git push -u origin HEAD`, clean-tree no-op) kept inline.
- **Step 4 evidence decision:** the `ce-demo-reel` capture dispatch removed. Kept the
  two short-circuits (user-supplied evidence; non-observable authored change skips
  silently); otherwise asks the user via `AskUserQuestion` to provide a URL/markdown
  embed (spliced as `## Demo`) or skip. No capture agent exists in Banyan.
- **Stale pointer fixed:** "Steps A through G" -> "Steps Pre-A through D" (the reference
  file's actual step set at the pinned SHA).
- **Temp-file naming:** `ce-pr-body.XXXXXX` -> `bn-pr-body.XXXXXX`; heredoc sentinel
  `__CE_PR_BODY_END__` -> `__BN_PR_BODY_END__`.
- Modes (full / description-only / description-update), Step 1 branch routing, Step 5
  apply/report flow, and the `--body-file` rule preserved.

## bn-ship/references/branch-creation.md (<- ce-commit-push-pr/references/branch-creation.md)

- **Stash message prefix:** `ce-commit-push-pr:` -> `bn-ship:`.
- Decision flow otherwise verbatim.

## bn-ship/references/pr-description-writing.md (<- ce-commit-push-pr/references/pr-description-writing.md)

- **Step D badge genericized:** the mandatory Compound Engineering badge block and the
  branded harness/logo/color table replaced with one optional, generic line ("append a
  harness/model badge if the repo's PRs carry one; otherwise omit"); the
  URL-encode-parens warning (release-please breakage) kept.
- **Step C:** "Compound Engineering badge" -> "optional badge"; evidence handling now
  references the user-supplied URL/embed (no capture-agent return shape).
- **Core-principle example:** dropped the upstream-specific file name from the "Bad"
  example.
- Steps Pre-A, A, B and the sizing table, title rules, GitHub gotchas, fork/GHES
  fallbacks preserved verbatim.
