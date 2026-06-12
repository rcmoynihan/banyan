# docs/

Project-owned documentation for the Banyan plugin source repo.

- **`brainstorms/`** — founding brainstorm (verbatim session export).
- **`decisions/`** — architecture decision records.
- **`plans/`** — implementation plans (the `YYYY-MM-DD-NNN-<type>-<slug>-plan.md`
  convention with stable U-IDs).
- **`harness-changelog.md`** — human-maintained audit log of applied harness changes.

This repository is itself a Banyan host repo — the plugin is installed here to
develop Banyan. Its Banyan-owned run state, generated derivatives, knowledge store,
harness proposals, and onboarding manifest live under the ignored `.banyan/` root.
Banyan may edit `docs/` for genuine documentation tasks, but Banyan-specific artifacts
do not belong here.
