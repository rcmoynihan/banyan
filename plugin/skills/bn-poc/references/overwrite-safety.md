# Overwrite-safety + manifest mismatch cliff

This is the pre-build data-loss gate for `/bn-poc`. Overwriting a `poc/<slug>/` that holds work
the current invocation did not create is **destructive and effectively irreversible** — so before
any `bn-poc-builder` spawn, the trunk runs the manifest check below and STOPS for user
confirmation rather than clobbering. `SKILL.md` Step 3 invokes this rule before Step 4's spawn.

The cliff is a **trunk-level `AskUserQuestion`** (the Claude Code tool; a permission cliff,
AGENTS.md invariant 6 / §2.3), never a silent overwrite and never a leaf action — the builder is
spawned only after this gate clears. In a runtime without that tool, the cliff resolves
identically: stop, surface the path/mismatch, and wait for an explicit answer in chat; **never
auto-overwrite and never auto-suffix.** This doc-level contract holds for every restatement of the
rule below: where an in-rule branch names `AskUserQuestion` alone, the non-Claude-Code fallback
stated here still applies.

## Slug derivation — happens first

Derive the slug before the manifest check:

- **requirements doc** ⇒ kebab-case of the requirements `topic`;
- **plan path** ⇒ kebab-case of the plan filename stem;
- **free text** ⇒ kebab-case of a 3–5 word summary of the idea.

Validate the result against the slug regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` (the same regex
`new-run.mjs` enforces on the run slug); re-derive if it does not match. **This validation is a
hard precondition, not advisory:** the trunk MUST NOT populate the builder envelope's `inputs.slug`
or spawn until the derived slug matches (rationale: every builder Write target and the cleanup
command interpolate `<slug>` into `poc/<slug>/`, so an unvalidated slug would escape the poc tree
or collapse the cleanup — see `fidelity-doctrine.md` §3 Slug containment). **Collision with an
existing `poc/<slug>/` is resolved by the manifest check below — never by auto-suffixing
`-2`/`-3`.** Auto-suffixing was explicitly rejected: it would silently weaken this cliff by quietly
building beside foreign work instead of stopping.

## The decision rule (three branches)

The trunk reads `poc/<slug>/.banyan-poc.json` and acts:

### (a) Absent or unparseable manifest ⇒ FOREIGN DIR ⇒ STOP

If `poc/<slug>/` exists but `.banyan-poc.json` is **absent or unparseable** (a directory Banyan
did not create — a foreign directory), STOP. Do not spawn, do not write. Surface the exact path and ask the user
via `AskUserQuestion`: confirm overwrite of the foreign directory, or choose a new slug. Proceed
only on explicit confirmation. **A confirmed overwrite is a FRESH build, not an in-place
iteration**, and it starts `iteration: 1` and a new `# PoC notes: <slug>` / `## Iteration 1` — it
never appends onto the foreign directory's (non-Banyan) history.

**A confirmed overwrite does NOT auto-clear the dir — no actor may delete it autonomously.** The
builder never deletes (it overwrites only same-named paths, so foreign files NOT same-named would
otherwise survive intermingled with the new PoC), and the trunk's only deletion is the user-run
cleanup cliff. So "REPLACES `poc/<slug>/`" is honest ONLY if the user clears the dir first.
Therefore, on confirmation, the trunk surfaces the **clear-first step as part of the same cliff**:
the user runs `rm -rf poc/<slug>/` (the exact, slug-validated command) BEFORE the build proceeds —
deletion stays a user-consented action. The trunk spawns the builder for a fresh build only after
the dir is gone (or empty). If the user confirms overwrite but declines to clear, treat it like a
refusal of the fresh-build contract: do NOT silently build into the foreign dir claiming a fresh
PoC — either re-prompt for clearing or fire the overwrite-refused terminal. (The trunk does not run
`rm -rf` itself; it surfaces it for the user, exactly as the Step 7 cleanup cliff does.)

(If `poc/<slug>/` does not exist at all, there is no collision — proceed to a fresh build,
`iteration: 1`.)

### (b) Manifest present AND fully matches ⇒ IN-PLACE ITERATION ⇒ PROCEED

If `.banyan-poc.json` is present and its **`slug` matches the target slug AND its
`source_kind`/`source_input` match the current invocation**, this is the same idea being proven
again. Proceed without asking, but **reconcile the manifest against the actual notes before
treating the build as in-place.** The manifest (`poc/<slug>/.banyan-poc.json`) survives in the
working tree, but the notes (`.banyan/runs/.../briefs/poc-notes.md`) are gitignored run-local
state that can be cleaned — so the manifest's `iteration` is not a trustworthy count on its own.

- **Derive the next iteration from the notes, not the manifest:** read the Step-3a-selected notes
  file and take `N` = (highest `## Iteration <k>` heading actually present) `+ 1`. The manifest's
  `iteration` is a cross-check, not the source of truth.
- **If the selected notes file does not exist, or contains no `## Iteration` headings** (a fresh or
  cleaned run reused this manifest), there is no prior history to append onto — **downgrade to a
  fresh build (`iteration: 1`)** and start a new `# PoC notes: <slug>` / `## Iteration 1` rather
  than emitting an orphan `## Iteration N` over an empty file.

The trunk passes the resolved value as the builder envelope's `inputs.iteration`. The builder
writes that value verbatim (it does not increment itself), appends a new `## Iteration N` section
to the notes (prior iterations untouched), and bumps `last_updated`, preserving `created`. The
README/manifest verdict tracks the latest iteration; the notes retain the append-only history.

