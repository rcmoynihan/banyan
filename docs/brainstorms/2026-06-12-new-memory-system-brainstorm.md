---
title: "Banyan memory system brainstorm"
date: 2026-06-12
status: proposed
provenance: >
  Research synthesis on agent memory architectures, retrieval systems, knowledge
  graph options, local-first databases, and Banyan's existing file-based ledger
  and knowledge-store conventions.
---

# Banyan memory system brainstorm

Banyan's durable memory should stay file-first, auditable, and easy to inspect on
disk. The new memory system is not a replacement for `.banyan/runs/` or
`.banyan/solutions/`; it is a typed retrieval and curation layer over those
artifacts.

The complete proposal:

- `.banyan/runs/<run-id>/` remains **episodic memory**: what happened in a run,
  which claims were tested, which commands ran, what artifacts were produced,
  and which candidate lessons were staged.
- `.banyan/solutions/` remains **semantic memory**: durable, curated knowledge
  about project conventions, architecture patterns, recurring bugs, tool
  behavior, and verified fixes.
- `docs/procedures/` becomes **procedural memory**: reusable playbooks,
  checklists, and operating patterns that agents should execute, not merely
  recall.
- `.banyan/memory/index.sqlite` becomes a generated **memory index** over those
  canonical markdown files, with SQLite FTS5 for lexical search, `sqlite-vec`
  for embedding search, and metadata tables for typed filtering, provenance,
  scoring, staleness, and reuse counters.
- Banyan agents retrieve through a small set of memory commands instead of
  ad hoc `grep`: `bn-memory-index`, `bn-memory-search`, and
  `bn-memory-curate`.
- The curator promotes, merges, retires, and refreshes records using the same
  causal-safety rules Banyan already values: no durable causal lesson without a
  tested intervention and provenance.

Everything else is optional. Mem0, Zep, Graphiti, Letta, Qdrant, Weaviate,
Neo4j, GraphRAG, and similar systems are useful reference points or future
adapters, but they are not the default Banyan memory architecture. The default
is a local generated index over human-readable markdown.

## The Design Bar

Banyan's memory system has to satisfy four constraints at once.

First, the source of truth must remain inspectable. A memory entry that changes
how future agents behave should be reviewable in a diff, editable by a human,
and recoverable from version control. Markdown is good at that; a vector
database is not.

Second, retrieval has to stop being mostly lexical. `grep` is fast and
transparent, but it misses semantically similar lessons when the words differ,
it cannot rank by freshness or verification strength, and it does not know
which result is a durable convention versus an unverified observation from one
run.

Third, memory must be typed. A run transcript, a convention, a reusable
procedure, a code reference, and a causal diagnosis are not interchangeable.
They have different freshness rules, promotion rules, and retrieval value.

Fourth, durable memory must resist poisoning. A false causal explanation in
`.banyan/solutions/` is worse than a missed optimization because it can bias every
future run. Banyan should remember aggressively only when provenance is strong,
and otherwise preserve weaker observations as lower-confidence context.

## The Recommended Architecture

The system has two layers: canonical artifacts and a generated memory index.

Canonical artifacts are plain files:

- `.banyan/runs/<run-id>/` stores episodic evidence from each run.
- `.banyan/solutions/` stores curated semantic knowledge.
- `docs/procedures/` stores executable operating knowledge.

The generated index lives outside the canonical docs:

- `.banyan/memory/index.sqlite`
- `.banyan/memory/embeddings/` if the selected embedding backend wants
  sidecar storage
- `.banyan/memory/cache/` for transient retrieval or reranking cache entries

The index is disposable. If it is deleted, Banyan rebuilds it from markdown.
The markdown files are authoritative; SQLite is the fast query surface.

The default database is SQLite because it fits Banyan's local-first plugin
shape. It is zero-daemon, easy to rebuild, easy to inspect, works in ordinary
host repos, and can combine structured tables with full-text search. FTS5
provides BM25-style lexical ranking. `sqlite-vec` adds local vector similarity
without introducing a service dependency.

The index schema centers on typed memory records:

```text
memory_record
  id
  memory_type              # episode | solution | procedure | concept | code_reference
  title
  summary
  body_excerpt
  source_path
  source_anchor
  run_id
  git_sha
  created_at
  updated_at
  indexed_at
  claim_type              # tested | inspected | assumed
  verification_status     # verified | unverified | contradicted | stale
  problem_type
  severity
  tags
  source_agent
  stale_status
  reuse_count
  last_used_at
```

