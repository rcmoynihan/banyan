---
module: "onboarding"
date: "2026-06-11"
problem_type: convention
component: documentation
severity: medium
applies_when:
  - "A repository maintains two instruction files where one is a thin shim referencing the other"
  - "Onboarding must synthesize merged doctrine without duplicating or losing content across both files"
  - "One file is the canonical source and the other is a compatibility layer"
tags:
  - instruction-files
  - onboarding
  - synthesis
  - shim-pattern
  - doctrine-merging
---

# When synthesizing instruction files, respect a shim pattern and merge into the canonical file only

## Guidance

When onboarding a repository where the project maintains a thin shim instruction file (e.g., a root `CLAUDE.md` that only contains `@AGENTS.md`) alongside a canonical instruction file (`AGENTS.md`), synthesize merged doctrine into the canonical file only. Do not edit or restructure the shim file.

The shim exists to maintain backward compatibility or to satisfy a tool-required file location without duplicating rules. Editing it breaks that contract. A merged instruction file should replace the canonical one, and the shim should be left untouched — any tool or agent reading the shim will still find the authoritative content by following its reference.

## Why

A shim file is typically thin and serves one purpose: satisfying a tool requirement or maintaining a convention without duplication. Rewriting it violates its design. When the shim contains only a reference (`@AGENTS.md`), any reader encounters a single pointer; the actual content lives in the canonical file. Trying to merge content into both files creates duplication and a maintenance burden.

If an onboarding run synthesized merged doctrine into the shim instead of the canonical file, a future contributor reading the repo source would find split responsibility: the canonical file and the shim would be out of sync or conflict, and the synthesis would appear arbitrary to someone unfamiliar with the shim's role.

## Applies when

- The project explicitly documents one file as canonical and another as a shim (e.g., in comments or in the `AGENTS.md` itself).
- The shim's content is a simple redirect or stub, not a parallel instruction tree.
- Readers of the code are likely to encounter the canonical file as the primary reference (e.g., the repo's top-level `AGENTS.md` is the standard contract; `CLAUDE.md` is a compatibility layer for tools expecting that filename).
- A merge or synthesis of instruction content is necessary.

## Verification

- The root `AGENTS.md` (or canonical file) contains explicit documentation explaining the shim relationship, e.g., "Root `CLAUDE.md` exists only as a compatibility shim that includes it."
- The synthesized merged instruction file replaces the canonical file only; the shim file is not modified.
- Readers following the shim's reference (`@AGENTS.md`) or including its pointed-to file encounter the merged content.

## Source

[AGENTS.md](../../../../AGENTS.md) (section "Instruction-file map: real vs data")