### (c) Manifest present BUT mismatched ⇒ STOP

If `.banyan-poc.json` is present but **`slug` disagrees OR `source_kind`/`source_input` differs**
from the current invocation, the dir belongs to a *different* PoC. STOP, surface the mismatch
(show what the manifest says vs. the current invocation), and ask the user via `AskUserQuestion`:
overwrite, or choose a new slug. Proceed only on explicit confirmation. **A confirmed overwrite
here is a FRESH build, not an in-place iteration** (the dir belonged to a different idea): it starts
`iteration: 1` and a new `# PoC notes: <slug>` / `## Iteration 1`. **As in branch (a), a confirmed
overwrite does not auto-clear the dir** — the user clears it first via `rm -rf poc/<slug>/` (the
same clear-first cliff; deletion stays user-consented) before the build proceeds, so the prior
idea's files do not survive intermingled with the new PoC. The trunk does not run `rm -rf` itself.
Only branch (b) — a fully-matching same-idea manifest — is an in-place iteration that appends
`## Iteration N`.

## The three-way mismatch predicate, compactly

```
dir poc/<slug>/ absent                                   -> fresh build (iteration 1), no prompt
dir present, .banyan-poc.json absent/unparseable         -> STOP, ask (foreign dir)
                                                            confirm-overwrite -> user clears dir (rm -rf poc/<slug>/),
                                                                                 THEN fresh build (iteration 1)
                                                            refuse-overwrite  -> overwrite-refused terminal (below)
dir present, manifest.slug == slug
   AND manifest.source_kind == kind
   AND manifest.source_input == input                    -> in-place iteration (append), no prompt
dir present, manifest present, ANY of the three differ   -> STOP, ask (mismatch)
                                                            confirm-overwrite -> user clears dir (rm -rf poc/<slug>/),
                                                                                 THEN fresh build (iteration 1)
                                                            refuse-overwrite  -> overwrite-refused terminal (below)
```

Only the fully-matching same-idea branch is an in-place iteration (append `## Iteration N`); a
confirmed overwrite of a foreign or mismatched dir is always a fresh build (iteration 1) that
starts a new `## Iteration 1`. "Replaces the dir" is achieved by the **user clearing it first**
(`rm -rf poc/<slug>/`, user-consented) — no leaf or trunk deletes it autonomously; the builder
overwrites only same-named paths, so without the user's clear-first step foreign files would survive
intermingled with the new PoC.

## The overwrite-refused terminal (a named state, not a fall-through)

When the user is asked to confirm an overwrite (branch (a) or (c)) and **refuses**, this is a
named terminal state — never a silent fall-through into a build:

- **Clean abort.** Write nothing to `poc/<slug>/`, spawn no builder, and note the refusal in the
  run ledger so the run records why it stopped. The existing foreign/mismatched dir is left
  untouched. Report to the user that the PoC was not built because the collision was not resolved.
- **OR offer to re-slug.** Offer (via `AskUserQuestion`, same fallback contract) to derive a
  different slug and re-run the gate against the new `poc/<new-slug>/`. Only a re-derived,
  regex-validated slug proceeds.

Mirror mock's collision stop-and-ask terminal: the choice is overwrite, re-slug, or clean abort —
never an auto-suffix and never a quiet build beside foreign work.

## Manifest shape this rule reads (must match the builder's writer)

`poc/<slug>/.banyan-poc.json` keys, written by `bn-poc-builder`:

```json
{
  "run_id": "<run-id>",
  "notes_path": ".banyan/runs/<run-id>/briefs/poc-notes.md",
  "source_input": "<free text | repo-relative doc/plan path>",
  "source_kind": "free-text | requirements-doc | plan",
  "slug": "<slug>",
  "iteration": 1,
  "verdict": "confirmed | confirmed-with-caveats | could-not-confirm",
  "created": "<ISO8601>",
  "last_updated": "<ISO8601>"
}
```

The check reads `slug`, `source_kind`, and `source_input` for the predicate. The `verdict` records
the **latest** iteration's verdict (so the manifest never carries a stale verdict after a re-run).
If the JSON cannot be parsed, treat it as branch (a) — foreign/unparseable ⇒ STOP.

## Worked example — foreign directory (no Banyan manifest)

> A user previously hand-created `poc/parser/` (their own scratch directory, no Banyan
> manifest). They now run `/bn-poc` and the derived slug is `parser`. The trunk reads
> `poc/parser/.banyan-poc.json` — **absent**. Branch (a) fires: the trunk STOPS, shows
> `poc/parser/ exists but has no Banyan manifest (foreign directory)`, and asks via
> `AskUserQuestion` whether to overwrite it or pick a new slug. Nothing is written and no builder
> is spawned until the user answers. If the user confirms overwrite, the trunk surfaces the
> **clear-first step** — the user runs `rm -rf poc/parser/` (their consented deletion) so the new
> PoC does not build into and intermingle with their hand-created `poc/parser/` files — and only
> then spawns the builder for a fresh `iteration: 1` build. If the user refuses to overwrite (or
> declines to clear), the overwrite-refused terminal fires: clean abort with the refusal noted in
> the ledger, or an offer to re-slug. Auto-suffixing to `poc/parser-2/` is **not** done — that
> would silently bypass the user's awareness of the collision.
