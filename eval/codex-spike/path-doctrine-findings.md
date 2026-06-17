# Codex path-resolution and doctrine-delivery findings (U4)

**Status:** `UNVERIFIED (doc-only, evidence-cited)`. This is a design-capture spike, not a live
Codex run. Every Codex-side capability claim below is grounded in the proven PoC evidence
(`.banyan/runs/2026-06-17-001-plan-codex-port/briefs/poc-notes.md`, codex-cli 0.139.0), in shipped
compound-engineering (CE) precedent, in a `developers.openai.com` doc, or is tagged `[assumed]`
with a confirm-by clause (DI4). No Codex surface is invented.

This unit answers plan U4 (requirements R5, R8, R17): name the concrete Codex path mechanism that
replaces every `${CLAUDE_PLUGIN_ROOT}` usage class, and the doctrine-delivery model. It feeds the
U6 generator's rewrite rule and the U5 parity-gap register.

---

## Part 1 — Path resolution: the `${CLAUDE_PLUGIN_ROOT}` usage map

### 1.1 What `${CLAUDE_PLUGIN_ROOT}` is on Claude Code

`${CLAUDE_PLUGIN_ROOT}` is a Claude-Code-injected environment variable that resolves, at runtime,
to the installed plugin's root directory. Banyan uses it as the single anchor for *every*
cross-file reference inside the shipped `plugin/` tree: a SKILL or agent body that needs to point a
child at a doctrine file, run a deterministic node script, or wire a hook never hard-codes an
install path — it writes `${CLAUDE_PLUGIN_ROOT}/...`. This is the load-bearing
Claude-Code-specific path mechanism the Codex render must rewrite (R8).

### 1.2 Live count (R8)

| Metric | Plan-time (R8) | Live on this branch | Note |
|---|---|---|---|
| Files containing `${CLAUDE_PLUGIN_ROOT}` | 48 | **50** | `grep -rl 'CLAUDE_PLUGIN_ROOT' plugin/ \| wc -l` |
| Total occurrences | not stated | **295** | `grep -ro 'CLAUDE_PLUGIN_ROOT' plugin/ \| wc -l` |

The +2 file delta over R8's plan-time 48 is a normal source-drift fact, not a contradiction: the
generator (U6) rewrites whatever count is live at render time, and the drift gate (U7) catches any
un-regenerated `plugin/` edit. **No parity claim is keyed to the literal number 48.** The
rewrite rule below is count-agnostic — it transforms by usage class, not by enumerating 48 sites.

### 1.3 The usage CLASSES (the U6 rewrite map)

The 50 files partition into six usage classes by *what the path points at* and *who consumes the
resolved path*. The 50-file count is exact and the classes are mutually exclusive (17+23+7+1+1+1).

| # | Usage class | Files | What the reference points at | Consumer | Rewrite target (Part 1.4) |
|---|---|---|---|---|---|
| C1 | **Doctrine references in SKILL.md** | 17 SKILL.md | `${CLAUDE_PLUGIN_ROOT}/AGENTS.md`, `.../references/*.md`, one `.../schemas/*.json` (`bn-runbook/SKILL.md:39`) | prompt text read by the agent running the skill | path-string rewrite |
| C2 | **Doctrine/script references in lead + leaf agent bodies** | 23 `plugin/agents/*.md` | `${CLAUDE_PLUGIN_ROOT}/AGENTS.md`, `.../references/*.md`, `.../scripts/*.mjs` named in `doctrine`/`tool_guidance` envelope fields | prompt text the agent emits into its children's envelopes | path-string rewrite |
| C3 | **Doctrine references inside skill `references/*.md`** | 7 (`bn-conventions/references/{envelope,knowledge-store,ledger}.md` (3); `bn-evolve/references/message-grading-rubric.md` (1); `bn-resolve-pr/references/{full-mode,targeted-mode}.md` (2); `bn-runbook/references/recipe-write.md` (1)) | sibling doctrine/reference docs and scripts | prompt text read when a reference is loaded | path-string rewrite |
| C4 | **The doctrine root itself** | 1 (`plugin/AGENTS.md`) | self-relative pointers to `${CLAUDE_PLUGIN_ROOT}/skills/...` scripts/references | prompt text read when AGENTS.md is loaded as doctrine | path-string rewrite |
| C5 | **The one hook command** | 1 (`plugin/hooks/hooks.json:9`) | `node "${CLAUDE_PLUGIN_ROOT}/hooks/invoked-procedure-consent.mjs"` — a shell command the runtime executes | the host runtime's hook executor | host-config rewrite OR documented gap (R10/R18) |
| C6 | **The one test assertion** | 1 (`plugin/skills/bn-conventions/scripts/recovery-contract.test.mjs:34`) | a regex asserting `doctrine: ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,` appears in a generated envelope | `node --test` (host-neutral, runs on both) | the test is **source**, not rewritten — see 1.5 |

