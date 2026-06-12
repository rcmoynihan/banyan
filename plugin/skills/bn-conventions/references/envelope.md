# The delegation envelope

Every Banyan spawn carries an *envelope*: a structured contract the parent hands
the child. It is invariant 5 (AGENTS.md "Budgets are explicit"). The envelope is
what keeps a depth-5 tree from blowing up geometrically -- vague delegation
("go review this") spawns vague subdelegation, which spawns more, and the cost
multiplies at every layer. A crisp envelope bounds the objective, the output, the
blast radius, and the budget, so a child knows exactly what to do, where to write
it, what not to touch, and how much it may spend.

The harness gives us one channel: the Agent tool passes a single prompt *string*.
So the envelope is a labeled text block embedded verbatim inside that prompt. There
is no structured envelope object, no depth counter, no child quota enforced by the
runtime. Every guarantee here is **prompt-level discipline**, made auditable by the
run ledger (see `ledger.md`, authored alongside this doc). Read this before you
write any agent that spawns children.

---

## The envelope fields

Every spawn carries these fields. They are the whole contract; nothing load-bearing
travels outside them.

| field | what it is |
|---|---|
| `objective` | One crisp goal, one sentence. Not a role ("be a reviewer") -- a target ("find correctness bugs in the diff at HEAD"). |
| `artifact_path` | The single file the child MUST write (invariant 3, artifacts over prose). The child's final message is a verdict plus this path -- never the payload. |
| `output_format` | What the artifact contains: schema name, section headings, or "JSON per `schemas/findings-schema.json`". The parent reads the file expecting this shape. |
| `boundaries` | Explicit do-not-touch paths and do-not-do actions. Always includes the protected artifacts (AGENTS.md section 5). Names the file sets this child must stay out of so siblings can write them (invariant 2). |
| `tool_guidance` | Which tools and approaches to use; least privilege. Names the read/search tools expected, whether Bash may run the suite, and -- for a child that is itself a lead -- which `Agent(...)` types are in play. |
| `budget` | `{ max_children, depth_remaining }`. The hard limits: how many children this agent may spawn and how many more delegation hops remain. |
| `effort_class` | `lightweight` \| `standard` \| `deep`. Scales the spawn count (see below). The parent sets this from its own effort read; the child honors it. |

`budget` sub-fields:

- `max_children` -- integer. The most children this agent may spawn (0 means
  "do it inline, spawn nothing").
- `depth_remaining` -- integer. Delegation hops left below this agent. When this
  agent spawns a child it passes `depth_remaining - 1`. At `depth_remaining: 0`
  the agent does the work **inline** and spawns nothing.

Model is **not** an envelope field. Each agent runs at the model pinned in its
own `model:` frontmatter (invariant 7); a lead does not pass a `model:` override
when it spawns, so a child always runs at its declared tier.

---

## The canonical template

A lead embeds this block verbatim into each child's spawn prompt and fills every
field. Formatting it identically every time is what makes the ledger auditable:
echoed envelopes line up, and a violation is a visible diff. Copy this block:

```
=== BANYAN ENVELOPE ===
objective:       <one crisp goal, one sentence>
artifact_path:   docs/runs/<run-id>/<dir>/<file>
output_format:   <schema name | headings | "JSON per schemas/...">
boundaries:      <do-not-touch paths/actions; always lists protected artifacts>
tool_guidance:   <tools + approach; least privilege>
budget:
  max_children:    <int>
  depth_remaining: <int>
effort_class:    <lightweight | standard | deep>
=== END ENVELOPE ===
```

### Filled-in example

A `bn-review-lead` (at `depth_remaining: 3`, effort `standard`) spawning one
`bn-correctness-reviewer`. The reviewer runs at its own pinned model; the lead
passes `depth_remaining: 2` (its own 3, minus one):

```
=== BANYAN ENVELOPE ===
objective:       Find correctness bugs in the staged diff for run 2026-06-10-007.
artifact_path:   docs/runs/2026-06-10-007/findings/correctness-<id>.json
output_format:   One JSON object per finding, conforming to schemas/findings-schema.json.
boundaries:      Read-only review. Do NOT edit source, run migrations, or touch
                 docs/brainstorms, docs/plans, docs/solutions, docs/runs (except your
                 own artifact_path). Do not write any file a sibling reviewer owns.
tool_guidance:   Read, Grep, Glob to inspect the diff and surrounding code; Bash to
                 reproduce a suspected failure; Write only to artifact_path. Least
                 privilege -- no Agent spawns.
budget:
  max_children:    0
  depth_remaining: 2
effort_class:    standard
=== END ENVELOPE ===
```

Here `max_children: 0` makes the reviewer a leaf: it works inline and returns a
verdict plus its artifact path. The lead later reads that JSON file -- not the
reviewer's prose -- to decide what to do.

### Filled-in example (brief artifact)

A `bn-research-lead` (at `depth_remaining: 3`, effort `deep`) spawning one
`bn-repo-researcher`. The artifact is a markdown brief under `briefs/`, not a
findings JSON -- the same envelope shape carries both artifact classes:

```
=== BANYAN ENVELOPE ===
objective:       Map how the auth middleware wires into the request pipeline; note any
                 half-deprecated paths worth chasing.
artifact_path:   docs/runs/2026-06-10-007/briefs/repo-auth-middleware.md
output_format:   Markdown brief: findings, sources (file:line), open questions. No raw dumps.
boundaries:      Read-only. Do NOT edit source or touch docs/brainstorms, docs/plans,
                 docs/solutions, docs/runs (except your own artifact_path).
tool_guidance:   Read, Grep, Glob to trace the code; Write only to artifact_path.
budget:
  max_children:    1
  depth_remaining: 2
effort_class:    deep
=== END ENVELOPE ===
```

