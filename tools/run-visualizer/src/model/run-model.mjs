// U5 — RunModel core (KD2 / R6 / DI1). The renderer-agnostic core: owns the spawn-tree graph,
// per-node status, expand/collapse set, parsed enrichment, the finished-predicate wiring, and the
// durable-signal fusion. Exposes apply(event) → a NEW immutable JSON-serializable state.
//
// SOLE OWNER of this file is U5 (DI5); U6/U7/U8 consume the event/state API and never edit it.
// PURE: imports only framework-free, fs-free code (no ink/react/chokidar/fs). All side-effecting
// watch/IO lives in adapter modules that emit plain domain events into apply().

import { buildTree } from './tree-builder.mjs';
import { createLivenessFsm } from './liveness-fsm.mjs';
import {
  extractPrompt, extractModel, extractTokens, extractTiming, extractMetadata, UNAVAILABLE, isUnavail,
} from '../parse/transcript-fields.mjs';

/** The initial empty state (a plain JSON-serializable object). */
export function initialState() {
  return {
    mode: 'transcript',        // 'transcript' | 'durable-only'
    nodes: {},                 // id → node view-state
    rootChildren: [],          // ids whose parent is the run-root
    expanded: {},              // id → bool (expand/collapse set)
    selectedId: null,
    durable: null,             // durable roster when mode === 'durable-only'
    stats: { total: 0 },
  };
}

function enrichNode(records) {
  const tokens = extractTokens(records);
  const timing = extractTiming(records);
  const meta = extractMetadata(records);
  return {
    prompt: extractPrompt(records),
    model: extractModel(records),
    tokens: isUnavail(tokens) ? UNAVAILABLE : tokens,
    startTime: timing.startTime,
    endTime: timing.endTime,
    cwd: meta.cwd,
    gitBranch: meta.gitBranch,
    worktreePath: meta.worktreePath,
  };
}

/**
 * apply(state, event) → new state (immutable: returns a fresh object, never mutates `state`).
 *
 * Events:
 *  - { type: 'build-tree', transcripts, metas, rootTranscript } — (re)build topology + enrichment.
 *  - { type: 'durable-only', roster } — no transcript tier resolved; show the degraded roster (R9).
 *  - { type: 'liveness', transitions } — apply FSM transitions [{id, to, endTime, endTimeApprox}].
 *  - { type: 'toggle-expand', id } / { type: 'select', id }.
 */
export function apply(state, event) {
  switch (event?.type) {
    case 'build-tree': {
      const tree = buildTree({
        transcripts: event.transcripts ?? [],
        metas: event.metas ?? [],
        rootTranscript: event.rootTranscript ?? null,
      });
      const recordsById = new Map((event.transcripts ?? []).map((t) => [t.id, t.records]));
      const nodes = {};
      const rootChildren = [];
      for (const n of tree.nodes) {
        const records = recordsById.get(n.id) ?? [];
        nodes[n.id] = {
          id: n.id,
          agentType: n.agentType,
          description: n.description,
          depth: n.depth,
          parentId: n.parentId,
          attachedToRoot: n.attachedToRoot,
          hasMeta: n.hasMeta,
          status: 'active', // liveness events refine this
          endTimeApprox: false,
          ...enrichNode(records),
        };
        if (n.attachedToRoot || n.parentId === '__run_root__') rootChildren.push(n.id);
      }
      return {
        ...state,
        mode: 'transcript',
        nodes,
        rootChildren,
        durable: null,
        stats: tree.stats,
      };
    }

    case 'durable-only': {
      return {
        ...state,
        mode: 'durable-only',
        nodes: {},
        rootChildren: [],
        durable: event.roster ?? null,
        stats: { total: (event.roster?.roster ?? []).reduce((a, r) => a + r.count, 0) },
      };
    }

    case 'liveness': {
      const nodes = { ...state.nodes };
      for (const tr of event.transitions ?? []) {
        const n = nodes[tr.id];
        if (!n) continue;
        nodes[tr.id] = {
          ...n,
          status: tr.to,
          ...(tr.to === 'finished' && tr.endTime ? { endTime: tr.endTime } : {}),
          ...(tr.to === 'finished' && tr.endTimeApprox !== undefined ? { endTimeApprox: tr.endTimeApprox } : {}),
        };
      }
      return { ...state, nodes };
    }

    case 'toggle-expand': {
      return { ...state, expanded: { ...state.expanded, [event.id]: !state.expanded[event.id] } };
    }

    case 'select': {
      return { ...state, selectedId: event.id };
    }

    default:
      return state;
  }
}

/** Children of a node id (for the renderer to walk the tree). */
export function childrenOf(state, parentId) {
  return Object.values(state.nodes)
    .filter((n) => n.parentId === parentId)
    .map((n) => n.id);
}

export { UNAVAILABLE, isUnavail, createLivenessFsm };