All occurrences resolve into exactly three *target kinds*: **doctrine/reference markdown**
(`AGENTS.md`, `references/*.md`, one `schemas/*.json`), **deterministic node/py scripts**
(`scripts/*.mjs`, `validate-frontmatter.py`), and **the hook command**. C1–C4 are the
markdown+script string class; C5 is the hook command class; C6 is the test that *asserts the
string shape* and so is a source artifact the generator must account for, not a path to rewrite.

### 1.4 The concrete Codex path mechanism that replaces each class

**Replacement anchor (the named mechanism): a Codex install-root path, not an injected variable.**
Codex exposes no documented `${CLAUDE_PLUGIN_ROOT}`-equivalent injected env var
(`[assumed — no such variable]`; confirm-by: search the codex-cli env/skills docs for a
plugin-root variable). What Codex *does* provide is a **deterministic install location** for a
plugin's skills, established by shipped CE precedent: Codex skills isolate under
**`~/.codex/skills/<plugin>/`** — for Banyan, `~/.codex/skills/banyan/` (CE README; corroborated by
plan F2 / U8). More generally the install root is `$CODEX_HOME/skills/<plugin>/` where `CODEX_HOME`
defaults to `~/.codex` and the install threads a single `CODEX_HOME` through every step (plan U8,
R22). This directory is the Codex analog of the plugin root.

The rewrite rule for U6, per class:

