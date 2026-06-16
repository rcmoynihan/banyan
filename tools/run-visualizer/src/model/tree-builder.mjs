// U4 — pure toolUseId tree-join (DI1: no fs/ink/react/chokidar). Joins each child's
// .meta.json.toolUseId to the parent transcript that EMITTED that spawn tool_use .id.
// Spawn ids are indexed across ALL subagents/*.jsonl AND the sibling root transcript (F1):
// without the root file the 11 trunk-spawned roots dangle; with it, 82 + 11 = 93, 0 unmatched.
// Identity is the transcript instance-id (agent-<id>), never a role string. A child with a
// dangling toolUseId attaches to a synthetic run-root, MARKED, never dropped (R1/P1a).

import { extractSpawnEdges } from '../parse/transcript-fields.mjs';
import { parseLines } from '../parse/jsonl-line.mjs';

export const RUN_ROOT_ID = '__run_root__';

/**
 * @typedef {{ id: string, records: object[] }} TranscriptInput  // id = agent-<id> (or 'root')
 * @typedef {{ id: string, toolUseId?: string, agentType?: string, description?: string }} MetaInput
 */

/**
 * Build the spawn tree.
 * @param {{
 *   transcripts: TranscriptInput[],   // each subagent transcript, by agent instance id
 *   metas: MetaInput[],               // each child's .meta.json (id matches a transcript id)
 *   rootTranscript?: object[]|null,   // the sibling <sessionId>.jsonl root records (F1)
 * }} input
 * @returns {{
 *   nodes: Array<{id, agentType, description, depth, parentId, attachedToRoot, hasMeta}>,
 *   edges: Array<{parentId, childId, via: 'subagent'|'root'|'run-root'}>,
 *   stats: {total, matchedViaSubagent, matchedViaRoot, attachedToRoot}
 * }}
 */
export function buildTree({ transcripts, metas, rootTranscript = null }) {
  // 1. Index every spawn tool_use .id → the transcript instance that emitted it.
  //    Subagent transcripts first (inter-subagent edges), then the sibling root (root edges).
  const idToEmitter = new Map(); // spawnToolUseId → emitter transcript id
  for (const t of transcripts) {
    for (const edge of extractSpawnEdges(t.records)) {
      if (!idToEmitter.has(edge.id)) idToEmitter.set(edge.id, { emitterId: t.id, via: 'subagent' });
    }
  }
  if (Array.isArray(rootTranscript)) {
    for (const edge of extractSpawnEdges(rootTranscript)) {
      if (!idToEmitter.has(edge.id)) idToEmitter.set(edge.id, { emitterId: RUN_ROOT_ID, via: 'root' });
    }
  }

  // 2. Build the parent map per child via its meta.toolUseId.
  const metaById = new Map(metas.map((m) => [m.id, m]));
  const childIds = transcripts.map((t) => t.id);
  const parentOf = new Map(); // childId → { parentId, via }
  let matchedViaSubagent = 0;
  let matchedViaRoot = 0;
  let attachedToRoot = 0;

  for (const childId of childIds) {
    const meta = metaById.get(childId);
    const tuid = meta?.toolUseId;
    const hit = tuid ? idToEmitter.get(tuid) : undefined;
    if (hit) {
      parentOf.set(childId, { parentId: hit.emitterId, via: hit.via });
      if (hit.via === 'subagent') matchedViaSubagent++;
      else matchedViaRoot++;
    } else {
      // Dangling toolUseId (or missing meta) → attach to the synthetic run-root, marked.
      parentOf.set(childId, { parentId: RUN_ROOT_ID, via: 'run-root' });
      attachedToRoot++;
    }
  }

  // 3. Compute depth by walking parent links to the run-root (cycle-guarded).
  const depthCache = new Map([[RUN_ROOT_ID, 0]]);
  function depthOf(id, seen = new Set()) {
    if (depthCache.has(id)) return depthCache.get(id);
    if (seen.has(id)) return 1; // cycle guard — should not happen with instance-id joins
    seen.add(id);
    const p = parentOf.get(id);
    const d = p ? depthOf(p.parentId, seen) + 1 : 1;
    depthCache.set(id, d);
    return d;
  }

  const nodes = [];
  const edges = [];
  for (const childId of childIds) {
    const meta = metaById.get(childId);
    const link = parentOf.get(childId);
    nodes.push({
      id: childId,
      agentType: typeof meta?.agentType === 'string' ? meta.agentType : { unavailable: true },
      description: typeof meta?.description === 'string' ? meta.description : { unavailable: true },
      depth: depthOf(childId),
      parentId: link.parentId,
      attachedToRoot: link.via === 'run-root',
      hasMeta: Boolean(meta),
    });
    edges.push({ parentId: link.parentId, childId, via: link.via });
  }

  return {
    nodes,
    edges,
    stats: {
      total: childIds.length,
      matchedViaSubagent,
      matchedViaRoot,
      attachedToRoot,
    },
  };
}

/** Convenience: build directly from raw transcript TEXT blobs (parses per-line, drops bad lines). */
export function buildTreeFromText({ transcriptTexts, metas, rootTranscriptText = null }) {
  const transcripts = transcriptTexts.map(({ id, text }) => ({ id, records: parseLines(text).records }));
  const rootTranscript = rootTranscriptText != null ? parseLines(rootTranscriptText).records : null;
  return buildTree({ transcripts, metas, rootTranscript });
}
