# Edit log: persistence group

Covers the persistence-layer files Banyan vendors from EveryInc's
compound-engineering plugin for U5 (v1 knowledge-store compatibility).

| Field | Value |
|---|---|
| Upstream repo | https://github.com/EveryInc/compound-engineering-plugin |
| Pinned commit SHA | `4719dc509fdc45656a830e3ed6060f674e206076` |

All upstream paths below are relative to that repo at the pinned SHA. Byte-match
claims were verified with `git -C tmp/compound-engineering-upstream show
HEAD:<upstream-path> | diff - <local-path>`.

## Files in this group

### 1. `plugin/schemas/solution-frontmatter.yaml` -- VERBATIM

- Upstream: `plugins/compound-engineering/skills/ce-compound/references/schema.yaml`
- Mode: `verbatim` (copied byte-for-byte; no edits).
- This is the v1 frontmatter contract for `docs/solutions/`. Not edited -- not
  even a provenance header inside the YAML, per the U5 instruction to keep it
  byte-identical. Provenance is recorded here instead.
- Byte-match vs pinned SHA: CLEAN (no diff).

### 2. `plugin/schemas/findings-schema.json` -- VERBATIM

- Upstream: `plugins/compound-engineering/skills/ce-code-review/references/findings-schema.json`
- Mode: `verbatim` (copied byte-for-byte; no edits).
- The structured code-review findings schema that Banyan reviewers and the
  review lead depend on. Not edited.
- Byte-match vs pinned SHA: CLEAN (no diff).

### 3. `plugin/skills/bn-conventions/scripts/validate-frontmatter.py` -- VENDORED WITH PLUGIN PACKAGING

- Upstream: `plugins/compound-engineering/skills/ce-compound/scripts/validate-frontmatter.py`
- Mode: ported from the pinned SHA. The parser-safety checks match upstream's
  delimiter and scalar-quoting rules, and the Banyan copy also accepts a
  directory target.
- Byte-match vs pinned SHA: DIFFERS (intentional; packaged under `plugin/`).

#### Schema-location investigation (no edit needed)

The U5 task asked whether the validator locates its schema at a relative path
that needs adjusting to find `plugin/schemas/solution-frontmatter.yaml`. It does
NOT. The upstream validator is a pure-stdlib (`os`, `re`, `sys`) *parser-safety*
checker: it scans a doc's frontmatter with regexes for silent-corruption quoting
risks (unquoted ` #`, unquoted `: `, malformed `---` delimiters). It never opens,
imports, or path-resolves `schema.yaml`, and does not validate required-field or
enum rules. So no schema-path plumbing change was required, and none was made.
The vendored `solution-frontmatter.yaml` remains the human/agent-facing contract
(summarized in `plugin/skills/bn-conventions/references/knowledge-store.md`); the
script is independent of it by design.

#### Packaging and directory-walk support

- What: upstream `main()` accepted exactly one argument and required it to be a
  single file (`if len(argv) != 2` then `os.path.isfile`). The U5 contract
  requires the validator to accept "a given solution markdown file **or a
  directory of them**" and exit non-zero on any violation.
- Change: the plugin-packaged script dispatches on the argument: a file path
  validates directly; a directory is walked for every `*.md` beneath it, each
  validated via `validate_file`, returning exit 1 if ANY file fails and exit 0
  if all pass. A directory with no `.md` files is a usage error (exit 2).
- Why: minimal plumbing to meet the file-location contract without touching any
  validation rule. Directory iteration changes *which* files are checked, not
  *how* each is checked.

## Verification performed (U5)

- Verbatim byte-match: `solution-frontmatter.yaml` and `findings-schema.json`
  both diff-clean against the pinned SHA.
- Fixture solutions: `python scripts/validate-frontmatter.py
  test/fixture-repo/docs/solutions` passes all three seeded docs (exit 0).
- Round-trip positive: a throwaway valid doc in `tmp/` passed (exit 0).
- Round-trip negative: a throwaway doc with an unquoted ` #` in a top-level
  scalar failed (exit 1); a doc missing the `---` frontmatter delimiter failed
  (exit 1); the directory walk returned exit 1 when one of its files failed.
  Throwaway files were deleted.
