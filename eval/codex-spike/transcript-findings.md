# Consult/transcript-loop substrate spike — Codex analog

**Question (U2, R9/R16):** Does Codex expose a per-agent transcript/session artifact that
`locate-transcript` / `transcript-pointer` / `transcript-slicer` could read, or does the
consult/lateral-rehydration loop have no faithful port?

**Classification: FAITHFUL.** Codex writes a per-spawned-agent session rollout on disk that
carries a filename-resolvable thread id, parent lineage, and a terminal record — the three
preconditions the Banyan locator needs. The consult loop's locate+slice substrate ports; it
does not have to degrade to checkpoint-only resume.

This **revises the `[assumed]` R16** ("Codex exposes no per-agent transcript/session file
analog … so the consult/transcript loop has no faithful port and degrades to checkpoint-only
resume"). The probe shows the analog exists. The checkpoint fallback (`resolve-resume-mode.mjs`)
remains the safe degrade for hosts/runs where the substrate is unavailable, but is not the
default outcome on Codex.

## What the Claude Code loop requires (the substrate inventory)

`locate-transcript.mjs` resolves and locate-and-complete-checks a per-agent transcript at the
undocumented Claude Code path `<sessionRoot>/subagents/agent-<agentId>.jsonl`
(`SUBAGENTS_DIR = 'subagents'` at `:24`; the path is built at `:12,67,73`). Its dependents:

- `transcript-pointer.mjs` validates/sanitizes a pointer to a transcript file.
- `transcript-slicer.mjs` windows a too-large transcript to a budget.
- `resolve-resume-mode.mjs` locks the run to `transcript` mode iff the probe reports
  `located === true && complete === true`, else `checkpoint` (the safe degrade).

So a faithful port needs three properties on the Codex side:

1. **Locate** — a per-agent transcript file resolvable by a stable agent/thread id (Claude Code
   embeds `agent-<agentId>` in the filename; the locator resolves the path from the id).
2. **Lineage** — a way to walk predecessor→successor so a consult chain can rehydrate the
   *direct predecessor's* transcript (the loop's R15/R17 whole-as-text read).
3. **Complete** — a terminal record so locate-AND-complete can distinguish a finished transcript
   from one still being written (`locate-transcript.mjs` treats a parseable last JSONL line as the
   completeness terminator, `:36-47,231-243`).

## The Codex analog (evidence)

Codex writes one **session rollout per thread** under the date-partitioned tree
`<CODEX_HOME>/sessions/<YYYY>/<MM>/<DD>/rollout-<timestamp>-<threadId>.jsonl`
(`CODEX_HOME` defaults to `~/.codex`). Each spawned subagent gets its own rollout file. This is
the same `~/.codex/sessions/**` surface the PoC observed read-only (`poc-notes.md` iter 1:
"four distinct session-rollout threads form the lineage, each spawned by its parent").

The probe `eval/codex-spike/transcript-probe.mjs` (read-only `node:*`-only) inspected the live
sessions tree and the PoC-captured rollouts. Findings:

### 1. Locate — filename embeds the thread id

The first JSONL line of every rollout is a `session_meta` record whose `payload.id` is the thread
id, and that id is embedded in the filename:

```
payload.id      : 019ed692-5164-7ad0-b22a-48c17429b5eb
basename        : rollout-2026-06-17T12-12-53-019ed692-5164-7ad0-b22a-48c17429b5eb.jsonl
filename has id : true
```

A ported locator resolves `rollout-*-<threadId>.jsonl` from a thread id exactly as
`locate-transcript.mjs` resolves `agent-<agentId>.jsonl` from an agent id. Probe result over a
200-rollout sample: **200/200 had a `session_meta` head, 200/200 carried a thread id, 200/200
matched the id embedded in the filename** (`filenameIdMatches: 200`).

### 2. Lineage — `parent_thread_id` + `source.subagent.thread_spawn`

The `session_meta` payload carries the spawn lineage directly. A spawned subagent's head:

```json
{
  "type": "session_meta",
  "payload": {
    "id": "019ed65f-4561-7510-874b-defce9a9192d",
    "parent_thread_id": "019ed65e-8f93-77b0-ae7d-a047e4574cfe",
    "thread_source": "subagent",
    "source": {
      "subagent": {
        "thread_spawn": {
          "parent_thread_id": "019ed65e-8f93-77b0-ae7d-a047e4574cfe",
          "depth": 2,
          "agent_role": "default"
        }
      }
    }
  }
}
```

A child's parent is carried in the top-level `parent_thread_id` OR, when that is null, in
`source.subagent.thread_spawn.parent_thread_id` — the spawn-level field is the more complete
carrier (a fraction of subagent rollouts have a null top-level `parent_thread_id` but a populated
spawn-level one), so the locator and the probe's lineage metric must read the spawn-level field as
the fallback. Either way the parent thread id lets a consult chain walk to the direct
predecessor's rollout; `thread_source: "subagent"` and `thread_spawn.depth` identify spawned
children (the case the loop rehydrates). Over the sample: **139/200 were subagent threads, and all
139/139 resolved a parent thread id** (top-level or spawn-level) — every spawned child the consult
loop would rehydrate has a resolvable predecessor link. (This is the same lineage observed on both
PoC-captured rollouts and current live sessions, confirming it is the normal record shape, not a
PoC artifact.)