`max_children: 1` lets this researcher spawn at most one `bn-thread-chaser` if it finds
a thread worth pursuing -- and only on a real lead, not eagerly (invariant 4). The
research-lead reads the brief file, never the researcher's final-message prose.

---

## The honoring contract

Every lead and every child obeys all of these. They are not enforced by the
runtime; they are enforced by prompt discipline and audited from the ledger.

(a) **Echo on start.** On start, a lead writes its received envelope verbatim as
the first block of its progress file, `docs/runs/<run-id>/progress/<lead>.md`. This
makes every later spawn checkable against the budget the lead was actually handed:
a reviewer counting spawns in the progress log can see whether the lead exceeded
`max_children`. No echo, no audit trail.

(b) **Depth accounting is prompt-level.** The harness exposes no depth counter, so
depth lives only in the envelope. When a lead spawns a child it passes
`depth_remaining - 1` in the child's envelope. At `depth_remaining: 0` the agent
**completes the work inline and spawns nothing** -- it has hit the floor. This is
the only thing standing between the tree and unbounded recursion, so it is
non-negotiable: an agent at depth 0 that spawns anyway is a budget violation
visible in the ledger.

(c) **Child cap.** A lead spawns at most `max_children` children across its whole
run. If the work needs more hands than the cap allows, the lead does the remainder
inline or reports the shortfall upward -- it does not quietly exceed the cap.

(d) **Honor boundaries.** A child treats `boundaries` as hard walls: it does not
read, edit, or "clean up" anything they forbid, and it never writes a file set a
sibling owns (invariant 2, one writer per file set). The protected artifacts
(AGENTS.md section 5) are always off-limits regardless of what `boundaries` lists.

(e) **Decompose on failure, not eagerly.** Default depth is 1-2 (invariant 4).
Depths 3-5 are *reserve capacity*: a lead spends them only when a child fails, the
work is genuinely too big for one context, or context pressure forces a split --
never preemptively because the budget *allows* it. A generous `depth_remaining` is
a ceiling, not a target. Most subtrees stay shallow.

## Degraded validation (`test_command: "none detected"`)

Test-command detection stays cheap and finite. When an envelope carries
`test_command: "none detected"`, every consumer treats validation as unavailable:
it never claims the suite was run, green, or passed; it names the missing validation
in its artifact; and it propagates an explicit `UNVERIFIED (no test command)` marker
upward in its verdict line. If a delivery unit names its own runnable `Verification`
check, the unit runs that check as a substitute and records exactly what ran. The
upward marker remains because the repo-level validation spine is unavailable.

---

## effort_class -> spawn-count scaling

`effort_class` is the dial that makes effort scaling visible in the ledger: the
classification *must* change spawn counts. A lead reads `effort_class` and sizes
its panel accordingly:

| effort_class | what the lead does | spawns |
|---|---|---|
| `lightweight` | Inline check. Trivial input -- a one-line diff, a yes/no question. The lead does the work itself or spawns a single scout. | 0, or minimal |
| `standard` | The normal panel: the always-on set for this subtree (e.g. the standard reviewer panel), plus conditionals triggered by the input. | the normal N |
| `deep` | Full panel plus optional extras: the conditional reviewers, sampling/multiple-attempt modes, an extra judge pass. | N + extras |

The rule that must hold: on the *same input*, a `lightweight` run spawns strictly
fewer agents than a `standard` run, and `standard` no more than `deep`. If
`effort_class` does not change the spawn count, it is not being honored. This is an
asserted fixture behavior -- see `envelope-test-plan.md`.

`effort_class` and `max_children` work together: `effort_class` tells the lead what
*shape* of panel to build; `max_children` is the hard ceiling it must not exceed
even when the effort read suggests more. When they conflict, the cap wins, and the
lead reports the squeeze upward.

---

## Envelopes and the allowlist (the org chart)

Two mechanisms bound a spawn, and they are orthogonal:

- **The allowlist** -- a lead's `tools:` frontmatter, `Agent(typeA, typeB, ...)` --
  bounds **which** child *types* are reachable at all. It is the declared org chart
  (AGENTS.md section 2). If a type is not in the allowlist, no envelope can summon
  it.
- **The envelope** -- `max_children` and `depth_remaining` -- bounds **how many**
  children this agent may spawn and **how deep** the chain may go.

So the allowlist is the roster of who *can* play; the envelope is how many you put
on the field and how far they may run. A lead can never spawn a type outside its
allowlist no matter what an envelope says, and it can never exceed `max_children`
or go below `depth_remaining: 0` even for a type the allowlist permits.

> **Empirical caveat (verify before relying).** `Agent(agent_type)` allowlist
> semantics in *nested* contexts are under-verified on Claude Code 2.1.172
> (AGENTS.md section 2). **Do not** assume the runtime blocks an off-roster
> spawn -- the prompt-level contract in this envelope (child cap, depth floor,
> declared types) is the load-bearing guarantee. If the harness ignores nested
> allowlists, depth and child accounting fall back entirely to the envelope
> discipline above.

---

## In one line

The allowlist says *who*; the envelope says *what*, *where*, *how many*, *how
deep*, and *how hard*; the ledger says *whether you obeyed*.
