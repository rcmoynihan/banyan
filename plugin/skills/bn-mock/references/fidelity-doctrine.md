# Mock fidelity doctrine — the anti-real-machine boundary

This is the single authoritative boundary spec for `/bn-mock` and `bn-mock-builder`. Every unit
that touches the builder restates it; the builder reads this file from its envelope before it
builds. The boundary below is the product's identity line: **the moment a mock does real work it
has stopped being a mock and become a half-built MVP.** A mock fakes surface and structure so a
human can *see and click the idea* and surface design holes — it never implements the idea.

## 1. Prohibited-actions checklist — the hard wall

The builder MUST NOT do any of the following. This is a checklist, not a judgment call: if a step
would require any item below, the mock fakes it with hardcoded local data instead.

- [ ] **No installs.** No `npm install` / `pip install` / `brew` / package-manager calls, no
      adding dependencies to any manifest, no new runtime dependency of any kind. Use only tools
      the user already has (a browser, `node`, `sh`).
- [ ] **No credentials or secrets.** No API keys, tokens, passwords, `.env` files, credential
      prompts, or auth flows that actually authenticate. A login screen is a hardcoded facade.
- [ ] **No network or external services.** No `fetch`/`curl`/socket calls to real endpoints, no
      database connections, no cloud SDKs, no third-party APIs. Any "remote" data is a local
      hardcoded constant.
- [ ] **No real persistence.** No database, no file-backed storage that survives a reload, no
      writing user data anywhere outside `mock/<slug>/**`. State may live in memory for one
      session only; "save" is faked.
- [ ] **No real computation or business logic.** No real algorithms, pricing engines, ML, search
      ranking, or calculations that compute a true answer. Outputs are hardcoded per scenario.
- [ ] **No generated migrations or config.** No schema files, no migration scripts, no CI/build
      config, no Dockerfiles, no infra-as-code — none of the machinery a real build would need.
