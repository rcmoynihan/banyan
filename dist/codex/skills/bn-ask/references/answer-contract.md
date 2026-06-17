# Answer Contract

Use this contract for `/bn-ask` responses. Optimize for a useful answer the user can
trust, not for exhaustiveness.

## Evidence Standards

- Cite repo facts with repo-relative `file:line` references.
- Cite command-derived facts with the command name and the relevant result.
- Cite external facts with official documentation URLs when possible.
- Separate observed facts from inferences.
- For absence claims, name the search scope and terms.
- For "how it works" answers, trace the real path from entry point to consequence when the
  code makes that path available.
- Every load-bearing citation is re-run by `bn-ask-checker` before the answer is finalized,
  so a `Confirmed` verdict means a citation survived that re-run — not that behavior was
  inferred from names or structure.

## Confidence Labels

Use one label and make it earn its place:

- **Confirmed** - direct source evidence answers the question.
- **Refuted** - direct source evidence contradicts the claim.
- **Partially true** - part of the claim holds, but a material qualifier or exception exists.
- **Likely** - evidence strongly supports the answer, but one link is inferred rather than
  directly proven.
- **Unknown** - the available evidence does not settle the question.

Do not use "confirmed" for behavior that was only inferred from names or structure. Use
"likely" unless the call path, config, test, or runtime evidence closes the link.

## Response Shapes

### Pinpoint

```markdown
<Direct location answer.>

Evidence:
- `<path>:<line>` - <what this source establishes>

Confidence: <label>. <One short reason.>
```

### Mechanism or Orientation

```markdown
<One-paragraph direct answer.>

Key path:
- `<path>:<line>` - <entry point or definition>
- `<path>:<line>` - <next important hop>
- `<path>:<line>` - <consequence or output>

Unknowns:
- <only include material unresolved questions; omit this section when there are none>

Confidence: <label>. <One short reason.>
```

### Hypothesis

```markdown
Verdict: <Confirmed | Refuted | Partially true | Likely | Unknown>.

<One-paragraph explanation.>

Evidence:
- `<path>:<line>` - <supporting or contradicting fact>

Search scope:
- <paths, terms, or commands used when the verdict depends on absence or coverage>

Confidence: <label>. <One short reason.>
```

### Limitation

```markdown
<Direct limitation answer.>

What is supported:
- `<path>:<line>` - <supported behavior>

What is not established:
- <unsupported behavior, missing wiring, missing test coverage, or unchecked runtime path>

Confidence: <label>. <One short reason.>
```

## Style Rules

- Lead with the answer, not the investigation story.
- Keep answers concise unless the user asked for a tour.
- Use "I did not find..." only with a search scope.
- Say "I did not verify runtime behavior" when no test, command, or execution path was run.
- Do not propose code changes unless the user asks for recommendations.