FTS tables index titles, summaries, tags, problem types, and selected body
chunks. Vector tables index embeddings for the same records or chunks.
Relationship tables connect related records:

```text
memory_edge
  source_id
  target_id
  edge_type                # supports | contradicts | supersedes | specializes | references
  evidence_path
```

This is a graph-shaped relational model, not a full graph database. It gives
Banyan the most useful graph behavior, such as contradiction and supersession
tracking, while keeping the default runtime simple.

## Retrieval Behavior

Every retrieval call should be hybrid:

1. Run FTS5 lexical search for exact names, command strings, error messages,
   file paths, symbols, and domain vocabulary.
2. Run vector search for semantically similar incidents, procedures, and
   solutions.
3. Apply metadata filters from the task context: memory type, path globs,
   problem type, claim type, verification status, tags, and staleness.
4. Merge candidates with a deterministic score.
5. Return a compact result set with citations to canonical files.

The initial scoring model can be simple and explicit:

```text
score =
  lexical_score
  + semantic_score
  + verification_bonus
  + task_type_bonus
  + severity_bonus
  + reuse_bonus
  + recency_bonus
  - staleness_penalty
```

Verification should matter more than semantic similarity. A merely similar but
unverified memory should not outrank a tested lesson that directly cites the
same subsystem. Staleness should penalize body prose and code references more
than general conventions, because code paths and command behavior drift faster
than project values.

The search result format should be small enough to push into delegation
envelopes:

```text
- title
  memory_type
  relevance_reason
  confidence
  claim_type
  verification_status
  source_path
  source_anchor
  summary
```

Agents should not receive raw embedding neighbors. They should receive cited,
typed, ranked memory cards with enough provenance to decide how much trust to
place in each one.

## Memory Types

### Episodic Memory

Episodic memory records events and evidence from a specific run. It answers:

- What happened?
- Which commands ran?
- Which tests passed or failed?
- Which findings were opened or resolved?
- Which hypotheses were considered?
- Which candidate lessons were staged?

The source remains `.banyan/runs/<run-id>/`. The index extracts compact event
cards from progress files, findings, fact cards, staged lessons, and command
outputs. Episodic memory is useful for resuming interrupted work, avoiding
duplicate investigation inside a run, and giving the curator evidence for
promotion.

Episodic records should decay by default. Most run details are valuable for
hours or days, not months. Durable lessons are promoted into semantic or
procedural memory.

### Semantic Memory

Semantic memory is curated project knowledge. It answers:

- What conventions does this repo follow?
- What architecture patterns recur?
- Which fixes have worked for this kind of failure?
- Which causal claims are backed by tested interventions?
- Which assumptions are known to be unsafe?

The source remains `.banyan/solutions/`. These records should carry the strongest
provenance and the highest retrieval weight when verified.

Semantic memory should retain the current causal gate. `claim_type: tested`
requires an intervention, not just a passing suite. `claim_type: inspected` is
still useful, but it should rank lower and should not become a durable causal
lesson unless evidence improves.

### Procedural Memory

Procedural memory tells agents what to do. It answers:

- What checklist applies before editing plugin content?
- How should Banyan validate a proposed memory record?
- What steps reliably reproduce a review A/B run?
- What exact command sequence exercises a smoke test?

The source should be `docs/procedures/`, with one playbook per file. Procedures
are different from semantic lessons because a procedure is executable guidance:
inputs, preconditions, steps, outputs, and failure handling. The index should
retrieve procedures aggressively when a task matches their trigger conditions.

A procedure file can use a compact shape:

```yaml
---
title: "Review A/B evaluation"
memory_type: procedure
triggers:
  - review harness changes
  - reviewer prompt changes
inputs:
  - target branch
  - fixture scenario
outputs:
  - scorecard update
verification:
  - eval/review-ab/results/SCORECARD.md updated
---
```

The body should describe the current procedure, not the history of how it came
to exist.

### Concept Memory

Concept memory is a lightweight abstraction layer over repeated facts and
terms. It answers:

- What does "one writer per file set" mean in Banyan?
- Which artifacts are protected?
- What is the difference between a run fact and a solution?
- Which agent owns a given responsibility?

