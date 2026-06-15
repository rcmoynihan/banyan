# PoC fidelity doctrine — the derived boundary + the honest no-sandbox story

This is the single authoritative boundary spec for `/bn-poc` and `bn-poc-builder`. Every unit
that touches the builder restates it; the builder reads this file from its envelope before it
builds. Where a mock fakes the surface and fakes the machine, a PoC does the inverse: **it builds
the core machine for real to answer one question — can the central IP/capability the idea rests on
actually work? — and fakes, stubs, or skips the periphery.** The identity line is therefore the
mirror of mock's: a PoC proves the crux for real and refuses to build the surface; the moment it
starts polishing the periphery it has stopped being a PoC and become a half-built MVP.

`/bn-poc` is the **first leaf in Banyan that runs real, networked, dependency-installing code.**
That blast radius cannot be hard-sandboxed. Containment here is therefore **doctrine + detection +
disclosed residual, NOT runtime prevention** — see §6. Read that section as carefully as the rest:
it is the product's honest safety story, not boilerplate.

## 1. The derived boundary + the hard floor

The boundary is **derived per-PoC from the feasibility question**: build the core for real;
fake/stub/skip the periphery (surface/UI, control data, persistence, productionization). There is
no fixed prohibited-actions checklist as in mock — installs, network, and compute are *permitted*
within the confirmed scope. What is fixed is the **hard floor**, which holds regardless of the
idea:

- The builder's **own** writes target `poc/<slug>/` and the run's own poc-notes — nothing else.
  Executed code is *expected* to write only there but **cannot be prevented** from escaping (§6).
- **No real-source edits.** The builder never edits `plugin/**`, project source, `.gitignore`, or
  any protected artifact (`.banyan/brainstorms`, `.banyan/plans`, `.banyan/solutions`, other runs'
  dirs).
- **No deployment**, no durable/regression-test or reusable scaffolding code — the artifact is
  **throwaway**. A PoC proves the crux and is meant to be deleted; it is not the start of the real
  build.
- **No deletion.** The builder never deletes `poc/` directories or any other path. Cleanup is a
  user action surfaced by the trunk, never a leaf action.

The PoC Reality Boundary block in `poc-notes-schema.md` records how this doctrine was applied to
one PoC (real / stubbed-or-faked / skipped / untrusted-input-pulled / must-not-be-inferred). This
file is the rule; that block is the record.

## 2. The permission cliffs — autonomous within the confirmed scope, STOP-and-ask outside it

Governance is **tiered**: the builder is autonomous **within the up-front confirmed scope** and
STOP-and-asks before anything outside it. The confirmed scope (a named list — see §3) is the
**sole autonomous floor**: any need not specifically enumerated is out-of-confirmed-scope and is a
cliff. Encode these as a block; each holds regardless of the derived boundary:

- **Credentials & spend — invented OR ambient.** Credentials, paid services, and any
  spend-incurring action are never used autonomously — neither invented (a fabricated key) NOR
  **ambient**: `~/.aws`, `~/.netrc`, env-var credentials, a logged-in `gh`/`npm`/`docker`, cloud
  CLIs. The builder must not autonomously authenticate against ambient credentials; any such need
  is STOP-and-ask. (The runtime cannot *prevent* a Bash leaf from reaching ambient credentials —
  this is doctrine + cliff, not enforcement; §6.)
- **Network = read-only public fetch from named hosts.** The confirmed scope names network as
  read-only public fetch from the anticipated hosts. Any outbound write/upload/POST beyond what
  the fetch protocol requires, or any host not in the confirmed list, is a STOP-and-ask cliff.
  **Egress** cannot be harness-enforced; the builder must not place secrets, `.env`, or repo
  paths where executed code can read them.
- **Untrusted input — installed deps and fetched data.** Installed dependencies and fetched data
  are **untrusted input**, treated as inert: never `eval`/execute fetched content beyond the crux.
  The untrusted-input pull is recorded in the PoC Reality Boundary. (The malicious-dep /
  post-install-script residual is the disclosed accepted risk; §6.)
- **Concrete-items scope.** The confirmed scope names **concrete items** — named packages, named
  hosts/endpoints, named data sources — not categories. Any un-enumerated need is out-of-scope and
  is a cliff.
- **Mid-build budget mis-size.** A mid-build discovery that the confirmed budget is clearly
  mis-sized is a STOP-and-ask re-touch (the same class as the out-of-scope cliffs), not a silent
  grind to exhaustion.

Each cliff resolves as a permission cliff (AGENTS.md invariant 6 / §2.3): STOP, surface the need,
and wait for an explicit answer — never proceed autonomously past the confirmed scope.

## 3. Slug containment — a hard precondition on every Write

Containment of every builder Write inside `poc/<slug>/**` is the load-bearing guarantee behind the
write boundary in §1. It holds **only if `<slug>` is a validated slug.** Therefore:

- The slug MUST match `^[a-z0-9]+(?:-[a-z0-9]+)*$` — the same regex `new-run.mjs` enforces on the
  run slug. A slug containing `/`, `..`, a leading `/`, or an empty string would make
  `poc/<slug>/` resolve **outside** the poc tree (e.g. `poc/../../plugin/...`) or collapse to
  `poc/` itself, defeating both the write boundary and the cleanup cliff.