- [ ] **No repo source edits outside `mock/<slug>/`.** The builder writes ONLY under
      `mock/<slug>/**` and its own durable notes at `.banyan/runs/<run-id>/briefs/mock-notes.md`.
      It never edits `plugin/**`, project source, `.gitignore`, or any protected artifact
      (`.banyan/brainstorms`, `.banyan/plans`, `.banyan/solutions`, other runs' dirs).
- [ ] **No deletion.** The builder never deletes `mock/` directories or any other path. Cleanup
      is a user action surfaced by the trunk, never a leaf action.

If the idea seems to *demand* real work to be meaningful, that is itself a finding: fake the
surface, and log in the mock-notes that the real machine was deliberately not built and why.

### Slug containment — a hard precondition on every Write

Containment of every builder Write inside `mock/<slug>/**` is the load-bearing guarantee behind the
write boundary above. It holds **only if `<slug>` is a validated slug.** Therefore:

- The slug MUST match `^[a-z0-9]+(?:-[a-z0-9]+)*$` — the same regex `new-run.mjs` enforces on the
  run slug. A slug containing `/`, `..`, a leading `/`, or an empty string would make
  `mock/<slug>/` resolve **outside** the mock tree (e.g. `mock/../../plugin/...`) or collapse to
  `mock/` itself, defeating both the write boundary and the cleanup cliff.
- The trunk validates the slug at derivation time (`overwrite-safety.md`) and MUST NOT populate the
  builder envelope's `inputs.slug` or spawn on a non-match.
- The builder, as defense-in-depth, **re-asserts `inputs.slug` against the same regex before its
  first Write** and returns `blocked` (without writing anything) if it does not match — it never
  trusts an unvalidated slug just because the envelope supplied it.

## 1.5 Surface coverage — one medium, a connected surface set

"Build ONE medium" is a rule about *medium*, not about *screen count*. Building a GUI **and** a
CLI **and** an API as three parallel half-mocks is the anti-pattern that rule forbids. Within the
one chosen medium, the scope unit is the **app-shell surface set**: the connected screens that make
the app legible as a whole. Mocking one screen and naming the rest in prose is the breadth failure
this section corrects — a human cannot see design holes in an app they cannot navigate.

Take a **surface inventory** of the idea and classify every surface into exactly one tier:

- **built-to-fidelity** — interactive, exercised by the 2–3 scenarios of §3. The primary flow, and
  any surface whose interaction is itself a design hole, belongs here.
- **navigable-placeholder** — a real screen **reachable from the nav shell**, with correct labels
  and structure but static/stub content and **no scenarios**. The control surfaces an app needs to
  be legible — onboarding, cold-start / empty-state entry, an auth/login facade, the profile /
  canvas editor, plan / subscription / billing, channel + settings — are navigable-placeholders
  unless one of them is the primary flow under test. A navigable-placeholder is a labeled stub
  screen reachable from the shell; it is **not** a half-mock and carries **no fake-real machinery**.
- **omitted-with-rationale** — genuinely not built; named with a one-line why.

The bound that keeps the mock disposable: **one medium; the 2–3-scenario DEPTH cap of §3 applies
per built-to-fidelity surface, not as a cap on the number of surfaces; navigable-placeholders stay
cheap because they carry no scenarios and no fake-real content.** Prefer a navigable-placeholder
over an omission whenever a control surface is needed to see the whole app.

A navigable-placeholder screen that *also* contains a high-blast-radius unknown still obeys §4: a
billing placeholder shows the tier structure with a visible `PRICE: TBD` (per §4), never an
invented price wired to look complete. "Navigable-placeholder" never licenses inventing a
product-defining value to make a screen look finished.

This tiering is a GUI/medium concern about *surface breadth*. For non-GUI media (CLI, API,
agent-transcript) the equivalent is covering the idea's main commands / routes / turns; the
legibility floor there is clean, readable output, not CSS (§2).

## 2. A legibility floor, without fake-real fidelity

Build the structure and the flow. A mock should be **pleasant enough to navigate that looking at
it is not painful** — a baseline legibility floor — while staying **obviously a mock**. Two things
are separate and must never be conflated:

- **Visual legibility is encouraged at a floor.** Readable typography, sane spacing, a neutral
  palette, a coherent layout, and a clear nav shell are *allowed and expected*. They cost nothing,
  they make design holes easier to see, and they do not touch the boundary. The shared baseline
  stylesheet (`assets/mock.css`, copied into `mock/<slug>/` — see §2.1) provides this floor so the
  builder is not reinventing CSS per mock.
- **Fake-real fidelity stays forbidden.** Dressing an *unbuilt capability* to look implemented is a
  §1 boundary violation regardless of styling. A chart wired to fake data, a priced table that
  implies pricing is decided, a search box that returns plausibly-real results — these hide the
  boundary and are prohibited. An unbuilt surface stays a **labeled placeholder panel** (e.g.
  "chart goes here — mock"), which may be cleanly styled but must read as unmistakably unfinished.

The line: **make the mock legible, never make the unbuilt look built.** Polish that is *itself the
surface under test* — a redesign, a visual-language test, a motion study — is still built as the
surface; that case is unchanged.

The "obviously-a-mock" identity is preserved by a **persistent mock banner**, not by ugliness.
Every GUI mock renders a persistent, non-dismissable banner (a top strip reading "BANYAN MOCK —
fake by design") so legibility never lets a viewer mistake the mock for a real build. The banner
is the boundary's visible signature; the baseline stylesheet must not let it be styled away. The
old "ugliness as a safety signal" rule is retired: that job now belongs to the persistent banner
plus the labeled-placeholder rule, which is why visual legibility is free to rise to a floor.

### 2.1 The baseline stylesheet is a copy, not an install

The builder copies the shipped `${CLAUDE_PLUGIN_ROOT}/skills/bn-mock/assets/mock.css` into
`mock/<slug>/mock.css` and links it relatively (`<link rel="stylesheet" href="mock.css">`, which
works under `file://` with no server). **Copying a shipped static stylesheet into `mock/<slug>/`
is a Write inside the write boundary — it is NOT an install and NOT a new runtime dependency** (it
is a vendored static file, exactly like the README the builder already writes), so §1's "no
installs / no new runtime dependency" does not forbid it. The stylesheet is plain CSS with a system
font stack and **no `@import` and no external `url(...)`** (a web font would breach the no-network
rule). The mock stays self-contained: `rm -rf mock/<slug>/` removes it whole.

## 3. The 2–3 telling-scenarios heuristic

A mock covers each **built-to-fidelity** surface (§1.5) with **2–3 scenarios chosen to surface
design holes**, not exhaustive coverage. This caps the DEPTH of each built surface, not the NUMBER
of surfaces in the inventory; **navigable-placeholder** surfaces carry no scenarios. Default
heuristic for each built surface, unless the input clearly warrants otherwise:

1. **One happy path** — the core flow working as intended.
2. **One edge / empty / error state** — empty list, validation failure, "no results", a rejected
   input. This is where most design holes hide.
3. **One "pressure" case** — the scenario that stresses the idea's weakest assumption (the
   high-volume case, the adversarial input, the ambiguous request, the conflicting-data case).

Record the scenario choice as an explicit design decision in the mock-notes (which three, and
why those). If the input clearly warrants a different set (e.g. a single-flow idea with no
meaningful edge), say so and record the deviation.

## 4. Invent-vs-block decision tree — what to do with an unknown

When the build hits a decision the input does not resolve, classify it and act:

```
Is the decision reversible AND mock-local
(changing it later costs nothing outside this mock,
 and it does not define the product, security, privacy, or price)?
        │
   YES ─┴─> INVENT-AND-LOG:
            pick a reasonable default, BUILD it, and record in mock-notes:
            the choice made + the alternatives considered. Do NOT stop to ask mid-build.
        │
    NO ─┴─> Is it high-blast-radius — product-defining, security, privacy,
            pricing, or genuinely no-safe-default?
                │
           YES ─┴─> RENDER-A-PLACEHOLDER:
                    build a VISIBLE placeholder or a labeled "blocked scenario"
                    (e.g. a panel reading "PRICING — TBD, blocked: needs product decision"),
                    and LOG an open question in mock-notes' unresolved-questions section.
                    Do NOT silently pick a value. The visible gap is the finding.
```

The test for "high-blast-radius": would picking wrong here mislead the human into thinking a
product/security/privacy/pricing decision has been made when it has not? If yes, it is the
render-a-placeholder case — make the gap loud, do not paper over it.

### Worked example — pricing TBD, embedded verbatim

> **Idea:** a SaaS subscription upgrade screen. The input never states the prices.
>
> **Wrong (silent invent):** the builder hardcodes "$29/mo Pro, $99/mo Team" and builds a
> polished pricing table. A reviewer playing the mock now believes pricing is decided. Pricing is
> product-defining and high-blast-radius — this is exactly the render-a-placeholder case the invent
> rule must not swallow.
>
> **Right (placeholder):** the builder renders the upgrade screen with the tier *structure*
> (Free / Pro / Team columns, feature rows) but each price cell reads a visible placeholder —
> `PRICE: TBD — blocked (product decision required)` — styled to look unmistakably unfinished.
> The mock-notes' **Unresolved questions** section logs: "Pricing not provided and is
> product-defining; rendered as a visible TBD placeholder rather than invented. Open question for
> `/bn-brainstorm`: what are the tier prices and what differentiates the tiers?" The disposition
> table routes this finding to *fold into requirements*.
>
> Contrast with a reversible-and-mock-local choice in the same screen: the column order, or
> whether the CTA button says "Upgrade" vs "Choose plan" — pick a default, build it, note it, move
> on. Those do not mislead anyone about a real decision.

## 5. What the builder always records — the playtest hook

Every mock surfaces a **playtest script** (in the README and/or notes): 2–3 concrete things to
try, what to watch for in each, and what is intentionally fake. The playtest script is how the
human exercises the very scenarios chosen in §3 and sees the boundary from §1 — it points at the
gaps on purpose.

## 6. Where the boundary is also documented

The mock-notes schema (`mock-notes-schema.md`) carries the **Mock Reality Boundary** block —
hardcoded / fake / unrepresented / must-not-be-inferred — which is the per-mock instance of this
doctrine. This file is the rule; that block is the record of how the rule was applied to one mock.