Concept records can be extracted from existing docs rather than authored as a
separate directory at first. They help retrieval bridge vocabulary gaps:
"durable knowledge", "solution store", and "semantic memory" can resolve to the
same concept.

### Code Reference Memory

Code reference memory links knowledge to implementation surfaces. It answers:

- Which files implement lesson harvesting?
- Which validator checks solution frontmatter?
- Which agent prompt reads the knowledge store?
- Which commands exercise the plugin smoke test?

These records should be regenerated often. They are valuable but fragile,
because line numbers, symbols, and file ownership can drift quickly.

## Curation Behavior

The curator should become the memory maintenance loop, not only a markdown
promoter.

It should perform these jobs:

- Promote staged lessons from `.banyan/runs/<run-id>/lessons-staging/` into
  `.banyan/solutions/` when evidence is strong enough.
- Extract reusable procedures into `docs/procedures/` when a repeated sequence
  is useful as an operating pattern.
- Merge duplicates and near-duplicates.
- Mark stale records when cited paths disappear, commands no longer exist, or
  a later record contradicts an older one.
- Maintain `reuse_count` and `last_used_at` when a memory result is selected by
  an agent and appears in a run artifact.
- Refresh the generated SQLite index.

The curator should preserve Banyan's current safety stance:

- A causal solution requires `claim_type: tested`.
- A tested claim cites the command, counterexample, or intervention that
  isolates the cause.
- Inspected or assumed claims can be stored, but they rank lower and should be
  visibly weaker in retrieval output.
- Contradicted records remain discoverable as historical evidence but should
  not be used as active guidance.

For duplicate handling, the curator should prefer one active record with
incoming edges over a pile of similar files. The active record can cite
supporting episodes and superseded records through `memory_edge`, while the
canonical markdown stays readable.

## Commands and Agent Contracts

The new memory surface should be small.

`bn-memory-index`:

- Rebuilds or incrementally refreshes `.banyan/memory/index.sqlite`.
- Parses frontmatter and markdown bodies from canonical memory files.
- Computes embeddings for selected chunks.
- Validates required metadata.
- Reports stale references and parse errors.

`bn-memory-search`:

- Accepts a query, task context, path globs, and optional filters.
- Runs hybrid retrieval.
- Returns cited memory cards suitable for a human or a delegation envelope.
- Can output markdown, JSON, or a compact envelope block.

`bn-memory-curate`:

- Runs promotion, merge, stale-marking, reuse updates, and index refresh.
- Uses the existing lesson-harvester and knowledge-curator semantics as the
  authority for promotion.
- Produces ordinary run artifacts when invoked as part of a Banyan run.

Existing agents should treat these commands as the memory API. The
`bn-learnings-researcher` role becomes a query planner and result judge over
`bn-memory-search`, not an agent that manually invents shell searches for every
task. Grep stays available for transparent fallback and exact ad hoc inspection.

## How A Run Uses Memory

At the beginning of a run, the trunk or lead opens a run ledger and asks
`bn-memory-search` for high-confidence memories matching the task. The query
uses the user's request, touched paths, task type, and known standards files.

The returned memories enter the run ledger as cited context. They can then be
pushed into child envelopes by relevance:

- A procedure matching the task becomes part of the child's operating contract.
- A verified solution matching the file boundary becomes a caution or expected
  pattern.
- A relevant episode becomes low-weight context unless it has been promoted.
- A stale or contradicted memory appears only when it explains a current
  conflict.

During the run, agents can add fact cards and staged lessons. Retrieval inside
the same run should include the current ledger and facts before older durable
memory, because immediate context is often more relevant.

At the end of the run, the harvester stages candidate lessons and the curator
decides what becomes durable semantic or procedural memory. The index refreshes
after curation.

## Why Not Use Mem0 As The Default?

Mem0 and OpenMemory are strong fits for application-level user memory. They
offer a ready-made memory layer, managed extraction, and MCP-friendly access.
They are attractive when an assistant needs portable personal preferences or
cross-application recall.

Banyan's memory has different requirements. It is repository-specific,
evidence-heavy, and needs durable citations to files, commands, and tested
interventions. The source of truth should be reviewable as files. A Mem0-backed
system could be an adapter, but it should not be the canonical store.

Good use:

- Personal or workspace preference memory outside a repo.
- MCP bridge for cross-tool recall.
- A quick external memory backend for experiments.

Not default:

