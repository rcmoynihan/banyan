# Edit log — PR-feedback assets (bn-resolve-pr + agents)

The PR-feedback loop ported from `plugins/compound-engineering/`: a trunk skill with
parallel resolver agents. The four gh GraphQL scripts are **verbatim** (no entries
below). The ported files restructure upstream's flat-dispatch model around Banyan's
permission cliff (outward actions at trunk only), envelopes, and artifact contracts.

---

## bn-resolve-pr/SKILL.md (<- skills/ce-resolve-pr-feedback/SKILL.md)

- **Frontmatter:** `name` -> `bn-resolve-pr`; upstream `allowed-tools:` dropped (not a
  Banyan skill field); description names the trunk/foreground constraint.
- **New "The permission cliff" section:** hard split — trunk does fetch/triage/combined
  validation/commit/push/replies/resolves/questions; resolvers do local edits +
  targeted tests only; the skill opens a run ledger because it spawns (invariants 3, 5).
- Default-to-fixing doctrine, Security section, mode-detection table, and success
  criteria preserved; script invocations rewritten to
  `bash ${CLAUDE_PLUGIN_ROOT}/skills/bn-resolve-pr/scripts/<name>` (cwd is the target
  repo, not the plugin).

## bn-resolve-pr/references/full-mode.md (<- references/full-mode.md)

- **New Step 0:** open the run ledger (`new-run.mjs resolve-pr-<n>`); trunk is the
  ledger's single writer; repo validation command detected up front.
- **Step 3:** task list via `TaskCreate` (platform enumeration dropped); adds ledger
  Units rows.
- **Step 4 restructured around invariant 2:** upstream's conflict-avoidance
  ("serialize same-file agents") becomes partition-into-disjoint-file-sets (same-file
  items go to ONE resolver); dispatch is a full BANYAN ENVELOPE block (objective /
  artifact / inputs incl. location fields + isOutdated / boundaries / budget); the
  sequential-platform fallback note dropped.
- **Agent return format replaced by the artifact contract:** resolvers WRITE
  `findings/resolver-<n>.json` (`{resolver, results: [...]}` mirroring
  `bn-finding-owner`'s outcome shape) and return one line; steps 5-9 read the files,
  never prose (invariant 3).
- **Step 9 renamed "Summary and Harvest":** dispatches one `bn-lesson-harvester`
  directly (no lead exists on this run, so the trunk fires the finalization spawn),
  canonical envelope; adds the run-artifacts line to the summary; blocking-tool
  enumeration collapsed to `AskUserQuestion`.
- Triage rules, silent-drop, batching of 4, validation outcomes, commit/push, reply
  formats, thread-ID verification, and the stop-after-2nd-cycle loop limit preserved.

## bn-resolve-pr/references/targeted-mode.md (<- references/targeted-mode.md)

- Adds the run-ledger open before the single-resolver dispatch; the dispatch uses the
  full-mode envelope; closes with the harvest + scaled summary. URL parsing and
  thread-mapping steps preserved.

## bn-pr-comment-resolver.md (<- agents/ce-pr-comment-resolver.md)

- **Frontmatter:** `name` -> `bn-pr-comment-resolver`; added explicit least-privilege
  `tools: Read, Grep, Glob, Bash, Edit, Write` (upstream declared none); `model:
  inherit` kept.
- **New "The envelope you receive" section** (objective/inputs/artifact_path/boundaries/
  budget `{0, inherit, 1}`).
- **Output contract swapped from final-message summary to artifact:** writes
  `findings/resolver-<n>.json` per the results schema; returns ONE line (verdict
  tallies + path).
- **Boundary hardening:** never commit/push/reply/resolve/gh-mutate (upstream implied;
  Banyan states it as a hard wall, twice); "stay inside the envelope's file set" added;
  PR-comment resolvers must state which files they identified (trunk stages by report).
- Rubric, tripwires, outdated-thread relocation, test-scope rule, reply templates, and
  decision_context structure preserved verbatim-in-spirit.

## bn-previous-comments-reviewer.md (<- agents/ce-previous-comments-reviewer.md)

- **Frontmatter:** `name` -> `bn-previous-comments-reviewer`; stray blank line before
  the closing `---` removed; `model: inherit` kept (matches the other conditional
  reviewers); description notes "selected only when reviewing a PR".
- **`<pr-context>` block replaced by envelope inputs** (`pr_number`); the empty-context
  early-return keyed to a missing PR number.
- **"Use the anchored confidence rubric in the subagent template"** -> the
  `schemas/findings-schema.json` (`_meta.confidence_anchors`) reference (same swap as
  the other ported reviewers).
- **Output format replaced with the canonical Banyan REVIEWER block** (artifact_path
  write, `"reviewer": "previous-comments"`, standalone fallback path, one-line verdict
  return, read-only boundary paragraph).
- Hunt list, don't-flag list, and anchor guidance preserved verbatim.

## bn-review-lead.md (Banyan-native file; cross-noted here)

- `Agent(...)` allowlist += `bn-previous-comments-reviewer` (and `bn-custom-reviewer`,
  see AGENTS.md §2.1); Step 2 gains the PR-context spawn-gate conditional and the
  host-persona selection block; Step 3 notes the two persona-specific envelope inputs;
  Step 4 notes reviewer-agnostic merging; Step 7 coverage lists custom personas.

---

## 2026-06-11 — model re-pinned to Opus (invariant 7)

Invariant 7 now pins each agent's model in `model:` frontmatter (Opus by default; Sonnet only
for mechanical leaves) and a lead no longer overrides a child's model at spawn time:

- **bn-pr-comment-resolver:** `inherit` -> `opus` (validity assessment plus local fixes).
- **bn-previous-comments-reviewer:** `inherit` -> `opus` (semantic "was this addressed" judgment).
