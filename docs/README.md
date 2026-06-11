# docs/

Project documents and the harness's own memory.

- **`brainstorms/`** — founding brainstorm (verbatim session export).
- **`decisions/`** — architecture decision records.
- **`plans/`** — implementation plans (the `YYYY-MM-DD-NNN-<type>-<slug>-plan.md`
  convention with stable U-IDs; `/bn-plan` writes plans in this format).
- **`harness-proposals/`** — evidence-cited improvement proposals written by
  `bn-harness-engineer` (via `/bn-tune`). Proposals are never self-applied; a
  human reviews and merges them.
- **`harness-changelog.md`** — audit log of harness changes: proposals recorded
  by the harness-engineer, applications recorded by humans only.

When Banyan runs against a repository, it also creates (in that repository's
`docs/`):

- **`runs/<run-id>/`** — the per-run ledger: task ledger, progress notes,
  findings, briefs, staged lessons. Spec: `plugin/skills/bn-conventions/references/ledger.md`.
- **`solutions/`** — the durable knowledge store, schema-compatible with
  compound-engineering. Spec: `plugin/skills/bn-conventions/references/knowledge-store.md`.

`brainstorms/`, `plans/`, `solutions/`, and `runs/` are protected artifacts: no
agent may delete or "clean up" files under them (`plugin/AGENTS.md` §5).
