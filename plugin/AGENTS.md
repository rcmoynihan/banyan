# Banyan — agent & skill conventions

Banyan is a Claude Code plugin: a hierarchical, self-compounding agent harness built for
**nested subagents** (Claude Code ≥ 2.1.172, depth 5). Instead of hub-and-spoke
orchestration of a flat agent fleet, it uses **lead agents that own whole subtrees**, a
**file-based run ledger**, **delegation envelopes with budgets**, and **fractal lesson
harvesting**.

The user-facing top-level thread is the **trunk**: it holds user intent, dispatches the
owning lead or inline dialogue flow, reads gate artifacts, and handles decisions that
genuinely need the user. Procedural setup, panels, durable document authorship, and
phase-local recovery belong in the owning lead or skill layer below it.

This file is the standing contract for everything under `plugin/`. Every Banyan agent and
skill must obey it. It is also the project-standards source the review subtree reads.

**This file ships with the plugin** — everything under `plugin/` is copied verbatim on
install — **but it is never auto-loaded.** Claude Code loads the *host repo's* instruction
files into context, not files inside the plugin cache; an agent sees this file only when
something explicitly routes it here — `${CLAUDE_PLUGIN_ROOT}` resolution in a skill, or a
doctrine path passed in its delegation envelope. A bare instruction like "read
`AGENTS.md`" resolves against the host repo and finds the *host's* file, not this one:
when pointing an agent at this doctrine, pass a resolved path.

It has two audiences. At runtime, Banyan agents in any host repo read it (via the routing
above) as standing doctrine. In the Banyan source repository, contributors additionally
follow it as the contract for editing `plugin/` content. Authoring-repo concerns (dev
scripts, vendoring workflow, test fixtures) live in the source repo's root `AGENTS.md`,
which is invisible at runtime.

---

## 1. The eight invariants

These hold for every agent, skill, and spawn in Banyan.

1. **Context-centric decomposition.** A new agent layer exists only for a *context* reason:
   disjoint reading, isolated writing, or fresh-context judging. Never for role-play. There is
   no PM-agent talking to an architect-agent talking to an engineer-agent. "Department" is a
   metaphor for ownership and accountability, not a screenplay.
   *(Affirming note — the recursive consult-upward loop is consistent with this invariant, not an
   amendment to it. The loop exists for a context reason: the layer above holds goal/intent
   context a leaf lacks. The continuation is a fresh peer of the asker's own type — a same-type
   respawn, never a new "consultant" role; the one new agent, `bn-consult-extractor`, is a
   disposable read-only context, not a persona. See
   `skills/bn-conventions/references/consult-protocol.md`.)*
2. **One writer per file set.** Reads parallelize; writes serialize within a subtree. Parallel
   writers exist only across disjoint git worktrees, merged by their parent. Each lead is the
   single-threaded writer for its domain.
3. **Artifacts over prose.** Every delegation names an output artifact path. A child's only
   channel back to its parent is its final message, so that message is a **verdict plus paths** —
   never the payload. Parents read artifacts, not summaries. (At depth 5 a
   summary-of-a-summary-of-a-summary is the telephone game; the filesystem is the ground truth.)
   *(Transfer categories. Two transfers are distinguished and must not be conflated. (a) **Parent
   review** — a parent reads a child's verdict-plus-paths and bounded artifacts (asks, briefs,
   findings); it never reads a child's raw transcript. This invariant is **preserved unchanged**
   for parents. (b) **Lateral peer rehydration under a resume protocol** — a continuation, which
   is a fresh same-type peer of an asker (not a parent), reads its **direct predecessor's** raw
   transcript whole-as-text to resume the work, governed by
   `skills/bn-conventions/references/consult-protocol.md` and the run-locked resume mode. This
   lateral, peer-to-peer read never travels upward: a transcript flows peer to peer, never to a
   parent. The only transcript readers are the continuation and the disposable
   `bn-consult-extractor`; every lead body is audited to contain no transcript-read instruction.)*
