# Harness changelog

This file logs Banyan's **harness self-improvements** -- the changes that come out of the
compounding-on-itself loop (U16). The `bn-harness-engineer` agent mines accumulated run data
for recurring harness failures and writes evidence-cited proposals to
`docs/harness-proposals/`. It **never self-applies.** A human reviews each proposal, decides,
edits the `plugin/` file, and records the APPLIED change here -- with its evidence, the proposal
it came from, and who merged it. This file is the audit trail of how the harness changed itself,
one human-approved step at a time.

## Entry format

Each applied change is one entry:

```
### <YYYY-MM-DD> -- <one-line change>

- **Change:** <what was edited in plugin/ -- the file + the gist of the diff>
- **Evidence (run-ids):** <the run-ids whose ledgers/transcripts justified it>
- **Proposal:** docs/harness-proposals/<date>-<slug>.md
- **Applied by:** <human who reviewed and merged>
```

Table form (equivalent) for a quick scan:

| date | change | evidence run-ids | proposal path | applied-by |
|------|--------|------------------|---------------|------------|
| <YYYY-MM-DD> | <one-line change> | <run-ids> | docs/harness-proposals/<date>-<slug>.md | <human> |

## Proposed changes

_None yet._

(`bn-harness-engineer` appends a one-line **Proposed** row here when it writes a proposal to
`docs/harness-proposals/` -- this section is the unreviewed queue. A human triages from here;
nothing in this section is applied. Format: `| <date> | <one-line> | <run-ids> | docs/harness-proposals/<date>-<slug>.md | proposed |`.)

## Applied changes

### 2026-06-11 -- Four anti-pitfall improvements

- **Change:** Added `bn-spec-fidelity-reviewer` and wired it into unit mini-reviews and
  spec-bearing review panels.
- **Change:** Added `check-boundary.mjs` with unit tests and advisory boundary adjudication
  in the delivery/integration flow.
- **Change:** Tagged plan requirements as `[confirmed]` or `[assumed]`, with confirmation
  clauses surfaced at plan checkpoints.
- **Change:** Added explicit `UNVERIFIED (no test command)` propagation for degraded
  validation paths.
- **Evidence (run-ids):** n/a (direct maintainer change)
- **Proposal:** n/a (direct maintainer change)
- **Applied by:** maintainer

**Human-only section.** Only a human writes here, after reviewing a Proposed entry, editing the
`plugin/` file themselves, and merging. The agent never writes to this section. Use the entry
format above; move the corresponding row out of "Proposed changes" when you apply it.

## How this works

1. **Propose.** `/bn-tune` dispatches `bn-harness-engineer`, which mines `docs/runs/` ledgers
   (and subagent transcripts where present) for RECURRING harness failures and writes one
   PR-style, evidence-cited proposal per pattern into `docs/harness-proposals/`. Every proposal
   needs >=2 cited occurrences (run-ids + file:line); one-offs are dropped. The agent has no
   `Edit` on `plugin/` -- it cannot self-apply.
2. **Review.** A human reads each proposal: the pattern, the cited evidence, the targeted
   `plugin/` file, the suggested diff, and the expected effect. The agent may have appended a
   "Proposed" entry; the human's job is to judge it.
3. **Apply (human only).** If the human agrees, THEY edit the `plugin/` file (the agent never
   does) and record the APPLIED change here under "## Applied changes" using the entry format --
   linking the proposal and citing the evidence run-ids.

Proposals land in `docs/harness-proposals/`; applied changes are recorded here by the human who
merges. The harness improves itself by PROPOSING to its maintainer, never by editing itself.
