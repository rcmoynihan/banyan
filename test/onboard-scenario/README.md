# Onboard-subtree verification scenario

This is a standalone planted fixture for a repo-onboarding run that harvests
existing project knowledge without rewriting the source artifacts. Exclude this
README when copying the scenario into a scratch live run; it is the answer key.

## Expected result

- Manifest rows: 6 total.
- Transformed/staged rows: 5.
- Skipped rows: 1, `docs/api/generated/openapi.md`, because its first line is a
  generated-file marker.
- Staged solution candidates: 4.
  - `docs/adr/0001-use-sqlite.md` -> knowledge-track tooling decision.
  - `docs/adr/0002-move-to-postgres.md` -> knowledge-track tooling decision,
    with `0001-use-sqlite` recorded as superseded.
  - `docs/postmortems/2025-03-14-checkout-outage.md` -> bug-track incident
    candidate with symptoms, `logic_error`, and `code_fix` derivable.
  - `docs/runbooks/rotate-api-keys.md` -> knowledge-track best-practice workflow.
- Brainstorm derivatives: 1, `docs/product/checkout-prd.md`.
- Source documents are not edited in place.
- `CLAUDE.md` lacks knowledge-store discoverability and has only two existing
  conventions, so the run should propose a merge/diff rather than silently
  writing the instruction-file edit.
- A second run over the same already-staged output should be a no-op.

## Fixture app

The app is deliberately trivial. `npm test` runs `node --test` and should pass.