- Canonical Banyan knowledge.
- Causal lesson promotion.
- Protected run ledger or solution store replacement.

## Why Not Use Zep Or Graphiti As The Default?

Zep and Graphiti are compelling for temporal knowledge graphs. Graphiti's model
of episodes, entities, relationships, and time-aware retrieval maps well to
agent memory. It is especially useful when relationships evolve and the system
must answer questions like "what was true when this decision was made?" or
"which assumption superseded this one?"

Banyan should borrow the temporal-graph idea without requiring a graph service
by default. A small `memory_edge` table in SQLite captures the first-order
needs: supports, contradicts, supersedes, specializes, and references. If
Banyan later needs deeper temporal reasoning, Graphiti is the most natural
adapter.

Good use:

- Cross-run temporal entity tracking.
- Rich relationship queries across decisions, files, agents, and lessons.
- Time-aware contradiction and supersession analysis.

Not default:

- Basic repo-local retrieval.
- First implementation of hybrid memory.
- Canonical source of truth.

## Why Not Use Letta Or MemGPT As The Default?

Letta and MemGPT are built around agent runtime memory: archival memory,
working context, memory management, and long-lived assistant state. They are
good references for thinking about what should live in working memory versus
external memory.

Banyan already has a runtime model: trunk, leads, delegation envelopes, run
ledgers, and harvested lessons. It needs better retrieval and curation over
repo artifacts, not a replacement runtime. Letta-like virtual context is
conceptually useful, but adopting Letta as the core would make Banyan's memory
less file-native and less aligned with the plugin's artifact-over-prose
doctrine.

Good use:

- A long-lived autonomous Banyan operator outside the current CLI model.
- Research into virtual context and archival memory policies.
- Experiments with explicit memory editing actions.

Not default:

- Per-repo knowledgebase.
- Run ledger replacement.
- Agent orchestration replacement.

## Why Not Use Qdrant, Weaviate, Or Pgvector As The Default?

Qdrant, Weaviate, and Postgres with pgvector are strong vector search systems.
They make sense when the memory corpus is large, shared across many users, or
served over a network. They also provide production features that SQLite does
not aim to provide: scaling, filtering at high volume, replication, and service
APIs.

Banyan's default should work in any host repo with minimal setup. A local
SQLite index is enough for thousands or tens of thousands of memory records,
and it keeps installation simple. External vector databases should be adapters
for teams that outgrow the local index.

Good use:

- Shared organization-wide Banyan memory.
- Large corpus retrieval across many repos.
- Hosted service deployments.
- Multi-user analytics over memory reuse and quality.

Not default:

- Single-repo local plugin installs.
- Disposable generated index.
- Human-reviewable canonical store.

## Why Not Use Neo4j, Kuzu, Or FalkorDB As The Default?

Graph databases are useful when relationship traversal is the central workload.
They can answer questions like "which recurring failures involve this subsystem
and this class of workaround?" better than a flat vector store. Kuzu is
especially interesting because it is embedded and local-first.

The first Banyan memory system does not need full graph traversal. Most queries
are still retrieval queries: "what should I know before editing this?", "has
this failure happened before?", "which procedure applies?" A relational edge
table is enough until relationship traversal becomes the bottleneck.

Good use:

- Deep dependency and supersession maps.
- Complex multi-hop queries across runs, files, findings, and decisions.
- Visualization of knowledge evolution.

Not default:

- Basic hybrid retrieval.
- Simple stale-reference tracking.
- First durable memory implementation.

## Retrieval Techniques Worth Using

### Hybrid Search

Hybrid search is the default. Lexical search catches exact strings that
embeddings often blur: error messages, file names, commands, flags, class names,
and schema keys. Embedding search catches semantic matches where vocabulary
differs. Either one alone is weaker than both.

SQLite FTS5 plus `sqlite-vec` gives Banyan the local version of the same pattern
used by larger systems such as Qdrant, Weaviate, Elastic/OpenSearch, Vespa, and
LanceDB.

### Reranking

A reranker can improve result ordering after hybrid retrieval. The first
version should use deterministic metadata-aware scoring. A model-based reranker
is optional and should be used only when the candidate set is small and the
task is worth the tokens.

The reranker should not erase provenance. If it elevates a result, the output
still needs to show why: semantic similarity, exact path match, verified claim,
recent reuse, or task-type match.

### Query Rewriting

Query rewriting helps translate a user's request into search forms:

