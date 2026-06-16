// Shared node-identity contract (F10). The watcher (adapters/transcript-watcher.mjs) and the
// launch loader (index.mjs) must agree on how a transcript FILE maps to a model NODE id, or a
// live growth event for the root transcript dispatches against a node id the model never built
// and is silently dropped (run-model's liveness branch skips ids not in state.nodes).
//
// Single source of truth: subagent transcripts are keyed `agent-<id>` (their basename); the
// sibling root transcript <sessionId>.jsonl maps to the synthetic RUN_ROOT_ID the tree builder
// uses for the run root. Pure (no fs/ink/react) — safe to import from either side.

import { RUN_ROOT_ID } from './tree-builder.mjs';

export { RUN_ROOT_ID };

/**
 * Derive the model node id for a transcript file path.
 * - `.../subagents/agent-<id>.jsonl` → `agent-<id>` (matches index.mjs's path.basename loader).
 * - the sibling root `<sessionId>.jsonl` → RUN_ROOT_ID (so root growth hits an existing node).
 * @param {string} filePath
 * @returns {string}
 */
export function idForTranscriptPath(filePath) {
  const m = String(filePath).match(/agent-([^/\\]+)\.jsonl$/);
  if (m) return `agent-${m[1]}`;
  // Any other *.jsonl at this layer is the sibling root transcript → the run-root node.
  if (/\.jsonl$/.test(filePath)) return RUN_ROOT_ID;
  return filePath;
}