4. **Decompose on failure, not eagerly.** Default depth is 1–2. Depth 3–5 is *reserve capacity*
   triggered by failure or context pressure, not spent preemptively. Most tasks stay shallow.
   A procedure-owning lead is the narrow standing reason for one eager level when a command
   runs a multi-agent panel or writes a durable output document and its user interaction is
   sparse and boundary-only.
5. **Budgets are explicit.** Every spawn carries a delegation envelope (objective, artifact path,
   output format, boundaries, tool guidance, and a budget of `max_children` /
   `depth_remaining`). See `skills/bn-conventions/references/envelope.md`.
6. **Permission cliff.** Background nested agents auto-deny permission prompts. Pushes,
   migrations, deletions, and anything prompt-worthy stay at **trunk level** or run foreground.
   A lead deep in the tree must **report the need upward**, never silently fail against it.
7. **Model is pinned per agent.** Every agent declares its model in `model:` frontmatter —
   Opus by default, Sonnet only for the mechanical leaves whose work is fixed-procedure or
   structured lookup and gains nothing from more reasoning. A lead never overrides a child's
   model at spawn time; the frontmatter is authoritative, so the envelope carries no model field.
8. **v1 persistence compatibility.** Banyan reads and writes the compound-engineering
   knowledge-store schema unchanged under `.banyan/solutions/`.
   See `skills/bn-conventions/references/knowledge-store.md`.

---

## 2. The org chart is declared, not prompted

Who may spawn whom is encoded in each agent's `tools:` frontmatter via the `Agent(...)` allowlist,
**not** described in prose. A lead's allowlist *is* its team roster.

```yaml
# bn-delivery-lead.md frontmatter (illustrative)
tools: Read, Grep, Glob, Bash, Write, Edit, Agent(bn-unit-lead, bn-integrator, bn-review-lead, bn-finding-owner)
```

(`bn-delivery-lead` spawns a read-only `bn-review-lead` for the panel and `bn-finding-owner`s
to fix its findings — the review subtree itself is read-only and spawns no fixers.)

Rules:

- A lead lists exactly the child agent types it is allowed to spawn. Nothing else is reachable.
- Shared dispatch policy (reviewer-selection matrix, effort scaling, dedup rules) lives **once**,
  in the lead's own system prompt — never copy-pasted across skill `references/` files.
- `depth_remaining` in the envelope, not the allowlist, bounds *how deep* a chain may go. The
  allowlist bounds *which* types are reachable; the envelope bounds *how many* and *how deep*.

> **Empirical note (verify before relying):** `Agent(agent_type)` allowlist semantics in *nested*
> contexts are under-documented for 2.1.172. If the harness ignores a nested allowlist,
> depth/child accounting falls back to the prompt-level contract in the envelope.
> `/bn-doctor`'s live probe reports whether the runtime enforces the allowlist in this host.

### 2.1 Host-repo review rules

The review panel is shipped with Banyan. Host repos express project-specific review
criteria in their instruction files (`AGENTS.md`, `CLAUDE.md`, and directory-scoped
equivalents), and `bn-project-standards-reviewer` audits diffs against those written
rules.

- The review lead never spawns reviewer types outside its `Agent(...)` allowlist.
- Project-specific rules must be concrete enough for a reviewer to cite the rule and the
  violating diff line.
- Broadly useful specialist lenses belong in `plugin/agents/` as shipped reviewers with
  explicit conditional spawn gates.

---

### 2.2 Self-recovery and escalation

Every Banyan trunk and lead resolves obvious failures inside the layer that owns them before
reporting upward. A failed artifact gate is a recovery signal, not automatically a user-facing
stop.

Recovery follows the ownership boundary:

- The trunk recovers phase-level failures by re-entering the owning skill or lead with the same
  run dir and a sharper instruction.
- A lead recovers subtree-local failures by repairing, re-partitioning, or re-dispatching within
  its own retry cap and child budget.
- A leaf never expands its own authority. It writes the blocked reason and the next safe action
  into its artifact so the parent can recover at the owning layer.

Escalate to the user only when the issue needs user authority, has no defensible default, or has
exhausted the owning layer's recovery cap. Escalation-worthy cases include:

