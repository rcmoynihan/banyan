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

This repository is itself a Banyan host repo — the plugin is installed here to
develop Banyan — so the runtime directories below appear alongside the project
documents above. `/bn-brainstorm` and `/bn-plan` write new documents into
`brainstorms/` and `plans/` beside the founding ones; that is by design. When
Banyan runs against any repository, it creates (in that repository's `docs/`):

- **`runs/<run-id>/`** — the per-run ledger: task ledger, progress notes,
  findings, briefs, direct-work specs, staged lessons. Spec:
  `plugin/skills/bn-conventions/references/ledger.md`.
- **`solutions/`** — the durable knowledge store, schema-compatible with
  compound-engineering. Spec: `plugin/skills/bn-conventions/references/knowledge-store.md`.

`brainstorms/`, `plans/`, `solutions/`, and `runs/` are protected artifacts: no
agent may delete or "clean up" files under them (`plugin/AGENTS.md` §5).
