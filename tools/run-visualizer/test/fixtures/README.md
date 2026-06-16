# Verification fixtures (committed BEFORE the parsers — ops-first graft, U1b)

Each fixture is a deterministic, committed input the release gate asserts against. They are
authored to be *coherently-shaped synthetics* matching the real Claude Code v2.1.177 transcript
schema (verified on-disk against session `b5bf91de-f038-4e03-b691-9cbbc703613a` under
`~/.claude/projects/-Users-riley-repos-banyan/`), not random corruption.

| Fixture | Proves | Gates (P-ID / R-ID) | Consumed by |
|---|---|---|---|
| `drift/agent-drift.jsonl` + `.meta.json` | Schema-drift degradation without crash | P6 / R13 | U1 parser, U4 tree-join, U9 drift-gate |
| `torn/agent-torn.jsonl` | Torn/partial trailing line dropped, earlier nodes still render | P1a / R1 | U1 parser + offset tailer |
| `durable-only/nested/` | Durable-only roster, **nested** `review/round-N/` layout | P5 + P12 / R9, R10 | U5 durable-reader |
| `durable-only/flat/` | Durable-only roster, **flat** (pre-2026-06-14) layout | P12 / R10 | U5 durable-reader |
| `cold-bridge/expected.json` | Run-id→session answer key (`b5bf91de`) | P4 / R3 | U3 cold bridge |

## drift/ — the P6 synthetic (R13)

Hand-built to carry three *coherent* schema mutations on a real-shaped transcript:
1. **Renamed / missing token-usage field** — `usage` is renamed to `tokens_used` on the spawn
   line and entirely absent on the final assistant line. The parser must surface
   `tokens: unavailable`, never `0`.
2. **`Task`-named spawn tool_use** (not `Agent`) that still carries a real `subagent_type` + `.id`
   (`toolu_DRIFTSPAWN0001`). The tree-join must match on spawn-tool *shape*, not the literal name.
3. **Array `message.content`** as the spawn/edge-bearing case (the common real shape — assistant
   `content` is normally a `text`/`tool_use` block array, confirmed on disk).

The child's own `.meta.json.toolUseId` is `toolu_DRIFTPARENT0001` (a dangling parent → attaches to
the synthetic run-root in U4, flagged, never dropped).

## torn/ — the P1a torn-write case (R1)

Three well-formed JSONL lines followed by **one truncated trailing line with no newline** (a torn
write mid-string, mid multi-byte UTF-8 char). Multi-byte chars (`→`, `café`, `☕`) appear in the
good lines AND the torn line so the byte-vs-char offset-tailer bug surfaces: `JSON.parse` of the
last line must fail (dropped, surfaced as `{ok:false}`) while the 3 earlier lines parse.

## durable-only/ — P5 + P12 (R9, R10)

Two copy-shaped run dirs with `activity.log`, `ledger.md`, `progress/*.md`, but **no `subagents/`
transcript tier** (so the cold bridge resolves nothing and the tool falls to the durable-only
roster). `nested/` carries the post-2026-06-14 `review/round-{1,2}/` subtree; `flat/` is the
pre-2026-06-14 flat layout. `nested/progress/` has `bn-finding-owner-{1,2,3}.md` (concurrent
same-role → collapses to `bn-finding-owner ×3`). Ledger `## Log` timestamps are zeroed
(`00:00:00Z`) — ordinal-only, never used as real time.

## cold-bridge/expected.json — the P4 answer key (R3)

The resolved answer (run-id `2026-06-14-001-plan-bn-mock-skill` → session `b5bf91de`), resolved
once at authoring. **Encodes no dir-mtime heuristic** — the bridge *logic* lives in U3; this is the
assertion target only. Records the grounded F2 facts: the `activity.log` window
(`17:23:43.362Z … 17:37:07.383Z`), that **7 transcripts start in-window / 8 have any in-window
line** with multiset `bn-plan-generator ×3, bn-plan-judge ×3, bn-plan-checker ×1` (the harvester is
**out**-of-window by ~16s), that the other 4 candidate sessions have **0** in-window transcripts,
and that the session dir mtime (16:42) **precedes** the window so a dir-mtime resolver must NOT
resolve it (line-timestamps are load-bearing).
