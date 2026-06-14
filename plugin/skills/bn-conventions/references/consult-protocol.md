# Consult protocol: the recursive consult-upward loop (redispatch)

This is **the single shared policy doc** for Banyan's recursive consult-upward loop. Every agent
body that participates in the loop — askers, answering leads, and continuations — **cites this
file**; none copies its rules (AGENTS.md §2: shared dispatch policy lives once). When the policy
changes, it changes here, and every citing agent inherits it.

Read this before authoring or editing any agent that may pause on a goal/intent question, answer
one, or continue a predecessor's work. The companion references are
`references/envelope.md` (the consult/continuation envelope `inputs` fields),
`references/ledger.md` (the consult artifact families and writer rules),
`references/resume-protocol.md` (the run-locked transcript/checkpoint mode contract), and the
`schemas/consult-*.schema.json` shapes.

## Why the loop exists (and why it is not role-play — invariant 1)

A subagent that hits a **goal/intent** question it cannot resolve from its own narrow context has
three bad options without this loop: decide silently on thin context, bounce straight to the human,
or stall. The loop gives it a fourth: get an answer from the **lowest competent layer above it**.
The loop exists for a **context reason** — the layer above holds goal/intent context the leaf does
not — not to role-play a new persona. Invariant 1 is therefore **unchanged**: no new "consultant"
role is introduced; the answerer is the agent's existing lead, and the continuation is a fresh peer
of the asker's own type (see DI3 below).

## The redispatch constraint (why it is a loop of respawns, not a pause)

The Claude Code harness **cannot pause and resume a nested child**: there is no `SendMessage` or
resume for non-trunk agents, children run to completion, and nested spawn works only to a bounded
depth. So the loop cannot be "the asker blocks while the lead thinks." It is realized by
**redispatch**:

1. The asking agent writes a small **bounded ask** artifact and **returns a verdict**, leaving its
   full transcript on disk.
2. The answering lead answers **from the ask alone** (re-stating the goal first) and **never reads
   the transcript**.
3. The lead spawns a **continuation** — a fresh peer of the asker's own type — whose envelope
   carries the original task, the predecessor's transcript **pointer** (passed through unread), and
   the **answer**.
4. The continuation **rehydrates** from the predecessor's raw transcript (or, in checkpoint mode,
   its checkpoint state) plus the answer, writes an **answer-absorbed** note, and proceeds.

The human is the **top rung and a last resort**, reached only via the existing `needs-user` → trunk
path (envelope.md user-touchpoints).

## The two-channel split (the load-bearing invariant — DI1)

There are exactly **two channels** and they must never cross:

- **The bounded ask (travels UPWARD).** A small, strong brief (the `consult-ask` schema). It is the
  *only* thing the question rides up on. A lead reads asks, never payload (invariant 3 preserved).
- **The raw transcript (travels LATERALLY).** A predecessor's full transcript moves **peer to peer**
  — from the asker to its continuation — and **never upward**. The lead treats the transcript
  pointer as **opaque**: it must not open, read, or summarize the transcript (R11/R13/R27).

> **DI1 — transcript flows laterally, never upward.** The only transcript readers are (a) a
> **continuation** (a fresh same-type peer of the asker, direct predecessor only) and (b) the
> disposable **`bn-consult-extractor`** (one bounded fact, when the bounded ask is insufficient).
> No lead/parent body may instruct an agent to read a predecessor's transcript. A lead's context
> scales with the **questions it answers**, never with the work done below it (R13). This is audited
> by a grep over every edited lead body — a single transcript-read instruction in a lead fails the
> feature.

The continuation's raw-transcript read is a named, distinct transfer category — *lateral peer
rehydration under a resume protocol* — separate from a parent reading a child's verdict (R27,
documented in `plugin/AGENTS.md` by U12).

## The drive-loop state machine

One **logical unit** is a chain of physical children driven by this state machine. The lead (or
trunk) is the driver; each child runs to completion and hands control back via its verdict +
artifacts.