- permission cliffs: push, PR creation, credentialed external action, destructive deletion, or
  production migration execution;
- product, business, security, privacy, pricing, or policy decisions where multiple outcomes are
  plausible and none is safely inferable from the repo or requirements;
- missing external authority such as secrets, account access, vendor settings, or private
  deployment state;
- unsafe working-tree state where recovery would overwrite or entangle user-owned changes;
- repeated failure after the phase or lead has used its bounded recovery path;
- an explicit user-invoked procedure (a skill or command) you judge disproportionate to the
  real task: get consent before deviating from it onto a leaner path, even when you are
  confident the leaner path reaches the right result (§2.4).

User prompt text can steer autonomy for the current run. A request like "be aggressive and do not
ask unless blocked" raises the threshold for escalation; a request like "pause before product
assumptions" lowers it. This is run-local steering, not a formal mode or enum.

### 2.3 User touchpoints and artifact-backed re-entry

`AskUserQuestion` is trunk-only. Leads do not rely on user-question tools, and background nested
agents treat user interaction as unavailable. User interaction clusters at boundaries:
intake before dispatch, approval or recovery after a lead returns, and permission-cliff actions
that must stay foreground.

When a lead reaches a user-decision point, it writes a blocker artifact and returns
`needs-user` with `blocker_class`, `recovery_owner`, `next_safe_action`, and
`resume_from_phase`. The trunk reads that artifact, asks the user, then spawns a fresh lead with
the same run ID and the answer as resume context. The resumed lead reads the ledger and artifacts
and writes the durable state; the trunk does not patch lead-owned artifacts itself.

When an autonomous grow run exits early after recovery is exhausted, the grow trunk writes the
residual state to `.banyan/runs/<run-id>/residuals.md` before surfacing it. The ledger points at that
artifact so the run can resume from files rather than conversation memory.

### 2.4 Deviating from an invoked procedure requires consent

**When the user explicitly invokes a Banyan skill or names a procedure, that invocation is a
directive to run *that* procedure — not merely a hint about intent.** This rule is binding;
adherence to it is not optional.

Skills are built to scale *down*. Most carry a lightweight path for small tasks — `/bn-grow`
skips fuzzy intake and spec-stress and runs a thin plan for a clear lightweight task; `/bn-plan`
and `/bn-review` scale their panels by effort. **Take the skill's own lightweight path before
concluding the skill does not fit.** The lightweight path is part of the procedure, not an
exception to it.

If, *after* accounting for that lightweight path, you still judge that running the invoked
procedure would be disproportionate overkill for the actual task, you **must not silently bypass
it.** Reaching the right *result* by freelancing around an invoked procedure is still a
violation of this doctrine: the user chose that procedure, and the gates, ledger, and durable
record it produces are part of what they asked for. Quietly substituting your own judgment — even
a *correct* judgment that the procedure is overkill — is precisely the failure this rule exists to
prevent.

Instead, **get the human driver's consent before deviating.** In one trunk-level touchpoint,
surface up front:

- what the invoked skill would do, and that even its lightweight path is more than the task needs;
- the leaner alternative you propose; and
- a clear recommendation.

Ask with the platform's blocking question tool — `AskUserQuestion` in Claude Code; the equivalent
elsewhere (`request_user_input` in Codex, `ask_user` in Gemini/Pi). Proceed on the leaner path
**only once the user picks it.** This decision lives at the **trunk**: the trunk is the only layer
that receives a user skill invocation and can ask (`AskUserQuestion` is trunk-only, §2.3).

Two narrow cases are *already* consent and need no re-ask:

- **Explicit prompt-local waiver.** If the user's own prompt authorizes the shortcut ("don't
  bother with the full pipeline, just delete it"), consent is already given. This is the
  run-local autonomy steering of §2.2 applied to procedure choice — do not re-ask.
- **The skill routes itself elsewhere.** A skill may define its own thresholds that hand off,
  no-op, or downgrade; following the skill's *written* branch is adherence, not deviation.