- The trunk validates the slug at derivation time (`overwrite-safety.md`) and MUST NOT populate the
  builder envelope's `inputs.slug` or spawn on a non-match.
- The builder, as defense-in-depth, **re-asserts `inputs.slug` against the same regex before its
  first Write** and returns `blocked` (without writing anything) if it does not match — it never
  trusts an unvalidated slug just because the envelope supplied it.

Note this is sharper for a PoC than for a mock: a mock only writes files into `mock/<slug>/`, but a
PoC also *executes code* whose own writes are expected (not guaranteed) to stay in `poc/<slug>/`.
The slug-validated write confinement is one of the four containment legs in §6, paired with the
post-run detection self-check that catches what the confinement cannot prevent.

## 4. In-scope-vs-stop-and-ask decision tree — what to do with an unknown

When the build hits a decision the input does not resolve, classify it and act:

```
Is the unknown reversible AND poc-local AND inside the confirmed scope
(changing it later costs nothing outside this PoC,
 and it needs no install/host/data/credential beyond the confirmed list)?
        │
   YES ─┴─> PICK-AND-LOG:
            pick a reasonable default, BUILD it, and record in poc-notes the choice +
            alternatives. Do NOT stop to ask mid-build.
        │
    NO ─┴─> Is it out-of-confirmed-scope OR high-blast-radius
            (a new install/host/data source, a credential, spend, egress,
             a destructive/external side effect, or a budget mis-size)?
                │
           YES ─┴─> STOP-AND-ASK:
                    write partial/blocked poc-notes naming exactly what is needed and why,
                    and return to the trunk for a scope re-confirmation. Do NOT autonomously
                    install / fetch / authenticate / spend past the confirmed scope.
```

The test for "high-blast-radius": would proceeding here install something un-named, reach a host
or credential not in the confirmed list, egress data, or spend money? If yes, it is the
STOP-and-ask case — surface it, do not grind past the confirmed floor.

## 5. Crux-first, budget-bounded, post-hoc verdict

- **Crux-first.** Target the single riskiest unknown and spend the confirmed budget proving it;
  skip easy scaffolding. The budget carries a unit (assumed primary: build-run iterations, scaling
  with `effort_class`) and a one-line sizing basis the user confirmed up front.
- **Budget wall.** Budget exhausted without confirmation ⇒ stop, return `could-not-confirm`,
  record the wall hit and what it would take to get further. Never grind unbounded.
- **Post-hoc verdict, anchored to the crux.** The confirmation bar is derived **post-hoc** from
  what the build actually attempted — but the judgment is **anchored to the confirmed crux as
  written up front**, not re-targeted after the shot. The verdict scale is asymmetric:
  `confirmed` / `confirmed-with-caveats` / `could-not-confirm`, **never** "disproven" /
  "impossible". `confirmed-with-caveats` names the gap between crux-as-confirmed and result.
  Distinguish a feasibility `could-not-confirm` (the crux genuinely resisted) from an
  **environmental-inconclusive** outcome (network timeout, partial install, null signal) that
  routes to "retry with infra," not "pivot the idea".

## 6. The no-sandbox acknowledgment — doctrine + detection + disclosed residual

State it plainly: **real execution and network access here are doctrine-permitted within the
confirmed scope, NOT sandbox-contained.** A Bash/Write leaf that runs arbitrary code, installs
dependencies, and reaches the network **cannot be prevented** at runtime from writing outside
`poc/<slug>/`, reaching ambient credentials, or egressing data. This is the repo-wide reality that
"there is no … quota enforced by the runtime; every guarantee here is prompt-level discipline"
(the envelope doctrine) made concrete for an execution leaf — the analogue of the mock builder's
hard wall and the dogfood verifier's execution-specific permission cliff, but for a leaf that is
*allowed* to run. The residual is named and accepted, not papered over: executed code can write
outside `poc/<slug>/`, reach ambient creds, and egress data.

Containment therefore rests on **four legs plus a detection self-check**, never on a runtime
sandbox:

1. **Doctrine** — this file and the builder body, restated at every execution site.
2. **Bounded permission cliffs** — §2: autonomous only within the confirmed scope; STOP-and-ask
   outside it (ambient creds, egress, untrusted data, un-named installs/hosts/spend, budget
   mis-size).
3. **Validated-slug write confinement** — §3: the builder's own writes confined to a
   regex-validated `poc/<slug>/`.
4. **The up-front confirmed scope** — §2/§3: a concrete named list of packages/hosts/data, the
   sole autonomous floor.

Plus the **post-run detection self-check** (the enforcement-by-detection leg, specified in
`bn-poc-builder.md`): after the build, run `git status --porcelain` against a pre-build snapshot;
if the tree changed outside `poc/<slug>/` (and the run's own notes), record the out-of-poc
mutation as an explicit caveat naming the changed paths and **downgrade the verdict** —
**downgrade-and-disclose, NOT abort** (a PoC's whole point is to have run; this is the deliberate
contrast with `bn-dogfood-verifier`'s abort-on-dirty). This self-check is how the boundary is
*enforced by detection* once execution has already escaped what doctrine could prevent.