- natural-language summary
- exact symbols and paths
- likely problem type
- related Banyan terms
- negative filters

This can live inside `bn-memory-search` or the `bn-learnings-researcher`.
Rewriting should produce transparent query variants, not hidden prompts whose
behavior is hard to inspect.

### HyDE-Style Retrieval

Hypothetical document embeddings can help when the user's query is vague. The
searcher writes a short hypothetical solution or memory card, embeds it, and
uses that to retrieve similar real memories. This is optional because it adds
model cost and can drift from the actual task. It is useful for broad planning
or unfamiliar failure classes.

### RAPTOR-Style Summaries

Tree summaries can help large memory corpora by creating higher-level summary
nodes over clusters of records. For Banyan, this becomes useful when
`.banyan/runs/` and `.banyan/solutions/` grow large enough that direct retrieval is
noisy. It is not needed for the initial local index.

### GraphRAG

GraphRAG is useful when answer quality depends on relationships among entities
rather than individual documents. Banyan can approximate the first useful slice
with typed edges in SQLite. Full GraphRAG is an optional later adapter for
organization-wide memory or richly connected decision history.

### Contextual Retrieval

Chunk embeddings improve when each chunk carries a short generated context
header: repository, subsystem, memory type, problem type, and why the chunk is
important. Banyan can build this cheaply from frontmatter and surrounding
markdown. This should be included because it improves retrieval without adding
a new service.

## Specific Libraries And Databases

### Default Stack

SQLite FTS5:

- Role: lexical search and structured metadata.
- Why it fits: built into SQLite distributions, local, inspectable,
  zero-service, good enough for repo-scale corpora.
- Source: <https://sqlite.org/fts5.html>

`sqlite-vec`:

- Role: vector similarity inside SQLite.
- Why it fits: local embeddings without a vector database daemon.
- Source: <https://alexgarcia.xyz/sqlite-vec/>

Python `sqlite3`:

- Role: database access.
- Why it fits: stdlib, simple, no runtime service.

Pydantic:

- Role: memory record validation and typed parser outputs.
- Why it fits: Banyan already values structured schemas; memory records should
  fail clearly when metadata is malformed.

### Strong Local Alternatives

LanceDB:

- Role: local vector database with hybrid search.
- Why it is interesting: richer vector store ergonomics than raw SQLite and
  good local development experience.
- Tradeoff: another dependency and another storage format.
- Source: <https://docs.lancedb.com/search/hybrid-search>

Chroma:

- Role: simple local vector store.
- Why it is interesting: fast experiments and broad ecosystem usage.
- Tradeoff: less compelling when SQLite is already needed for structured
  metadata and FTS.

Kuzu:

- Role: embedded graph database.
- Why it is interesting: local graph queries without a server.
- Tradeoff: graph traversal is not the first bottleneck.

DuckDB VSS:

- Role: analytical local vector search.
- Why it is interesting: strong analytical engine.
- Tradeoff: the VSS extension is not as natural a fit for an operational
  memory index as SQLite FTS plus vector search.
- Source: <https://duckdb.org/docs/current/core_extensions/vss.html>

### Shared Or Hosted Alternatives

Postgres with pgvector:

- Role: shared relational memory plus vector search.
- Why it is interesting: durable multi-user database, SQL, production
  operations.
- Tradeoff: server setup and administration.
- Source: <https://github.com/pgvector/pgvector>

Qdrant:

- Role: high-quality vector search with hybrid retrieval and filtering.
- Why it is interesting: production vector retrieval.
- Tradeoff: service dependency.
- Source: <https://qdrant.tech/documentation/search/hybrid-queries/>

Weaviate:

- Role: vector database with hybrid search and schema support.
- Why it is interesting: mature retrieval application platform.
- Tradeoff: more platform than Banyan needs locally.
- Source: <https://docs.weaviate.io/weaviate/search/hybrid>

Elastic/OpenSearch:

- Role: search-heavy lexical and vector retrieval.
- Why it is interesting: strong BM25, filters, operational search tooling.
- Tradeoff: heavy default footprint.

Vespa:

- Role: large-scale hybrid ranking and retrieval applications.
- Why it is interesting: powerful ranking and serving.
- Tradeoff: far beyond local plugin needs.
- Source: <https://docs.vespa.ai/en/learn/tutorials/hybrid-search.html>

Neo4j:

