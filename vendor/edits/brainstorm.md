# Edit log — brainstorm skill (bn-brainstorm)

`ce-brainstorm` ported as Banyan's ideation entry point. The dialogue methodology
(core principles, interaction rules, rigor probes, synthesis gate, section contract) is
preserved; the edits remove the HTML output mode and Every-stack integrations, and swap
the handoffs to Banyan skills. `references/html-rendering.md` is **not vendored**
(markdown is the only output format).

---

## bn-brainstorm/SKILL.md (<- skills/ce-brainstorm/SKILL.md)

- **Frontmatter:** `name` -> `bn-brainstorm`; `argument-hint` drops the `[output:html]`
  token; description quoted.
- **Banyan framing added:** trunk-level dialogue skill; pure-dialogue runs spawn nothing
  and open no ledger; `.banyan/brainstorms/` named as a protected artifact family
  (AGENTS.md §5).
- **Phase 0.0 collapsed:** output is always markdown. The `output:` token parsing, the
  `.compound-engineering/config.local.yaml` pre-read, the unknown-value note, the
  token-parsing convention, and the LFG/`disable-model-invocation` pipeline override are
  all removed. Phase 0.1 resume drops its format-preservation clause (`.md` only).
- **Phase 1.1 Slack block replaced with research grounding:** opt-in only; offers
  `bn-research-lead`; on acceptance the run ledger opens lazily
  (`new-run.mjs brainstorm-<slug>`), the lead is spawned foreground with a standard
  envelope (`briefs/research-brief.md`, budget `{6, sonnet, 3}`), the brief is READ, and
  its path is noted in the requirements doc for `/bn-plan` reuse.
- **Handoffs swapped:** `ce-plan` -> `/bn-plan`, `ce-work` -> `/bn-work`; vocabulary
  capture's "creation is owned by ce-compound and ce-compound-refresh" -> "this skill
  does not create it"; Phase 3's downstream-flow list names `/bn-plan`.
- **Blocking-question-tool enumeration** (Codex/Gemini/Pi) collapsed to
  `AskUserQuestion` in the Interaction Rules and Phase 1.3.
- Phases 0.1b-2.5 (domain routing, scope tiers, pressure-test gap lenses, dialogue
  rules, approach exploration, synthesis gate) and the "current year is 2026" note
  preserved verbatim-in-spirit.

## references/brainstorm-sections.md

- Global rename `ce-plan` -> `bn-plan`, `ce-brainstorm` -> `bn-brainstorm`.
- HTML strip: intro now points only at `markdown-rendering.md`; metadata section drops
  the HTML `<dl>` rendering note; filename contract -> `...-requirements.md`; the
  closing "Rendering" section reduced to the markdown reference.
- `ce-doc-review` mentions removed (success-criteria example -> "the planner"; the
  no-status-field consumer list -> `bn-plan` only).
- Section catalog, hard floor, ID conventions, prose-economy discipline preserved.

## references/synthesis-summary.md

- Global rename only (`ce-plan`/`ce-work`/`ce-debug`/`ce-brainstorm` -> bn equivalents;
  `/bn-debug` exists in Banyan, so the self-redirect example survives intact).

## references/markdown-rendering.md

- Two HTML cross-references removed ("defer it to the HTML rendering" -> "drop it";
  "the richer visualization happens in the HTML rendering" sentence dropped). Otherwise
  verbatim.

## references/universal-brainstorming.md

- Global rename; wrap-up menu drops the "Open in Proof" option (Every's Proof editor);
  blocking-tool enumeration collapsed to `AskUserQuestion`.

## references/handoff.md (heavy rewrite)

- Menu reduced to four options: **Plan with `/bn-plan`** (recommended; gated on empty
  Resolve-Before-Planning), **Build now with `/bn-work`** (direct-to-work gate kept),
  **Keep refining**, **Done for now**.
- Removed: `ce-doc-review` agent review (+ post-review nudge), both Proof options and
  the whole Proof HITL return-status protocol, "Open in browser" (HTML mode), the
  5+-option numbered-list overflow rule (≤4 options -> always `AskUserQuestion`).
- Added: a Compounding note (lessons flow through staged harvest + `/bn-curate`, no
  capture step in this skill) and a simplified closing-summary template (markdown path
  only).
