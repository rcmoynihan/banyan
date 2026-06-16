// U6 — hand-rolled windowed tree pane (Ink has no native tree). Renders RunModel view-state as a
// PURE function of props (snapshottable by ink-testing-library). Active agents are visually
// distinct from finished (color + marker). scrollTop/slice(viewport) windows long trees (R15).
// No fs/chokidar here; props come from the model (DI1 for the view layer's data).

import React from 'react';
import { Box, Text } from 'ink';
import { childrenOf } from '../model/run-model.mjs';
import { isUnavail } from '../parse/transcript-fields.mjs';
import { RUN_ROOT_ID } from '../model/tree-builder.mjs';

const e = React.createElement;

/** Flatten the visible tree (respecting expand/collapse) into ordered rows with depth. */
export function flattenVisible(state) {
  const rows = [];
  const walk = (parentId, depth) => {
    for (const id of childrenOf(state, parentId)) {
      const node = state.nodes[id];
      rows.push({ id, depth, node });
      // children shown only if this node is expanded (default collapsed beyond depth 1)
      if (state.expanded[id]) walk(id, depth + 1);
    }
  };
  walk(RUN_ROOT_ID, 0);
  return rows;
}

function label(node) {
  const at = isUnavail(node.agentType) ? 'unavailable' : node.agentType;
  return at;
}

/**
 * @param {{ state: object, viewport?: number, scrollTop?: number }} props
 */
export function TreePane({ state, viewport = 20, scrollTop = 0 }) {
  if (state.mode === 'durable-only') {
    const roster = state.durable?.roster ?? [];
    return e(Box, { flexDirection: 'column' },
      e(Text, { color: 'yellow' }, `DEGRADED durable-only view (${state.durable?.layout ?? 'flat'} layout)`),
      ...roster.map((r) => e(Text, { key: r.role },
        `  ${r.role}${r.count > 1 ? ` ×${r.count}` : ''}`)),
    );
  }

  const rows = flattenVisible(state);
  const windowed = rows.slice(scrollTop, scrollTop + viewport);
  return e(Box, { flexDirection: 'column' },
    ...windowed.map(({ id, depth, node }) => {
      const active = node.status === 'active';
      const selected = state.selectedId === id;
      const marker = active ? '●' : '○'; // active vs finished, visually distinct
      const indent = '  '.repeat(depth);
      return e(Text, {
        key: id,
        color: active ? 'green' : 'gray',
        inverse: selected,
      }, `${indent}${marker} ${label(node)}`);
    }),
  );
}