- **C1–C4 (doctrine/reference/script string references):** rewrite `${CLAUDE_PLUGIN_ROOT}/<rest>`
  to a path rooted at the Codex skills install root. Two candidate forms, in order of preference:
  1. **Skill-relative discovery** — Codex skills are a directory carrying `SKILL.md` plus optional
     `scripts/`, `references/`, `assets/` (https://developers.openai.com/codex/skills; plan R14).
     A reference *inside a skill* (C1, C3) resolves relative to that skill's own directory
     (`references/foo.md` → the skill's `references/foo.md`), which is the natural Codex idiom and
     needs no absolute anchor. `[assumed — skill-relative `references/` discovery resolves from the
     skill dir]`; confirm-by: the skills doc's statement of how a `SKILL.md` addresses its own
     `references/`/`scripts/` siblings.
  2. **Absolute install-root path** — for cross-skill references and for the shared
     `bn-conventions` doctrine that agents in *other* skills point at (C2, C4, and cross-skill C1),
     rewrite to the resolved `~/.codex/skills/banyan/<rest>` (or `$CODEX_HOME/skills/banyan/<rest>`)
     install root. This is the only form that works when the reader is an agent body, not a skill
     loader. CE precedent (`~/.codex/skills/<plugin>/` isolation) is the grounding for this root.

  **The U6 rewrite is therefore class-aware:** within-skill references prefer the skill-relative
  form; the shared `bn-conventions` doctrine + cross-skill + agent-body references take the absolute
  `~/.codex/skills/banyan/...` form. Both replace `${CLAUDE_PLUGIN_ROOT}/` as the literal token.

- **C5 (the hook command):** Codex exposes **no confirmed `UserPromptSubmit`-class hook surface**
  (plan R10/R18, `[assumed — no Codex hook analog]`; confirm-by: U3 allowlist/hook spike + the
  codex-cli config docs). The U6 rewrite for this class is therefore **NOT a path rewrite at all** —
  the single best-effort consent reminder folds into Codex `AGENTS.md` doctrine (the prompt-level
  fallback Banyan already relies on for the allowlist; AGENTS.md §2 empirical caveat). If a Codex
  hook surface *is* later found, the command rewrites to `node <install-root>/hooks/...`; until
  then it is a **documented parity gap (AMBER)** carried into the U5 register.

- **C6 (the test assertion):** the deterministic node scripts are host-neutral, zero-dep `node:*`
  (plan R11), so `recovery-contract.test.mjs` runs unchanged on both hosts as part of the shared
  `node --test` spine. Its regex asserts the *Claude Code* doctrine-string shape
  (`${CLAUDE_PLUGIN_ROOT}/AGENTS.md,`). Because U6 renders the Codex tree *from* the Claude source
  and the Claude source is byte-unchanged (DI1), this test keeps asserting the Claude render and is
  **not** rewritten. The Codex render's equivalent string shape is asserted by U6's own
  `render-codex.test.mjs` golden fixture (the injection-payload assertion), not by editing this
  shipped test. **Implication for U6:** the generator must not touch `recovery-contract.test.mjs`
  (it is `plugin/**` source); the Codex-side string-shape conformance is a *new* assertion in the
  generator's test, keyed to the rewritten anchor.

### 1.5 Summary rewrite map for U6

```
${CLAUDE_PLUGIN_ROOT}/AGENTS.md            -> ~/.codex/skills/banyan/AGENTS.md            (or skill-relative for within-skill)
${CLAUDE_PLUGIN_ROOT}/skills/.../*.md      -> ~/.codex/skills/banyan/skills/.../*.md      (cross-skill: absolute; in-skill: references/*.md)
${CLAUDE_PLUGIN_ROOT}/skills/.../*.mjs     -> ~/.codex/skills/banyan/skills/.../*.mjs     (node scripts ship under the skill dir)
${CLAUDE_PLUGIN_ROOT}/skills/.../*.py      -> ~/.codex/skills/banyan/skills/.../*.py      (e.g. validate-frontmatter.py; same script-path class as .mjs)
${CLAUDE_PLUGIN_ROOT}/schemas/*.json       -> ~/.codex/skills/banyan/schemas/*.json
node "${CLAUDE_PLUGIN_ROOT}/hooks/*.mjs"   -> [no Codex hook surface] -> fold consent reminder into AGENTS.md doctrine (R10/R18 gap)
recovery-contract.test.mjs (asserts CC shape) -> unchanged source; Codex shape asserted in render-codex.test.mjs
```

The exact install root token (`~/.codex/skills/banyan/` vs `$CODEX_HOME/skills/banyan/` vs a
skill-relative form) is the **one decision U6 commits**; this spike establishes that the anchor is
the Codex skills install root, grounded in CE precedent, and that it is a deterministic
directory rather than a runtime-injected variable.

---

## Part 2 — Doctrine delivery: AGENTS.md auto-load vs explicit envelope routing

### 2.1 The Claude Code model Banyan deliberately built on

On Claude Code, Banyan's `plugin/AGENTS.md` is **never auto-loaded** into an agent's context. A
child receives doctrine only when its parent names a resolved path in the envelope's `doctrine`
field (`plugin/skills/bn-conventions/references/envelope.md`, the `doctrine` field row and honoring
contract (e)). This is a deliberate design choice: doctrine delivery is *explicit and bounded* —
a child's context carries exactly the doctrine its envelope routes to it, nothing more. The
envelope contract states the load-bearing rule: `${CLAUDE_PLUGIN_ROOT}/AGENTS.md` is Banyan's
shipped runtime doctrine, and a bare `AGENTS.md` would point at the *host repo's* instructions, not
Banyan's. (Note: in *this* host repo, `CLAUDE.md` is a shim that includes the root `AGENTS.md`
authoring contract — distinct from `plugin/AGENTS.md`, the shipped doctrine.)

### 2.2 The Codex model (R17): native, assumed auto-loaded AGENTS.md

Codex natively supports an `AGENTS.md` file. **`[assumed — Codex `AGENTS.md` is auto-loaded into
the session context]`** (plan R17; confirm-by: the codex-cli docs' statement of `AGENTS.md`
discovery/auto-load scope and whether spawned subagents inherit it). The PoC did **not** bear on
this — the recursion/fan-out spike used `developer_instructions` injection exclusively and did not
probe `AGENTS.md` auto-load (`poc-notes.md` must-not-be-inferred (d): path/doctrine gap unresolved).

If that assumption holds, the delivery model **changes shape** relative to Claude Code:

- **Auto-load vs explicit routing.** Where Banyan today must *route* doctrine via the `doctrine`
  envelope field, a natively-auto-loaded Codex `AGENTS.md` would place doctrine into context
  *without* explicit routing. This is additive, not conflicting, for the *trunk/root* session: the
  root `codex exec` session would auto-load the repo's `AGENTS.md`.

- **Do subagents inherit the parent's AGENTS.md context?** This is the load-bearing open question
  for the recursive org-chart. **`[assumed — uncertain; two candidate behaviors]`**:
  1. **Inherit-by-context:** if a spawned Codex thread inherits the parent's loaded context
     (including auto-loaded `AGENTS.md`), doctrine reaches children for free and the explicit
     `doctrine` field becomes belt-and-suspenders. **But the PoC evidence cuts against full
     context inheritance:** `spawn_agent` creates a *new child thread with its own session rollout*
     (`poc-notes.md`: "a parent thread per level; `spawn_agent` creates a NEW child thread (own
     session rollout)"), and the child received its role **only** because the parent injected
     `developer_instructions` into the spawn `message`. A new thread that needed its role injected
     is unlikely to have silently inherited the full parent context.
  2. **Re-discover-by-cwd:** if a Codex subagent thread runs with the same working directory, it may
     itself auto-discover and load the repo `AGENTS.md` independently (not "inherit" the parent's
     loaded copy, but re-load from disk). Confirm-by: probe whether a spawned thread's context
     contains `AGENTS.md` content with no explicit injection.

  **Conclusion for the design (the answer R17 asks for):** Banyan **must not rely on inheritance**.
  Doctrine delivery to a Codex child is realized by the **same instruction-injection mechanism the
  PoC proved** (R15): the parent injects the doctrine (or the resolved doctrine path) into the child
  spawn's `developer_instructions`/`message`, exactly as it injects the role. This is the faithful
  port of the explicit-`doctrine`-field model and is **proven realizable** (the PoC injected role
  instructions into `default` spawns and the chain ran to depth 3).

### 2.3 Does AGENTS.md auto-load ADD to or CONFLICT with injection?

**It adds, with one caveat to manage; it does not fundamentally conflict.**

- **Adds:** at the trunk/root, an auto-loaded Codex `AGENTS.md` gives the root session Banyan
  doctrine without the trunk having to route it — a convenience the Claude Code model lacks. The
  generated Codex `AGENTS.md` (U6 emits one from `plugin/AGENTS.md`) is the natural home for the
  consent-reminder doctrine that the absent hook (C5) can no longer deliver, and for the
  prompt-level allowlist discipline (R18). Auto-load makes that doctrine reliably present at the
  trunk.

- **Caveat (not a hard conflict):** auto-load is *broad* where Banyan's model is *bounded*. Banyan's
  explicit routing deliberately keeps a child's context scoped to exactly its envelope doctrine
  (envelope.md: "a child's context scales with the questions it answers, never with the work done
  below it"). If Codex auto-loads a large repo `AGENTS.md` into every session, it loosens that
  scoping. This is a *context-budget* concern, not a correctness conflict — the injected
  `developer_instructions` remain the authoritative, bounded role+doctrine payload, and an
  auto-loaded `AGENTS.md` is at worst redundant context. The U6/U5 design should: (a) keep the
  generated Codex `AGENTS.md` lean (doctrine essentials, not the full reference corpus), and
  (b) treat injection — not auto-load — as the *guaranteed* delivery path, with auto-load as an
  additive backstop at the trunk. **No conflict requiring a design change; one context-hygiene note
  for U6.**

### 2.4 Delivery-model statement (the deliverable)

> **Codex doctrine-delivery model:** Doctrine reaches a Codex subagent by **instruction-injection**
> — the parent injects the resolved doctrine (or its `~/.codex/skills/banyan/...` path) into the
> child spawn's `developer_instructions`/`message`, the faithful port of Banyan's explicit
> `doctrine`-field routing (R15, PoC-proven). A natively auto-loaded Codex `AGENTS.md` (R17,
> `[assumed]`) is an **additive backstop at the trunk**, not the guaranteed mechanism: subagent
> context inheritance is unconfirmed and the PoC's new-thread-per-spawn evidence argues against
> relying on it. The generated Codex `AGENTS.md` (from `plugin/AGENTS.md`) also absorbs the
> consent-reminder doctrine that the absent hook surface (C5) can no longer deliver. Confirm-by: the
> codex-cli `AGENTS.md` auto-load + subagent-inheritance docs (R17), and the U3 hook spike (C5).

---

## Part 3 — What feeds downstream

- **To U6 (generator rewrite rule):** the Part 1.5 rewrite map — class-aware replacement of
  `${CLAUDE_PLUGIN_ROOT}/` with the `~/.codex/skills/banyan/` install-root anchor (or skill-relative
  form for within-skill references); the hook command (C5) folds to `AGENTS.md` doctrine, not a
  path; `recovery-contract.test.mjs` (C6) is untouched source, its Codex-shape analog asserted in
  the generator's own test.
- **To U5 (parity-gap register):** the **hook-surface gap** (C5: no Codex `UserPromptSubmit` analog
  → consent reminder degrades to `AGENTS.md` doctrine, AMBER) and the **doctrine-delivery model**
  (injection-guaranteed, auto-load-as-backstop) are register rows. The `${CLAUDE_PLUGIN_ROOT}`
  rewrite itself is GREEN (a deterministic install-root mechanism exists, CE-grounded).

## Confirm-by ledger (DI4 — no silent assumptions)

| Tag | Claim | How to confirm |
|---|---|---|
| `[assumed]` | Codex has no `${CLAUDE_PLUGIN_ROOT}`-equivalent injected env var | search codex-cli env/skills docs for a plugin-root variable |
| `[assumed]` | Skill-relative `references/`/`scripts/` discovery resolves from the skill dir | https://developers.openai.com/codex/skills — sibling-addressing statement |
| CE precedent | Codex skills isolate under `~/.codex/skills/<plugin>/` | CE README (plan F2/U8); confirm exact root + `CODEX_HOME` interaction at U8 |
| `[assumed]` (R17) | Codex `AGENTS.md` is natively auto-loaded into the session | codex-cli `AGENTS.md` discovery/auto-load docs |
| `[assumed]` (R17) | Subagent AGENTS.md/context inheritance behavior | probe a spawned thread's context for AGENTS.md content with no injection |
| `[assumed]` (R10/R18) | No Codex `UserPromptSubmit`-class hook surface | U3 allowlist/hook spike + codex-cli config docs |
| PoC-proven (R15) | Doctrine/role delivery by `developer_instructions` injection into `default` spawns works to depth 3 | `poc-notes.md` iter 1 (codex-cli 0.139.0) |
