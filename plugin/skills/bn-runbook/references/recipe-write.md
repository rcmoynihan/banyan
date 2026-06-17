# Approval-gated recipe write + last-validated marker

This reference is SKILL Step 5: write the validator-passing recipe block into `AGENTS.md`/`CLAUDE.md`
behind an explicit approval gate, stamped with the last-validated marker, after running the
validator on the drafted block — replacing exactly one existing block in place on re-run and
STOPping on duplicates.

## The recipe block form (R21)

The recipe is embedded as **HTML-comment sentinels around a fenced JSON payload**, one block per
instruction file:

````text
<!-- bn-drive-recipe v1 -->
```json
{ ...the recipe object... }
```
<!-- /bn-drive-recipe -->
````

This is the exact shape `extractRecipeBlock` locates and `validate-drive-recipe.mjs` parses. It is
human-skimmable (a reader sees the sentinels) and machine-parseable (the validator reads the fenced
JSON). The JSON object carries `recipe_schema_version` (R20), the `last_validated` marker (R10), and
the `paths[]` array assembled from the Step 2 tiers and the Step 3 proven/declared statuses.

The opening sentinel's version marker (`v1`) and the JSON's `recipe_schema_version` must agree; the
validator degrades to `unknown-version` (fail-closed) on either mismatch.

## last_validated marker (R10)

Stamp the `last_validated` object so a reader can judge the recipe's age:

- `run_id` — the `/bn-runbook` run id bound in SKILL Step 0.
- `commit` — `git rev-parse HEAD`, the repo state the `proven` legs were validated against.
- `validated_at` — the ISO-8601 date-time of this validation pass.

Consumers do **not** drift-check; this marker is the only freshness signal, refreshed solely by
re-running `/bn-runbook`.

## Target file (R23)

- When **both** `AGENTS.md` and `CLAUDE.md` exist, write to **`AGENTS.md`** — the file
  `bn-dogfood-verifier` Step 0 probes first.
- When only one exists, write to that one.
- When **neither** exists, the approval gate also asks which to create.

## Validate before the gate (fail-closed at the source)

Run the shared validator on the **candidate file** — the target file with the new block merged in
per the re-run-safety branch below — and **refuse to present a block that fails it**:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/validate-drive-recipe.mjs <candidate-file>
```

Validate what *would be written* (the candidate with exactly one block), not the existing file plus
a loose draft — the latter would itself read as `blockCount == 2` and fail closed as `duplicate`. A
`usable` result clears the gate; any fail-closed status (`invalid`, `unknown-version`, `duplicate`,
`no-recipe`) means do not present the block — fix the draft and re-validate. The producer never
offers a block a consumer would reject. This is the same `usable`/`invalid` boundary U2's
`node --test` asserts, reused here as a write-side guard.

## Re-run write safety (R22)

First locate the existing block(s) with `extractRecipeBlock` and branch on `blockCount` to choose
the write shape (this decides how the candidate file above is assembled):

- **`blockCount == 1`** — replace that single block **in place** (preserve surrounding instruction
  prose; do not silently rewrite other sections).
- **`blockCount == 0`** — **append** a new block after approval.
- **`blockCount >= 2`** — **STOP** and surface the ambiguity. Do **not** guess which block to
  replace. This is the same `duplicate` fail-closed branch the validator returns, reused as a
  write-side guard: a file with two recipe blocks is already in a state a consumer fails closed on,
  so the producer refuses to add a third or pick one.

Every write path is behind the approval gate — there is no silent or unattended write.

## The approval gate (mirrors /bn-onboard Phase 4)

1. For an existing instruction file, prepare an **additions-only merge diff** (the recipe block
   inserted/replaced); for an absent file, prepare a full draft.
2. **`AskUserQuestion` per file:** write / write-with-edits / skip. Write **only** after explicit
   approval; a declined file is left untouched.
3. In a runtime **without** `AskUserQuestion`, stop and wait for an explicit answer in chat — never
   auto-write, never auto-suffix, never silently skip the gate.

## What the U6 approval gate ratifies

The embedding decisions this write implements are pre-ratified by the user and confirmed at this
approval gate: the **HTML-comment-sentinel + fenced-JSON embedding** over a sidecar file or a YAML
block (R21); **single-block in-place replacement** with append-if-zero and STOP-on-duplicate (R22);
and **`AGENTS.md` target precedence** when both instruction files exist (R23). Presenting the block
at this gate is where those choices are confirmed against the actual repo before anything is written.