```
            ┌─────────────────────────────────────────────────────────────┐
            │                                                               │
  [asker runs]                                                             │
     │                                                                      │
     ├── resolves locally ─────────────────────────────► proceeds / done   │
     │                                                                      │
     ├── goal/intent question it cannot resolve (R4 gate)                   │
     │      └─► writes consults/asks/<ask_id>.json (strong brief, R14)      │
     │          returns verdict `needs-answer: <ask_id> -> <path>`          │
     │                                                                      │
     └── hard blocker (R2, ungated)                                         │
            └─► writes ask (kind: hard-blocker) + returns `blocked`         │
                                                                            │
  [lead receives needs-answer]                                             │
     │  1. GOAL-RECHECK: restate the current goal in its own words (R8)     │
     │     and check the question against it.                               │
     │  2. Weigh the ask. Decide a disposition:                            │
     │       • answered            → bind the asker (R5), basis/owner/scope │
     │       • rejected-as-local   → classification_proof failed (R14)      │
     │       • requested-more-evidence → thin ask (R14)                    │
     │       • escalated           → lead cannot resolve; it ASKS UPWARD    │
     │                               via its own asker path (R3)            │
     │     (if the bounded ask is insufficient, spawn bn-consult-extractor  │
     │      for ONE bounded fact — never read the transcript itself, R12)   │
     │  3. write consults/answers/<answer_id>.json (R24 fields required)    │
     │                                                                      │
     └─► spawn CONTINUATION (same-type respawn, DI3): envelope carries the  │
         original task + UNREAD transcript_pointer + answer_ref +           │
         resume_mode (+ worktree/unit_base_ref for delivery)               │
                                                                            │
  [continuation runs]                                                       │
     │  • validate the pointer (U2) and rehydrate from the DIRECT           │
     │    predecessor's transcript whole-as-text (R15/R17) — or, in         │
     │    checkpoint mode, from the predecessor's checkpoint state.         │
     │  • if the transcript exceeds its OWN measured budget, run the        │
     │    deterministic slicer (U4) — parent never involved (R16).          │
     │  • treat the answer as NEWER authority than pre-question reasoning    │
     │    (R10); write consults/absorbed/answer-absorbed-<id>.json           │
     │    (restated answer + plan delta — the fresh-witness proof object).   │
     │  • append its chain entry (consult-chain, R23).                      │
     │                                                                      │
     ├── proceeds ────────────────────────────────────► completes / done   │
     ├── new goal/intent question ───────────────────────► back to asker    │
     │                                                      (new ask)        │
     ├── evidenced push-back ───────────────────────────► back to lead      │
     │     (the one-evidenced-push-back finality state and its R6/R5 rules    │
     │      are added to this state machine by U10 — see below)              │
     └── thrash/cost budget tripped (U5) ───────────────► abort to `blocked`│
            (writes consults/aborts/<id>; rides the existing blocked path)   │
```

### The evidenced push-back state (R6/R5 finality)

The `evidenced push-back` transition in the state machine above is the **one** sanctioned way a
continuation can decline an answer. An answer **binds by default** (R5). The exception is narrow
and exactly-once:

1. **Emit (continuation side).** A continuation that holds **concrete contradicting evidence** —
   a specific file or a failing check that disproves the answer, not a mere preference — may emit
   **one** push-back ask. It is a normal `consult-ask` (`kind: goal-intent`) **flagged as a
   push-back**, with the **conflict attached** as `evidence[]`. The continuation then returns as
   an asker does; it does **not** proceed on its own contrary judgment.
2. **Read-before-reanswer (lead side).** The lead **must read the attached conflict** before
   re-answering (it is in the bounded ask — the lead still never reads the transcript, DI1).
   The lead then either **revises** the answer (the evidence genuinely changes the call) or
   **reaffirms** it.
3. **Finality (R6).** A **reaffirmed** answer is **final for that evidence set** — the lead
   records `disposition: reaffirmed` on the answer and the continuation **complies**. A **second**
   push-back on the **same evidence set is refused** by the continuation. The matching
   `consult-chain` entry records `outcome: pushed-back` for the push-back round.
4. **Reopening.** Only **genuinely new evidence** (a different file/check, not a reword of the
   same point) may reopen the question with a fresh push-back. A **near-duplicate reworded re-ask
   is thrash** and counts toward the consult budget (`references/consult-budget.md`); the budget's
   near-duplicate-question meter is what stops a continuation from laundering the same conflict
   through reworded asks.

This keeps the loop convergent: every evidence set is adjudicated at most twice (answer, then one
push-back → reaffirm-or-revise), and only new facts — never new phrasings — extend it.

## DI3 — the continuation is a same-type respawn, NOT a new agent type

There is **no `bn-continuation` agent type**. The asker is always a leaf already in the answering
lead's `Agent(...)` allowlist (`bn-repo-researcher` under `bn-research-lead`; `bn-unit-lead` under
`bn-delivery-lead`; `bn-unit-lead` even lists its own type). The continuation is **a fresh peer of
the asker** — another instance of that already-reachable type. A dedicated continuation type would
force a new entry into every lead's allowlist for a context job identical to the asker's role, which
is exactly the invariant-1 "role-play decomposition" smell.

Therefore: **continuation behavior is authored as a section inside the existing asker agent body**,
and the lead spawns it as an envelope-driven respawn of the existing type. Only the **envelope
`inputs`** differ:

- `transcript_pointer` — the U2 capability naming the direct predecessor's transcript (opaque to
  the lead, passed through unread).
- `answer_ref` — the path/id of the `consults/answers/<answer_id>.json` the continuation must absorb.
- `resume_mode` — the run's locked mode (read from the ledger; see resume-protocol.md).
- `session_path` — the envelope-pushed session path for transcript-path derivation (R28; below).
- `unit_base_ref` / worktree — **delivery only**: a `bn-unit-lead` continuation must re-attach to the
  predecessor's `isolation: worktree` + `unit_base_ref` (the type is reused; only the envelope
  inputs differ — plan-check design-Q6 §4). Authored by U11's delivery note.

