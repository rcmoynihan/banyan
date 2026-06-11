# Edit log — debug doctrine references

The three `ce-debug` reference files are vendored **verbatim** from
`plugins/compound-engineering/skills/ce-debug/references/` into
`plugin/skills/bn-debug/references/` — no edits (they carry no `ce-` skill references,
no Every-specific services, and no flat-orchestration assumptions; the `agent-browser`
mentions in `investigation-techniques.md` are already framed as "or equivalent tools").

This log exists so the group has a sidecar if a future port becomes necessary; today it
records zero edits.

`ce-debug/SKILL.md` itself is **not vendored**: its single-context phase workflow is
re-architected as the Banyan-native debug subtree (`plugin/skills/bn-debug/SKILL.md` +
`plugin/agents/bn-debug-lead.md` + `plugin/agents/bn-hypothesis-investigator.md`), which
distributes triage/investigate/root-cause/fix across the trunk gate, the lead, and
parallel investigators. Those three files are Banyan originals (no vendor-map entries);
the methodology they implement credits upstream's ce-debug phase structure.