### 3. Complete — terminal parseable record

A finished thread's rollout ends with a parseable JSONL record (e.g. `event_msg` /
`task_complete`), so the existing locate-AND-complete heuristic applies unchanged. The PoC
`unit-lead-depth2.jsonl` last line parses as `type=event_msg, payload.type=task_complete`. Over
the sample: **200/200 had a parseable terminal line** (`complete: 200`).

### Probe output (live run, this machine)

```json
{
  "classification": "FAITHFUL",
  "sessionsRoot": "/Users/rmoynihan/.codex/sessions",
  "rootExists": true,
  "rolloutCount": 1964,
  "sampled": 200,
  "withSessionMeta": 200,
  "withThreadId": 200,
  "filenameIdMatches": 200,
  "subagentThreads": 139,
  "withParentLineage": 139,
  "complete": 200,
  "reason": "per-thread-rollouts-with-filename-id-parent-lineage-and-terminal-record"
}
```

(`rolloutCount` and the subagent count drift slightly between runs — `~/.codex/sessions` grows as
Codex is used; the locator preconditions `filenameIdMatches` and `complete` hold at 200/200 and
`withParentLineage == subagentThreads`, which is the load-bearing invariant for the FAITHFUL
classification, not the absolute count.)

## Port shape implied (for U5 / U6)

The locator ports with a path-resolution swap, not a redesign:

- **Path form:** `<CODEX_HOME>/sessions/<YYYY>/<MM>/<DD>/rollout-<ts>-<threadId>.jsonl` replaces
  `<sessionRoot>/subagents/agent-<agentId>.jsonl`. Resolution is by thread id rather than agent id;
  because the date partition is unknown from the id alone, the Codex locator discovers the file by
  scanning the date-partitioned tree for `rollout-*-<threadId>.jsonl` (the analog of
  `locate-transcript.mjs`'s `findSessionWithFile` discovery walk, `:120-137`). `CODEX_HOME` is the
  resolution root (the install threads a single `CODEX_HOME`, R22/F2), the analog of the
  `CLAUDE_SESSION_PATH` / `~/.claude/projects` roots.
- **Pointer:** the consult `transcript_pointer` carries the thread id (the spawn returns it) and/or
  the resolved rollout path; `parent_thread_id` in the head gives the chain link the pointer
  validates against.
- **Completeness:** unchanged — last-non-empty-line-parses, plus the actively-growing guard
  (`locate-transcript.mjs:185-222`), since a still-running thread's rollout is still being
  appended.
- **Slicer:** the rollout is opaque JSONL text whole-as-text, so `transcript-slicer.mjs` windows it
  to budget unchanged.

### Caveats (not-yet-parity / confirm-by)

- **No spawn→thread-id capture proven end to end.** The probe confirms the *artifact* exists with
  lineage; it does NOT prove the parent reliably *learns* the child's `threadId` from the
  `spawn_agent` return so it can hand a pointer down. The PoC observed the four-thread lineage on
  disk but did not exercise a Banyan consult pointer round-trip. Confirm-by: U9's Codex smoke
  exercises a real spawn and asserts the parent can resolve the child's rollout by the returned id.
- **No `agent_path` / named-role tagging.** `thread_spawn.agent_role` is always `"default"` and
  `agent_path` is `null` (consistent with R15 instruction-injection, not name dispatch); lineage is
  by thread id, not by Banyan agent name. The locator keys on thread id, which is sufficient.
- **Version pin.** All evidence is the rollout shape written by codex-cli 0.139.0 (the `multi_agent_version`
  field is present in live `session_meta`). The `session_meta` schema may shift; the U1 Q4 0.140.0
  re-verify (R23) should spot-check the lineage fields (`id`, `parent_thread_id`,
  `source.subagent.thread_spawn`) survive.
- **Checkpoint fallback still the degrade.** Where the substrate is unavailable (no `CODEX_HOME`
  sessions tree, or a future version drops the lineage), `resolve-resume-mode.mjs` locks the run to
  `checkpoint` mode — the safe degrade is intact and unchanged regardless of this finding.

## Verification

- `eval/codex-spike/transcript-probe.mjs` is zero-dependency (`node:fs`, `node:os`, `node:path`,
  `node:process` only) and strictly read-only — no `writeFile`/`mkdir`/`rename`/`unlink`/
  `createWriteStream` calls; `~/.codex/sessions` mtime is unchanged after the probe run. The probe
  drives no codex CLI and touches no auth (`OPENAI_API_KEY` not referenced).
- The checkpoint fallback the degraded path leans on stays green:
  `node --test --test-reporter tap plugin/skills/bn-conventions/scripts/resolve-resume-mode.test.mjs`
  → 17/17 pass.

Feeds U5: the consult/transcript-loop row lands **FAITHFUL** (locator ports with a path-resolution
swap), with the named caveats (spawn→id capture and version pin) carried as confirm-by, and the
checkpoint fallback retained as the degrade.