**How this rule reaches you.** This file is never auto-loaded, so the rule is also delivered at
the moment of action by a plugin hook: `plugin/hooks/invoked-procedure-consent.mjs` (a
`UserPromptSubmit` hook, §3) injects a short reminder of this rule into the trunk's context
whenever the user explicitly invokes a heavy Banyan skill (`/bn-grow`, `/bn-plan`, `/bn-review`,
`/bn-work`, `/bn-debug`, `/bn-onboard`, `/bn-spec-stress`). The hook is the *reminder*; this
section is the *rule*. The hook is best-effort and trunk-only — it never fires inside a subagent
and can never block a prompt — so adherence is still your responsibility, not the hook's.

---

## 3. Naming & layout

- **Namespace prefix:** every agent, skill, and command is `bn-…`. Skills are invoked as
  `/bn-<name>`; agents are spawned by type name `bn-<name>`.
- **Plugin root** is this directory's parent (`plugin/`). Components live in standard locations:
  - `plugin/agents/bn-*.md` — one agent per file.
  - `plugin/skills/bn-*/SKILL.md` — one skill per directory, with optional `references/`,
    `scripts/`, `assets/` subdirectories (same convention as compound-engineering).
  - `plugin/schemas/` — vendored/shared schema files (e.g. findings schema, solution frontmatter).
  - `plugin/hooks/` — `hooks.json` (auto-discovered by Claude Code; no `plugin.json` key needed)
    plus the node scripts it invokes. Hooks are **trunk-level doctrine reminders only**: each is
    best-effort and MUST be incapable of blocking or perturbing a prompt (never exit 2; emit
    nothing and exit 0 on any error). See §2.4 for the one shipped hook.
  - `plugin/AGENTS.md` — this file.
- **Run artifacts** live in the *target repo*, not the plugin: `.banyan/runs/<run-id>/`
  (see `skills/bn-conventions/references/ledger.md`). They are local run state; durable
  knowledge lives in `.banyan/solutions/`.

### Agent file frontmatter

```yaml
---
name: bn-correctness-reviewer        # must equal the filename stem
description: <one line; when to use this agent — read by the dispatcher>
model: opus                          # opus | sonnet — pin explicitly (see §1.7)
tools: Read, Grep, Glob, Bash, Write # least privilege; add Agent(...) only for leads
color: blue                          # optional, cosmetic
---
```

- `name` **must** match the filename (`bn-correctness-reviewer.md` → `name: bn-correctness-reviewer`).
- `tools` is least-privilege. Reviewers and scouts are read-mostly (`Read, Grep, Glob, Bash`, plus
  `Write` only to their own artifact path). Only **leads** and recursive workers carry `Agent(...)`.
- `model` is pinned explicitly on every agent (invariant 7): `opus` by default, `sonnet` only
  for the mechanical leaves. Leads do not override a child's model at spawn time.

### Skill file frontmatter

```yaml
---
name: bn-review
description: "<when to use; what it does — read by the skill dispatcher>"
argument-hint: "[optional args]"
---
```

---

## 4. The lead pattern

A **lead** is an agent that owns a subtree end-to-end and returns a verdict, not a report.

- A lead receives a delegation envelope, **echoes it into its progress file** on start
  (`.banyan/runs/<run-id>/progress/<lead>.md`) so violations are auditable from the ledger, then
  runs its own multi-stage orchestration internally.
- A lead **reads its children's artifacts**; it does not trust their final-message prose for
  anything load-bearing.
- A lead honors its budget: it spawns at most `max_children` **discretionary** children and
  decrements `depth_remaining` on every spawn. At `depth_remaining: 0` it completes the work
  inline instead of delegating.
- A lead **never edits files outside the scope it owns**, and where multiple children write, it
  partitions their file sets so no two children touch the same files (invariant 2).
- Before returning — on **every** exit path, including a trivial/zero-spawn fast return — a lead
  spawns one **`bn-lesson-harvester`** over its still-fresh context to stage candidate lessons
  (fractal compounding). This harvest is a **mandatory finalization spawn**: it is a
  single fixed leaf that does **not** count against `max_children` (it must never
  compete with real work for the cap), and it must not block or alter the lead's verdict —
  harvest, then return.

