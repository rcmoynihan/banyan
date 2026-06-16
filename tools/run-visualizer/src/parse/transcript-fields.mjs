// U1 — scan-not-position field extractors. PURE (DI1). Returns an `unavailable` sentinel
// (never 0 / '' ) when a field is absent (R7). Handles array message.content as the COMMON
// case (assistant content is normally a block array), not only the drift case.

export const UNAVAILABLE = Object.freeze({ unavailable: true });

const isUnavail = (v) => v === UNAVAILABLE || (v && typeof v === 'object' && v.unavailable === true);

function lineType(rec) {
  return rec?.type ?? rec?.message?.role ?? undefined;
}

/** Coerce message.content (string OR block array) to a plain text string, or UNAVAILABLE. */
export function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const block of content) {
      if (typeof block === 'string') parts.push(block);
      else if (block && typeof block === 'object') {
        if (typeof block.text === 'string') parts.push(block.text);
        else if (block.type === 'tool_result' && typeof block.content === 'string') parts.push(block.content);
      }
    }
    return parts.length ? parts.join('\n') : UNAVAILABLE;
  }
  return UNAVAILABLE;
}

/** Prompt = first `user`-line message.content, verbatim (R7/R16). Scans, never position 1. */
export function extractPrompt(records) {
  for (const rec of records) {
    if (lineType(rec) === 'user') {
      const text = contentToText(rec?.message?.content);
      if (!isUnavail(text)) return text;
    }
  }
  return UNAVAILABLE;
}

/** Model = first non-empty `assistant`-line model. Undefined on the opening user line — scan. */
export function extractModel(records) {
  for (const rec of records) {
    if (lineType(rec) === 'assistant') {
      const m = rec?.message?.model;
      if (typeof m === 'string' && m.length) return m;
    }
  }
  return UNAVAILABLE;
}

/**
 * Summed token usage across assistant lines (R7). Returns UNAVAILABLE when NO assistant line
 * carries a recognizable `usage` (never 0 — a renamed/missing field must read `unavailable`).
 */
export function extractTokens(records) {
  let inputTokens = 0;
  let outputTokens = 0;
  let seen = false;
  for (const rec of records) {
    if (lineType(rec) !== 'assistant') continue;
    const usage = rec?.message?.usage;
    if (!usage || typeof usage !== 'object') continue;
    const inT = usage.input_tokens;
    const outT = usage.output_tokens;
    if (typeof inT === 'number' || typeof outT === 'number') {
      seen = true;
      if (typeof inT === 'number') inputTokens += inT;
      if (typeof outT === 'number') outputTokens += outT;
    }
  }
  if (!seen) return UNAVAILABLE;
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

/** First/last successfully-parsed line timestamps (R7). */
export function extractTiming(records) {
  let first;
  let last;
  for (const rec of records) {
    const ts = rec?.timestamp;
    if (typeof ts !== 'string') continue;
    if (first === undefined) first = ts;
    last = ts;
  }
  return {
    startTime: first ?? UNAVAILABLE,
    endTime: last ?? UNAVAILABLE,
  };
}

/** Metadata floor bits derivable from transcript lines (agentType/desc come from .meta.json). */
export function extractMetadata(records) {
  let cwd = UNAVAILABLE;
  let gitBranch = UNAVAILABLE;
  let worktreePath = UNAVAILABLE;
  for (const rec of records) {
    if (isUnavail(cwd) && typeof rec?.cwd === 'string') cwd = rec.cwd;
    if (isUnavail(gitBranch) && typeof rec?.gitBranch === 'string') gitBranch = rec.gitBranch;
    if (isUnavail(worktreePath) && typeof rec?.worktreePath === 'string') worktreePath = rec.worktreePath;
  }
  return { cwd, gitBranch, worktreePath };
}

/**
 * Spawn edges emitted by a transcript: any `Agent` OR `Task` (P6 drift) tool_use carrying
 * an `.id` + `input.subagent_type`. Matched by SHAPE, not the literal name `Agent`.
 * Returns [{id, subagentType, description}], used by U4's tree-join.
 */
export function extractSpawnEdges(records) {
  const edges = [];
  for (const rec of records) {
    if (lineType(rec) !== 'assistant') continue;
    const content = rec?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type !== 'tool_use') continue;
      const isSpawnName = block.name === 'Agent' || block.name === 'Task';
      const subagentType = block.input?.subagent_type;
      // Match on shape: a tool_use with an .id and input.subagent_type is a spawn,
      // tolerating a renamed tool as long as it carries the spawn shape.
      if ((isSpawnName || typeof subagentType === 'string') && typeof block.id === 'string') {
        edges.push({
          id: block.id,
          subagentType: typeof subagentType === 'string' ? subagentType : UNAVAILABLE,
          description: typeof block.input?.description === 'string' ? block.input.description : UNAVAILABLE,
        });
      }
    }
  }
  return edges;
}

export { isUnavail };