- Role: graph memory and relationship traversal.
- Why it is interesting: best-known graph database ecosystem.
- Tradeoff: service dependency and higher modeling overhead.

### Agent Memory Frameworks

Mem0 / OpenMemory:

- Best for user and app memory.
- Useful as an optional MCP-facing adapter.
- Not the canonical Banyan store.
- Source: <https://github.com/mem0ai/mem0> and
  <https://mem0.ai/openmemory>

Zep / Graphiti:

- Best for temporal knowledge graphs.
- Useful model for episodes, temporal edges, and evolving facts.
- Best optional graph adapter for Banyan if relationship queries become central.
- Source: <https://github.com/getzep/graphiti>

Letta / MemGPT:

- Best for long-lived agent runtime memory and virtual context.
- Useful reference for working versus archival memory.
- Not a replacement for Banyan's file-based run ledger.
- Source: <https://arxiv.org/abs/2310.08560>

LangGraph / LangMem:

- Best when the host application is already built on LangGraph.
- Useful conceptual reference for semantic, episodic, and procedural memory.
- Not a natural default for a Claude Code plugin.
- Source: <https://langchain-ai.github.io/langmem/concepts/conceptual_guide/>

LlamaIndex Memory:

- Best for applications already using LlamaIndex agents and indexes.
- Useful reference for memory blocks and retrieval integration.
- Not needed for the local-first default.
- Source: <https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/memory/>

Cognee:

- Best for graph-oriented memory experiments.
- Useful if Banyan wants a higher-level knowledge graph pipeline.
- Not default because it adds a framework layer over the core problem.

Supermemory:

- Best for cross-application memory APIs.
- Useful as an external memory service adapter.
- Not canonical for repo-local evidence memory.

CrewAI and AutoGen memory:

- Best inside their own multi-agent frameworks.
- Useful as design references.
- Not a fit for Banyan's existing runtime model.

## Data Model Details

The index should parse markdown frontmatter and body sections into typed
records. The first implementation does not need sophisticated chunking. A good
default is:

- one record per solution file
- one record per procedure file
- one record per run summary or finding
- one record per fact card
- optional body chunks for long files, each linked to the parent record

Each record should retain a canonical file citation. The index may cache
summaries, but the source file remains authoritative.

Important fields:

- `memory_type`: controls ranking and presentation.
- `claim_type`: controls trust.
- `verification_status`: controls eligibility for durable guidance.
- `source_path`: supports citation and stale detection.
- `source_anchor`: points to a heading or line anchor where possible.
- `run_id`: connects durable lessons back to episodes.
- `git_sha`: records the repository state associated with the memory.
- `problem_type`: helps route memories to review, planning, delivery, debug, or
  research tasks.
- `tags`: supports human-authored retrieval hints.
- `reuse_count`: lets useful memories rise over time.
- `stale_status`: prevents old but semantically similar records from dominating
  current guidance.

For embeddings, the index should embed a compact retrieval text:

```text
title
memory_type
problem_type
tags
summary
selected evidence text
```

Embedding the entire markdown body is wasteful and can dilute the signal.
Longer files can be chunked by heading once the corpus grows.

## Staleness And Contradiction

Memory needs decay and contradiction handling. Without them, a knowledge store
becomes an attractive nuisance: the older it gets, the more confidently it can
retrieve wrong guidance.

Staleness checks can be mechanical:

- source file no longer exists
- referenced code path no longer exists
- referenced command no longer exists
- cited test file no longer exists
- frontmatter schema is invalid
- newer record supersedes the older one

Contradiction checks are partly semantic:

- two records make incompatible claims about the same subsystem
- a newer tested record conflicts with an older inspected record
- a procedure's command sequence conflicts with current scripts

The initial system can mark obvious stale references mechanically and leave
semantic contradictions for curator review. A later model-assisted curator can
propose contradiction edges, but it should not silently delete or rewrite
canonical memory.

## Evaluation

The memory system should be judged by retrieval usefulness, not by whether it
stores more data.

Useful eval questions:

- Given a seeded recurring bug, does retrieval surface the prior verified
  solution before work starts?
- Given a plugin prompt edit, does retrieval surface the correct protected
  artifact and component-count rules?
- Given a stale lesson that cites a removed file, does retrieval penalize it or
  mark it stale?
