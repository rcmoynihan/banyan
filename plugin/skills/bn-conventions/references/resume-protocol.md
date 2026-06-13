# Resume protocol: run-locked resume mode + the checkpoint-mode contract

The recursive consult-upward loop hands a continuation enough context to pick up where its
predecessor left off. There are two ways that context arrives, and a run commits to exactly one
of them **for its whole duration**. This reference defines the lock and the fallback contract so
the feature **degrades rather than breaks** when a predecessor's transcript cannot be located.

Read this before opening a run that may consult upward, before authoring a continuation that
rehydrates from a predecessor, and before relying on transcript mode in any agent body. The two
resume modes are:

- **Transcript mode** — the continuation rehydrates from its direct predecessor's raw transcript
  (the *lateral peer rehydration under a resume protocol* transfer category; see
  `consult-protocol.md` once it lands in U6). Available only when a complete predecessor
  transcript is locatable on the host.
- **Checkpoint mode** — the safe degrade. There is no readable transcript, so the continuation
  rehydrates from a **self-contained checkpoint state** the predecessor wrote to disk plus the
  answer it is acting on. This mode never depends on the undocumented transcript path.

## The run-locked-mode rule (R19/R20)

> A run is locked into transcript mode or checkpoint mode **once, at run start**, and holds that
> mode for the entire run. The mode is never re-decided mid-run, never re-probed per continuation,
> and never differs between two children of the same run.

Why a single lock, set once:

- **Determinism.** Every continuation in the run resumes the same way. A run that flipped modes
  partway would leave some continuations expecting a transcript that later children cannot read,
  and the audit trail would not say which mode produced which artifact.
- **Files-only reconstruction (ledger.md).** The lock is recorded as two ledger facts (below), so
  a resumed trunk — or any continuation — reads the locked mode from `ledger.md` instead of
  re-probing the host. The mode survives a trunk restart because it lives in a file, not in memory.
- **One probe, not N.** The probe (U1's `/bn-doctor` Check 4 / `locate-transcript.mjs`) runs once
  at run open. Continuations do not re-probe; re-probing would risk a different answer on a flaky
  host and break determinism.

### How the lock is set and recorded

1. At run open, the owning trunk/lead runs the locate-and-complete probe
   (`locate-transcript.mjs`), producing `{ located, path, complete, reason }`.
2. The probe result is passed to `resolve-resume-mode.mjs`
   (`resolveResumeMode(locateResult) -> { mode, sessionPath, reason }`):
   - **transcript mode** iff the probe says a complete file is locatable
     (`located === true` **and** `complete === true`);
   - **checkpoint mode** otherwise — not locatable, located-but-incomplete (a truncated or
     actively-growing file is unsafe to treat as authoritative — locate-**and**-complete is the
     gate, R20), a malformed probe payload, or **no probe at all**. Checkpoint is the default.
3. The scaffolder (`new-run.mjs`, invoked with `--locate '<probe-json>'`, or with the flag absent
   for the safe default) seeds two lines into `ledger.md`'s `## Facts / Context`:

   ```
   - Resume mode: <transcript|checkpoint> (reason: <reason>)
   - Session path: <resolved transcript path | none (checkpoint mode)>
   ```

   These two facts are the lock. Every later reader (a continuation, a resumed trunk) honors them
   verbatim and does not re-derive the mode.

> **Degrade-not-break.** A missing, failed, or malformed probe is **not** a run-blocking error. It
> locks the run to checkpoint mode and the run proceeds. The undocumented transcript path
> (plan risk R-A) is thereby converted from "the feature breaks" into "the feature runs on the
> checkpoint contract." A run on a host where the transcript is never locatable is a fully
> supported, fully functional run — it simply uses checkpoint mode for every continuation.

## The checkpoint-mode contract

In checkpoint mode the continuation cannot read its predecessor's transcript, so the predecessor
must leave behind a **full, self-contained resume state**: everything the continuation needs to
proceed as if it had read the transcript, written as durable artifacts under the run dir. The
contract is "no in-memory state, no transcript dependency — the next agent reconstructs from files
alone" (the ledger doctrine, applied to the consult loop).

A checkpoint-mode resume state is **complete** when it carries all of the following, each as a
file or a field in a file under `.banyan/runs/<run-id>/`:

1. **The original task / objective.** What the logical unit was asked to do, restated — not a
   pointer into a transcript. (Carried in the continuation's envelope `inputs` and recorded in the
   ledger objective.)
2. **The decision/answer being acted on.** The consult answer the continuation must absorb — its
   `answer_id`, the restated goal, the answer text, and its basis/owner/scope — read from the
   `consults/answers/` artifact (U6 schema), not inferred from a transcript.
3. **The predecessor's progress checkpoint.** A self-contained summary of where the predecessor
   got to: decisions already made, files already created/edited (with paths), what remains, and any
   assumptions in force. This is the substitute for "read the transcript": it must be rich enough
   that the continuation does not re-derive work the predecessor already did (the fresh-witness,
   not fresh-amnesia property). Written to the predecessor's own `progress/<agent>.md` (or the
   designated checkpoint artifact), which it owns as the single writer.
4. **The chain link.** The continuation-chain entry tying this child to its predecessor, the
   answer id it acted on, and the artifact it will produce, so one logical unit stays
   reconstructable from ledger artifacts alone (U6 chain schema, R23).
5. **The locked mode itself.** The `Resume mode` / `Session path` ledger facts, so the continuation
   confirms it is in checkpoint mode and does **not** attempt a transcript read.

What checkpoint mode **must not** do:

- It must not read, parse, or depend on a transcript file (there may be none; the path is opaque
  even when present — DI2).
- It must not depend on the predecessor still running or on any in-memory handoff.
- It must not silently lose the predecessor's progress: a checkpoint missing the progress summary
  (item 3) is an incomplete resume state and is a defect, because the continuation would then
  repeat the predecessor's exploration (fresh-amnesia).

### Transcript mode, for contrast

In transcript mode items 1, 2, 4, and 5 still apply (the envelope task, the absorbed answer, the
chain link, and the lock are mode-independent). The difference is item 3: instead of a written
progress checkpoint, the continuation rehydrates from the predecessor's raw transcript whole-as-text
via a validated pointer (U2) — running the deterministic slicer (U4) only if the transcript exceeds
its own measured budget. Transcript mode is richer (the full reasoning trail) but is available only
when the run is locked to it. Continuations authored for the loop should be written to honor the
locked mode read from the ledger: transcript-read path when locked transcript, checkpoint-state
path when locked checkpoint.

## Cross-references

- `locate-transcript.mjs` — the U1 locate-and-complete probe that produces the mode input.
- `resolve-resume-mode.mjs` — the pure resolver that maps a locate result to a locked mode.
- `new-run.mjs` — seeds the `Resume mode` / `Session path` ledger facts at run open.
- `ledger.md` — `## Facts / Context` is where the lock lives; files-only reconstruction doctrine.
- `consult-protocol.md` (U6) — the redispatch drive-loop and the *lateral peer rehydration* category
  that transcript mode realizes; this resume-protocol doc is cited from there for the mode lock.