**Driver's vigilance.** A lead does more than *read* its children's artifacts — it reads them like
a human driving the tool, watching the child's trajectory for the process pitfalls a diff-reading
reviewer cannot see: goal drift, fixing the wrong problem, assumption-driven work, solving
uncertainty with code, acting on partial understanding, hallucinated context, tool misuse, and
tunnel vision. These are legible in a child's artifact *before any diff exists* — exactly the
surface the reviewer panel cannot reach. This is a lens held while reading, not a gate run per
spawn; when a flag survives the lead's own judgment, the corrective is a move on the existing
re-dispatch / §2.2 escalation ladder (a sharper-envelope re-dispatch within the retry cap, or a
`blocker_class` escalation), never a new recovery system. The catalog of pitfalls, their
trajectory tells, and their correctives lives at
`skills/bn-conventions/references/process-pitfalls.md`; the operative copy of this reflex is
inlined in each lead body, because `plugin/AGENTS.md` is never auto-loaded into a spawned subagent.

The core leads are `bn-review-lead`, `bn-research-lead`, `bn-delivery-lead`,
`bn-debug-lead`, `bn-plan-lead`, and `bn-ask-lead`. The main session stays a near-empty **trunk** that talks
to the user, holds intent, reads gate artifacts, and dispatches owning leads.

---

## 5. Protected artifacts

`.banyan/` is Banyan local state in the target repo. It is normally ignored by git.
Agents may write their assigned Banyan artifacts there, but no agent stages, commits,
or pushes `.banyan/**`.

`docs/` is project-owned documentation. Banyan may read, write, or modify `docs/` only
for genuine project documentation tasks. Run ledgers, generated brainstorms and plans,
knowledge-store entries, harness proposals, onboarding manifests, and other
Banyan-specific artifacts live under `.banyan/`, not `docs/`.

No agent may delete or "clean up" durable Banyan artifacts under these paths:

- `.banyan/brainstorms/*`
- `.banyan/plans/*.md`
- `.banyan/solutions/*.md`

A reviewer that flags one of these for removal has its finding discarded during synthesis.
Run artifacts under `.banyan/runs/*` are local coordination state. Agents may write only their
assigned paths in the active run, must not mutate unrelated run artifacts, and leave retention
or archive decisions to the trunk or user.

Two narrowly-bounded exceptions exist, both belonging to the `bn-knowledge-curator`:

- **Clearing consumed staging.** After consolidating a run's candidates, the curator empties the
  `.banyan/runs/<run-id>/lessons-staging/` candidate files it promoted or merged (the staging
  lifecycle in `skills/bn-conventions/references/ledger.md`). That staging area is the curator's
  own transient feedstock, not durable memory, so clearing a consumed candidate is sanctioned. A
  held candidate and every other run artifact (the ledger, progress notes, briefs, findings) stay
  untouchable.
- **Deleting a drifted solution.** The curator may delete a drifted `.banyan/solutions/*.md` entry,
  and only when **all** of these hold: the curator is the actor; it is running **foreground**
  under `/bn-learn --refresh` (never in background or sleep-time curation); and the user has
  **explicitly confirmed that specific document** — carried into a follow-up curator pass as a
  `confirmed_delete_paths` entry after a prior report-only pass presented its inbound-link
  analysis. Until a document is so confirmed, a drifted entry is a `RECOMMEND-DELETE` report line
  only.

No other agent ever deletes a protected artifact, and `.banyan/brainstorms/*` and
`.banyan/plans/*.md` are never deletable by anyone.

---

## 6. Pointers

- Run ledger spec & layout → `skills/bn-conventions/references/ledger.md`
- Delegation envelope spec & template → `skills/bn-conventions/references/envelope.md`
- Knowledge-store (.banyan/solutions) schema, v1-compatible → `skills/bn-conventions/references/knowledge-store.md`
- Findings schema (code review) → `schemas/findings-schema.json`
- Vendoring provenance & local-edit log → `../vendor/MANIFEST.md` (source repo only — this
  path does not exist in an installed copy of the plugin)
