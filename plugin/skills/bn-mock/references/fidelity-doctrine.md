# Mock fidelity doctrine — the anti-real-machine boundary

This is the single authoritative boundary spec for `/bn-mock` and `bn-mock-builder`. Every unit
that touches the builder restates it; the builder reads this file from its envelope before it
builds. The boundary below is the product's identity line: **the moment a mock does real work it
has stopped being a mock and become a half-built MVP.** A mock fakes surface and structure so a
human can *see and click the idea* and surface design holes — it never implements the idea.

## 1. Prohibited-actions checklist (R9 / R7) — the hard wall

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
      is a user action surfaced by the trunk (R24), never a leaf action.

If the idea seems to *demand* real work to be meaningful, that is itself a finding: fake the
surface, and log in the mock-notes that the real machine was deliberately not built and why.

## 2. Functional over polished (R8)

Build the structure and the flow, not the finish. Styling, theming, animation, and pixel polish
are OMITTED **unless the idea is itself about polish** (a redesign, a visual-language test, a
motion study) — in which case the polish *is* the surface under test and gets built. Default:
plain, legible, obviously-a-mock. A gray box labeled "chart goes here" beats a real chart wired
to fake data, because the fake-real chart hides the boundary.

## 3. The 2–3 telling-scenarios heuristic (R10)

A mock covers **2–3 scenarios chosen to surface design holes**, not exhaustive coverage. Default
heuristic, unless the input clearly warrants otherwise:

1. **One happy path** — the core flow working as intended.
2. **One edge / empty / error state** — empty list, validation failure, "no results", a rejected
   input. This is where most design holes hide.
3. **One "pressure" case** — the scenario that stresses the idea's weakest assumption (the
   high-volume case, the adversarial input, the ambiguous request, the conflicting-data case).

Record the scenario choice as an explicit design decision in the mock-notes (which three, and
why those). If the input clearly warrants a different set (e.g. a single-flow idea with no
meaningful edge), say so and record the deviation.

## 4. Invent-vs-block decision tree (R11 / R12) — what to do with an unknown

When the build hits a decision the input does not resolve, classify it and act:

```
Is the decision reversible AND mock-local
(changing it later costs nothing outside this mock,
 and it does not define the product, security, privacy, or price)?
        │
   YES ─┴─> INVENT-AND-LOG (R11):
            pick a reasonable default, BUILD it, and record in mock-notes:
            the choice made + the alternatives considered. Do NOT stop to ask mid-build.
        │
    NO ─┴─> Is it high-blast-radius — product-defining, security, privacy,
            pricing, or genuinely no-safe-default?
                │
           YES ─┴─> RENDER-A-PLACEHOLDER (R12):
                    build a VISIBLE placeholder or a labeled "blocked scenario"
                    (e.g. a panel reading "PRICING — TBD, blocked: needs product decision"),
                    and LOG an open question in mock-notes' unresolved-questions section.
                    Do NOT silently pick a value. The visible gap is the finding.
```

The test for "high-blast-radius": would picking wrong here mislead the human into thinking a
product/security/privacy/pricing decision has been made when it has not? If yes, it is R12 — make
the gap loud, do not paper over it.

### Worked example — AE1 (pricing TBD), embedded verbatim

> **Idea:** a SaaS subscription upgrade screen. The input never states the prices.
>
> **Wrong (silent invent):** the builder hardcodes "$29/mo Pro, $99/mo Team" and builds a
> polished pricing table. A reviewer playing the mock now believes pricing is decided. Pricing is
> product-defining and high-blast-radius — this is exactly the R12 case the invent rule must not
> swallow.
>
> **Right (R12 placeholder):** the builder renders the upgrade screen with the tier *structure*
> (Free / Pro / Team columns, feature rows) but each price cell reads a visible placeholder —
> `PRICE: TBD — blocked (product decision required)` — styled to look unmistakably unfinished.
> The mock-notes' **Unresolved questions** section logs: "Pricing not provided and is
> product-defining; rendered as a visible TBD placeholder rather than invented. Open question for
> `/bn-brainstorm`: what are the tier prices and what differentiates the tiers?" The disposition
> table routes this finding to *fold into requirements*.
>
> Contrast with an R11 reversible-and-mock-local choice in the same screen: the column order, or
> whether the CTA button says "Upgrade" vs "Choose plan" — pick a default, build it, note it, move
> on. Those do not mislead anyone about a real decision.

## 5. What the builder always records (R16 playtest hook)

Every mock surfaces a **playtest script** (in the README and/or notes): 2–3 concrete things to
try, what to watch for in each, and what is intentionally fake. The playtest script is how the
human exercises the very scenarios chosen in §3 and sees the boundary from §1 — it points at the
gaps on purpose.

## 6. Where the boundary is also documented

The mock-notes schema (`mock-notes-schema.md`) carries the **Mock Reality Boundary** block —
hardcoded / fake / unrepresented / must-not-be-inferred — which is the per-mock instance of this
doctrine. This file is the rule; that block is the record of how the rule was applied to one mock.
