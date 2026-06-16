// U7 — scrollable detail pane. Renders a selected node's VERBATIM prompt (AR1: no redaction in
// v1) plus the R8/P9 metadata FLOOR — every floor field required-present so R10 cannot pass on
// role alone. Read-only over the model (consumes U5 view-state; never edits run-model.mjs, DI5).
// Long prompts scroll via scrollTop/slice(viewport) (R15).

import React from 'react';
import { Box, Text } from 'ink';
import { isUnavail } from '../parse/transcript-fields.mjs';

const e = React.createElement;

function show(v) {
  return isUnavail(v) || v == null ? 'unavailable' : String(v);
}

function tokensLabel(tokens) {
  if (isUnavail(tokens) || tokens == null) return 'unavailable'; // never "0"
  return `${tokens.totalTokens} (in ${tokens.inputTokens} / out ${tokens.outputTokens})`;
}

function duration(node) {
  const a = node.startTime;
  const b = node.endTime;
  if (isUnavail(a) || isUnavail(b) || a == null || b == null) return 'unavailable';
  const ms = Date.parse(b) - Date.parse(a);
  if (Number.isNaN(ms)) return 'unavailable';
  return `${(ms / 1000).toFixed(1)}s${node.endTimeApprox ? ' (approx)' : ''}`;
}

/** The required R8 floor field set, as [label, value] rows — used by the pane AND its test. */
export function floorRows(node) {
  return [
    ['agentType', show(node.agentType)],
    ['model', show(node.model)],
    ['owningUnit', show(node.owningUnit ?? node.cwd)], // owning unit/worktree (best-effort from cwd/branch)
    ['worktree', show(node.worktreePath ?? node.gitBranch)],
    ['start', show(node.startTime)],
    ['end', `${show(node.endTime)}${node.endTimeApprox ? ' (approx)' : ''}`],
    ['duration', duration(node)],
    ['tokens', tokensLabel(node.tokens)],
    ['depth', show(node.depth)],
  ];
}

/**
 * @param {{ node: object, viewport?: number, scrollTop?: number }} props
 */
export function DetailPane({ node, viewport = 12, scrollTop = 0 }) {
  if (!node) return e(Text, { dimColor: true }, '(no selection)');
  const rows = floorRows(node);
  const promptText = isUnavail(node.prompt) || node.prompt == null ? '(no prompt)' : String(node.prompt);
  const promptLines = promptText.split('\n');
  const windowed = promptLines.slice(scrollTop, scrollTop + viewport);

  return e(Box, { flexDirection: 'column' },
    // The required metadata floor (P9) — all fields by name.
    ...rows.map(([k, v]) => e(Text, { key: k }, e(Text, { bold: true }, `${k}: `), v)),
    e(Text, { color: 'cyan' }, '── prompt (verbatim) ──'),
    ...windowed.map((line, i) => e(Text, { key: `p${i}` }, line)),
    promptLines.length > scrollTop + viewport
      ? e(Text, { dimColor: true }, `… ${promptLines.length - (scrollTop + viewport)} more lines`)
      : null,
  );
}
