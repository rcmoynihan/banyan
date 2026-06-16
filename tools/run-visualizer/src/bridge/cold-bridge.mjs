// U3 — run-id → session COLD bridge (P4 / R3 / DI3). Scores candidate sessions by
// transcript LINE-TIMESTAMP intersection with the run's activity.log window (NEVER dir mtime,
// F2), plus agentType overlap and project-slug match. Resolves only above a confidence margin;
// ambiguity surfaces a candidate list or refuses to durable-only — never a silent wrong tree.

import fs from 'node:fs';
import path from 'node:path';

import { parseLine } from '../parse/jsonl-line.mjs';
import { resolveSessionPaths, listSessions, projectSlugFromCwd } from './session-paths.mjs';

const WINDOW_TRAILING_MARGIN_MS = 60_000; // F2/R-B: harvester starts ~16s after the logged window.
const DEFAULT_MARGIN = 2; // best − second-best score must exceed this to resolve.

/** Parse an activity.log into its [start, end] ISO window. Format `<ISO>\t<actor>\t<message>`. */
export function readActivityWindow(activityLogPath) {
  let first;
  let last;
  let lines = [];
  try {
    lines = fs.readFileSync(activityLogPath, 'utf8').split('\n');
  } catch {
    return null;
  }
  for (const line of lines) {
    if (!line.trim()) continue;
    const iso = line.split('\t')[0];
    const t = Date.parse(iso);
    if (Number.isNaN(t)) continue;
    if (first === undefined) first = t;
    last = t;
  }
  if (first === undefined) return null;
  return { startMs: first, endMs: last };
}

/** Count, for one session, transcripts with any in-window line + transcripts STARTING in-window. */
function scoreSession({ paths, windowStartMs, windowEndMs }) {
  const padEnd = windowEndMs + WINDOW_TRAILING_MARGIN_MS;
  let anyInWindow = 0;
  let startInWindow = 0;
  const agentTypes = [];

  const files = [...paths.subagentTranscripts];
  // The sibling root transcript participates too (its lines bound the session presence).
  if (paths.rootTranscript) files.push(paths.rootTranscript);

  for (const f of files) {
    let firstTs;
    let hasIn = false;
    let raw;
    try { raw = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      const r = parseLine(line);
      if (!r.ok) continue;
      const t = Date.parse(r.record?.timestamp);
      if (Number.isNaN(t)) continue;
      if (firstTs === undefined) firstTs = t;
      if (t >= windowStartMs && t <= padEnd) hasIn = true;
    }
    if (hasIn) anyInWindow++;
    if (firstTs !== undefined && firstTs >= windowStartMs && firstTs <= padEnd) startInWindow++;
  }

  // agentType multiset from in-window metas (best-effort).
  for (const m of paths.metas) {
    try {
      const meta = JSON.parse(fs.readFileSync(m, 'utf8'));
      if (typeof meta.agentType === 'string') agentTypes.push(meta.agentType);
    } catch { /* ignore */ }
  }

  return { anyInWindow, startInWindow, agentTypes };
}

/**
 * Resolve a run dir to its session.
 * @param {{runDir: string, cwd: string, env?: object, homeDir?: string, margin?: number}} args
 * @returns one of:
 *   { resolved: true, sessionId, score, runnerUp }
 *   { resolved: false, reason: 'ambiguous', candidates: [...] }
 *   { resolved: false, reason: 'no-window' | 'no-candidates' | 'no-in-window-evidence' }
 */
export function resolveSession({ runDir, cwd, env, homeDir, margin = DEFAULT_MARGIN }) {
  const window = readActivityWindow(path.join(runDir, 'activity.log'));
  if (!window) return { resolved: false, reason: 'no-window' };

  const projectSlug = projectSlugFromCwd(cwd);
  const sessionIds = listSessions({ projectSlug, env, homeDir });
  if (sessionIds.length === 0) return { resolved: false, reason: 'no-candidates' };

  const scored = [];
  for (const sessionId of sessionIds) {
    const paths = resolveSessionPaths({ projectSlug, sessionId, env, homeDir });
    if (!paths.subagentsDir && !paths.rootTranscript) continue;
    const s = scoreSession({ paths, windowStartMs: window.startMs, windowEndMs: window.endMs });
    // Composite score: in-window starts dominate; any-in-window breaks ties. Dir mtime is NEVER read.
    const score = s.startInWindow * 10 + s.anyInWindow;
    scored.push({ sessionId, score, startInWindow: s.startInWindow, anyInWindow: s.anyInWindow });
  }
  if (scored.length === 0) return { resolved: false, reason: 'no-candidates' };

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];

  if (best.startInWindow === 0 && best.anyInWindow === 0) {
    return { resolved: false, reason: 'no-in-window-evidence' };
  }
  if (second && best.score - second.score < margin) {
    return {
      resolved: false,
      reason: 'ambiguous',
      candidates: scored.filter((s) => best.score - s.score < margin).map((s) => s.sessionId),
    };
  }
  return { resolved: true, sessionId: best.sessionId, score: best.score, runnerUp: second?.sessionId ?? null };
}

export { DEFAULT_MARGIN, WINDOW_TRAILING_MARGIN_MS };