These fields are defined in `references/envelope.md` (single owner: U6).

## Session-path derivation (R28)

A nested lead derives its run's session/transcript path by **envelope push-down**: the trunk/owning
lead resolves the session path **once at run start** and passes it in every spawn's `inputs`
(`session_path`). The fallback is **filesystem discovery** under
`~/.claude/projects/<proj>/<session>/subagents/agent-<id>.jsonl` keyed by the pointer's agent id
(implemented by `scripts/locate-transcript.mjs`, U1). A `not-locatable` result is **not a blocker**
— it locks the run to checkpoint mode (R19/R20), which the resume protocol makes safe.

## Budget dials (cross-ref U5) — independent of `max_children`/`depth_remaining`

The consult/redispatch budget is a **composite per-logical-unit meter**, deliberately **separate**
from the spawn budget (R22). `max_children` and `depth_remaining` bound the spawn tree; they do
**not** bound consult thrash. The consult meter tracks respawn count, cumulative tokens, repeated
file re-reads, no-progress diff, and **near-duplicate reworded questions**, plus a separate
`transcript_ancestry_depth` cap and a `total_transcript_bytes` cap. When any dimension trips (or the
absolute hard ceiling backstop fires), the logical unit **aborts to `blocked`** and writes a
reconstructable abort record to `consults/aborts/`. The dimensions, default weights, and the
absolute ceiling are fixed in `references/consult-budget.md` (single owner: U5).

## Mode lock (cross-ref U3)

A run locks **once at start** into **transcript mode** or **checkpoint mode** and holds it for the
whole run (R19/R20). The lock lives as two `ledger.md` `## Facts / Context` lines (`Resume mode`,
`Session path`); every continuation reads the lock from the ledger and does **not** re-probe. In
transcript mode the continuation rehydrates from the raw transcript; in checkpoint mode it
rehydrates from the predecessor's self-contained checkpoint state. The full contract — what a
complete checkpoint resume state must carry — is in `references/resume-protocol.md` (single owner:
U3). Continuations honor the locked mode read from the ledger.

## Artifacts and reconstructability (R23)

Asks, answers, the continuation chain, absorbed-answer notes, and abort records are **first-class
ledger artifacts**, housed under the run dir from scaffold time (`consults/asks`,
`consults/answers`, `consults/chains`, `consults/absorbed`, `consults/aborts`, `consults/metrics` —
seeded by `scripts/new-run.mjs`). One logical unit is a chain of physical children; **each child
links to its input ask, the answer id it acted on, the artifact it produced, and the files it
touched** (the `consult-chain` schema). Run state is reconstructable from files alone — proven
executably by `scripts/check-consult-chain.mjs`, which flags any dangling link. The chain index is
folded by the **owning lead/trunk only** (one writer; see ledger.md Writer rules).

## Executable enforcement (the engines the answerer actually runs)

The deterministic, LLM-free engines are wired into the **answering lead's** drive loop (not left as
prose to eyeball). An answering lead, via Bash:

- **validates an incoming ask before binding** —
  `scripts/validate-consult-artifacts.mjs --ask <consults/asks/<ask_id>.json>` (also `--answer` /
  `--chain`); a schema-invalid or thin ask is rejected mechanically (R14/R24), exit non-zero.
- **evaluates the consult meter before every respawn** —
  `scripts/consult-budget.mjs evaluate --counters <consults/chains/<logical-unit>.counters.json>`,
  which returns `{ trip, dimension, ceiling_hit, score, counters }`. On `trip: true` the logical
  unit **aborts to `blocked`** with a `consults/aborts/<id>.json` record (R21/R22) instead of
  respawning. The lead maintains the per-logical-unit counters JSON next to the chain index and
  updates it as each physical child returns.
- **checks the chain for dangling links** after folding each entry —
  `scripts/check-consult-chain.mjs --run <run-dir>` (R23), exit non-zero on any unresolved
  ask/answer/predecessor/artifact reference.

Continuations run the transcript engines themselves (lateral, never via the lead):
`scripts/transcript-pointer.mjs --validate <pointer.json> --root <dir>` (and `--sanitize <file>`),
and `scripts/transcript-slicer.mjs <file> [--budget-fraction <f>] [--window-tokens <n>]` against
their own measured budget, **failing closed** (degrade to checkpoint rehydration or `blocked`) when
the slice manifest reports it still does not fit.

## In one line

The ask climbs (bounded, strong, opaque-pointer-bearing); the lead answers from the ask alone after
re-checking the goal, recording basis/owner/scope; the continuation — a same-type peer respawn —
rehydrates laterally from the predecessor and absorbs the answer; the chain on disk makes the whole
logical unit reconstructable; the human is the last rung.
