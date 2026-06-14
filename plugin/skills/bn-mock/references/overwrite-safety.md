# Overwrite-safety + manifest mismatch cliff (R23 / R22 / AE2)

This is the pre-build data-loss gate for `/bn-mock`. Overwriting a `mock/<slug>/` that holds work
the current invocation did not create is **destructive and effectively irreversible** — so before
any `bn-mock-builder` spawn, the trunk runs the manifest check below and STOPS for user
confirmation rather than clobbering. `SKILL.md` Step 3 invokes this rule before Step 4's spawn.

The cliff is a **trunk-level `AskUserQuestion`** (a permission cliff, AGENTS.md §1.6 / §2.3),
never a silent overwrite and never a leaf action — the builder is spawned only after this gate
clears.

## Slug derivation (R29) — happens first

Derive the slug before the manifest check:

- **requirements doc** ⇒ kebab-case of the requirements `topic`;
- **plan path** ⇒ kebab-case of the plan filename stem;
- **free text** ⇒ kebab-case of a 3–5 word summary of the idea.

Validate the result against `new-run.mjs`'s slug regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`; re-derive if
it does not match. **Collision with an existing `mock/<slug>/` is resolved by the manifest check
below — never by auto-suffixing `-2`/`-3`.** Auto-suffixing was explicitly rejected: it would
silently weaken this cliff by quietly building beside foreign work instead of stopping.

## The R23 decision rule (three branches)

The trunk reads `mock/<slug>/.banyan-mock.json` and acts:

### (a) Absent or unparseable manifest ⇒ FOREIGN DIR ⇒ STOP

If `mock/<slug>/` exists but `.banyan-mock.json` is **absent or unparseable** (a directory Banyan
did not create — AE2), STOP. Do not spawn, do not write. Surface the exact path and ask the user
via `AskUserQuestion`: confirm overwrite of the foreign directory, or choose a new slug. Proceed
only on explicit confirmation.

(If `mock/<slug>/` does not exist at all, there is no collision — proceed to a fresh build,
`iteration: 1`.)

### (b) Manifest present AND fully matches ⇒ IN-PLACE ITERATION ⇒ PROCEED (R22 / R28)

If `.banyan-mock.json` is present and its **`slug` matches the target slug AND its
`source_kind`/`source_input` match the current invocation**, this is the same idea being mocked
again. Proceed without asking: the builder appends a new `## Iteration N` section to the notes
(prior iterations untouched) and increments the manifest `iteration` integer (and bumps
`last_updated`, preserving `created`).

### (c) Manifest present BUT mismatched ⇒ STOP

If `.banyan-mock.json` is present but **`slug` disagrees OR `source_kind`/`source_input` differs**
from the current invocation, the dir belongs to a *different* mock. STOP, surface the mismatch
(show what the manifest says vs. the current invocation), and ask the user via `AskUserQuestion`:
overwrite, or choose a new slug. Proceed only on explicit confirmation.

## The three-way mismatch predicate (R27), compactly

```
dir mock/<slug>/ absent                                  -> fresh build (iteration 1), no prompt
dir present, .banyan-mock.json absent/unparseable        -> STOP, ask (foreign dir, AE2)
dir present, manifest.slug == slug
   AND manifest.source_kind == kind
   AND manifest.source_input == input                    -> in-place iteration (R22), no prompt
dir present, manifest present, ANY of the three differ   -> STOP, ask (mismatch)
```

## Manifest shape this rule reads (must match U2's writer — R27)

`mock/<slug>/.banyan-mock.json` keys, written by `bn-mock-builder`:

```json
{
  "run_id": "<run-id>",
  "notes_path": ".banyan/runs/<run-id>/briefs/mock-notes.md",
  "source_input": "<free text | repo-relative doc/plan path>",
  "source_kind": "free-text | requirements-doc | plan",
  "slug": "<slug>",
  "iteration": 1,
  "created": "<ISO8601>",
  "last_updated": "<ISO8601>"
}
```

The check reads `slug`, `source_kind`, and `source_input` for the predicate. If the JSON cannot be
parsed, treat it as branch (a) — foreign/unparseable ⇒ STOP.

## AE2 walkthrough

> A user previously hand-created `mock/dashboard/` (their own scratch directory, no Banyan
> manifest). They now run `/bn-mock` and the derived slug is `dashboard`. The trunk reads
> `mock/dashboard/.banyan-mock.json` — **absent**. Branch (a) fires: the trunk STOPS, shows
> `mock/dashboard/ exists but has no Banyan manifest (foreign directory)`, and asks via
> `AskUserQuestion` whether to overwrite it or pick a new slug. Nothing is written and no builder
> is spawned until the user answers. Auto-suffixing to `mock/dashboard-2/` is **not** done — that
> would silently bypass the user's awareness of the collision.
