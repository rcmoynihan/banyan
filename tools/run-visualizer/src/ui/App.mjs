// U6 — Ink v7 root. Two-pane shell (tree + detail). Pure render over a model-state prop; input
// handling (navigate / expand-collapse / select) is wired via useInput. The live event feed comes
// from the watcher adapter (U6) and the model subscription (U8 useRunModel); App itself never
// touches fs/chokidar. Never console.log inside the app (DI2).

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { TreePane, flattenVisible } from './TreePane.mjs';

const e = React.createElement;

/**
 * @param {{
 *   state: object,
 *   onEvent?: (event: object) => void,   // dispatches model events (toggle-expand/select/navigate)
 *   DetailComponent?: Function,          // injected by U7 (kept optional so U6 stands alone)
 *   viewport?: number,
 * }} props
 */
export function App({ state, onEvent = () => {}, DetailComponent = null, viewport = 20 }) {
  const rows = flattenVisible(state);

  useInput((input, key) => {
    if (state.mode === 'durable-only') return;
    const ids = rows.map((r) => r.id);
    const curIdx = Math.max(0, ids.indexOf(state.selectedId));
    if (key.downArrow || input === 'j') {
      const next = ids[Math.min(ids.length - 1, curIdx + 1)];
      if (next) onEvent({ type: 'select', id: next });
    } else if (key.upArrow || input === 'k') {
      const prev = ids[Math.max(0, curIdx - 1)];
      if (prev) onEvent({ type: 'select', id: prev });
    } else if (input === ' ' || key.return) {
      if (state.selectedId) onEvent({ type: 'toggle-expand', id: state.selectedId });
    }
  });

  const selectedNode = state.selectedId ? state.nodes[state.selectedId] : null;

  return e(Box, { flexDirection: 'row' },
    e(Box, { flexDirection: 'column', width: '50%', borderStyle: 'round', borderColor: 'cyan' },
      e(Text, { bold: true }, 'Run tree'),
      e(TreePane, { state, viewport }),
    ),
    e(Box, { flexDirection: 'column', width: '50%', borderStyle: 'round', borderColor: 'magenta' },
      e(Text, { bold: true }, 'Detail'),
      DetailComponent && selectedNode
        ? e(DetailComponent, { node: selectedNode })
        : e(Text, { dimColor: true }, selectedNode ? '(detail pane wired in U7)' : '(select an agent)'),
    ),
  );
}