- Given two similar lessons, does the verified one outrank the inspected one?
- Given a procedure-triggering task, does the procedure appear in the child
  envelope?
- Given an unrelated task, does memory stay quiet?

The right metric is not raw recall. The right metric is high-signal recall at a
small context budget. A memory system that returns ten vaguely related cards to
every agent will make Banyan worse.

Relevant external benchmarks and ideas:

- LoCoMo and LongMemEval for long-context and long-term memory behavior.
- MemoryArena-style tests for agent memory reliability.
- Attributed question answering for citation faithfulness.
- RAG evaluation patterns for recall, precision, attribution, and answer
  grounding.

Local Banyan evals should be fixture-based. Seed a prior solution, run a task
that needs it, and check whether the memory result is retrieved, cited, and
used correctly.

## The Cut Line Between Proposal And Optional Follow-Up

The proposal includes:

- markdown as canonical source of truth
- `.banyan/runs/` episodic memory
- `.banyan/solutions/` semantic memory
- `docs/procedures/` procedural memory
- generated SQLite memory index
- FTS5 lexical search
- `sqlite-vec` vector search
- typed memory records
- provenance-aware scoring
- staleness tracking
- curator-driven promotion, merge, and stale marking
- `bn-memory-index`
- `bn-memory-search`
- `bn-memory-curate`
- existing agents retrieving through the memory API

The proposal does not include:

- replacing markdown with database rows
- making embeddings authoritative
- requiring a daemon or hosted service
- making Mem0, Zep, Graphiti, Letta, Qdrant, Weaviate, Neo4j, or pgvector part
  of the default local install
- full GraphRAG
- automatic deletion of old memories
- model-only promotion of causal lessons
- organization-wide shared memory
- cross-repo personal preference memory

Optional follow-up includes:

- Graphiti adapter for temporal graph memory
- Qdrant, Weaviate, or pgvector backend for shared team deployments
- Kuzu or Neo4j graph layer for relationship-heavy querying
- model-based reranking for high-effort tasks
- RAPTOR-style summary nodes for very large corpora
- HyDE-style query expansion for vague research tasks
- memory quality dashboard
- cross-repo memory federation
- OpenMemory or Supermemory bridge for user preference memory

## The Smallest Coherent Build

The smallest coherent build is still the full architecture in miniature:

- Create the `docs/procedures/` convention.
- Implement the SQLite schema.
- Index `.banyan/solutions/`, `.banyan/runs/`, and `docs/procedures/`.
- Add FTS5 retrieval.
- Add `sqlite-vec` retrieval.
- Return cited memory cards with typed metadata.
- Point the learnings researcher at `bn-memory-search`.
- Let the curator update the index after promotion.

That is enough to change Banyan's memory behavior materially. It makes memory
semantic, typed, ranked, and provenance-aware without giving up the file-based
knowledge store that makes Banyan auditable.

## The Hard Parts

The hard part is not vector search. The hard part is memory hygiene.

Banyan needs to prevent these failure modes:

- **Semantic spam:** too many weakly related memories enter every context.
- **Causal poisoning:** a plausible but untested explanation becomes durable.
- **Stale confidence:** an old solution keeps ranking after the code changed.
- **Procedure drift:** a playbook retrieves even though its commands are wrong.
- **Embedding opacity:** a result appears with no human-readable reason.
- **Duplicate dilution:** five near-identical memories compete instead of one
  strong record accumulating evidence.
- **Context tax:** retrieval costs more context than it saves.

The scoring and curator rules exist to handle these risks. The memory system
should bias toward returning fewer, stronger, better-cited results.

## Bottom Line

Banyan should become a typed, provenance-aware, hybrid-retrieval memory system
whose canonical memory remains markdown.

The default storage stack is deliberately conservative: markdown plus SQLite
FTS5 plus `sqlite-vec`. The sophistication comes from typing, scoring,
curation, staleness handling, and agent contracts, not from outsourcing the
source of truth to a memory SaaS or graph database.

The practical result is a memory system that can answer:

- "What verified lessons apply before I touch these files?"
- "Has Banyan seen this failure before?"
- "Which procedure should this agent follow?"
- "Which old memory is contradicted or stale?"
- "Why should this retrieved lesson be trusted?"

That is the memory upgrade Banyan needs: not a bigger pile of remembered text,
but a retrieval and curation engine that knows what each memory is, where it
came from, how strong it is, and when it should stop being trusted.
