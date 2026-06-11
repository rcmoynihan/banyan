# Onboarding Manifest

`docs/onboarding-manifest.md` is the stable repository-level record for `/bn-onboard`.
It is human-reviewable in a PR and cheap to load with one read. It lives outside
`docs/runs/<run-id>/` because reruns compare current sources against the last onboarded
state.

The `/bn-onboard` trunk is the single writer. Surveyors and transformers report outcomes
under `docs/runs/<run-id>/findings/`; the trunk folds those artifacts into the manifest.

## Header

The manifest starts with these comments:

```markdown
<!-- managed-by: /bn-onboard -->
<!-- last-run: <run-id> -->
```

`managed-by: /bn-onboard` is the idempotency marker. `last-run` is the most recent run
that wrote the manifest.

## Table

Use one row per source.

```markdown
| source | sha256 (12-hex prefix) | classification | derivative | status |
|---|---|---|---|---|
| docs/adr/0001-example.md | a1b2c3d4e5f6 | solution-knowledge:tooling_decision | docs/runs/<run-id>/lessons-staging/example.md | staged |
```

Column rules:

- `source`: repo-relative path to the original source.
- `sha256 (12-hex prefix)`: first 12 lowercase hex characters of the source SHA-256.
- `classification`: family plus useful subtype, such as
  `solution-bug:runtime_error`, `solution-knowledge:architecture_pattern`,
  `brainstorm`, `persona`, `instruction-source`, or `skip`.
- `derivative`: repo-relative derivative path, source-linked existing path, or empty when
  no derivative exists.
- `status`: one status value from the enum below. For skipped rows, include the reason in
  the status cell as `skipped: <reason>`.

## Status Enum

| status | meaning |
|---|---|
| `staged` | A solution candidate remains in `docs/runs/<run-id>/lessons-staging/`. |
| `promoted` | The curator promoted the candidate into `docs/solutions/`; `derivative` names the promoted path. |
| `merged` | The curator merged the candidate into an existing `docs/solutions/` doc; `derivative` names that doc. |
| `transformed` | A non-solution derivative was written, such as a brainstorm or persona. |
| `skipped: <reason>` | The source matched a skip or uncertainty rule. |
| `deferred` | Deep-mode corpus cap deferred the source. |
| `source-removed` | The source is no longer present; derivative is kept and flagged in the report. |
| `superseded` | The source changed and was re-derived; the row carries the new hash and current derivative. |

## Re-run Algorithm

1. Read `docs/onboarding-manifest.md` if it exists.
2. Discover the current corpus with the `/bn-onboard` discovery rules.
3. Compute the 12-hex SHA-256 prefix for each current source.
4. For a source whose hash equals the manifest row, do no work for that source.
5. For a source whose hash differs, reclassify and re-derive it. Solution-track sources
   are staged again; the curator's five-dimension dedup absorbs replacements or merges.
   Update the existing row in place and mark it `superseded` when the prior derivative
   remains relevant.
6. For a new source, run the full classify, gate, transform, harvest, and curate pipeline.
7. For a source that no longer exists, keep the derivative and update the row to
   `source-removed`; the onboarding report lists it for human review.
8. Rows are updated in place. Do not append duplicate rows for the same source.

When the corpus is empty after filtering, report `no changes since last onboard`, stop,
and do not open a run. If no manifest exists, there is no source-to-derivative state to
write.
