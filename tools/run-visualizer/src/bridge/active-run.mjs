// U3 — R1/R19 active-run discovery: prefer an explicit push-down (BANYAN_SESSION_PATH /
// CLAUDE_SESSION_PATH / explicit run-id) over the heuristic; the heuristic treats a run "active"
// only if activity.log was appended within a staleness window, so a stale/abandoned run is not
// silently locked onto (R11 / P11).

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_STALENESS_MS = 120_000; // ~120s (R11).

// Terminal report filenames that mark a run "finished" (don't lock onto a done run as "active").
const TERMINAL_REPORTS = ['delivery-report.md', 'plan-report.md', 'review-verdict.md', 'diagnosis.md'];

function safeStat(p) { try { return fs.statSync(p); } catch { return null; } }
function safeReadDirNames(dir) { try { return fs.readdirSync(dir); } catch { return []; } }

/** Has this run dir a terminal report at its top level? */
function hasTerminalReport(runDir) {
  for (const name of TERMINAL_REPORTS) {
    if (safeStat(path.join(runDir, name))?.isFile()) return true;
  }
  return false;
}

/** Last-append time of a run's activity.log (mtime of the log file), or null. */
function activityMtimeMs(runDir) {
  const st = safeStat(path.join(runDir, 'activity.log'));
  return st ? st.mtimeMs : null;
}

/**
 * Discover the active run.
 * @param {{
 *   runsDir: string, env?: object, now?: number, stalenessMs?: number,
 *   explicitRunId?: string|null
 * }} args
 * @returns {{ source: 'push-down'|'explicit-run-id'|'heuristic'|'none', runDir: string|null, reason?: string }}
 */
export function discoverActiveRun({ runsDir, env = process.env, now = Date.now(), stalenessMs = DEFAULT_STALENESS_MS, explicitRunId = null }) {
  // 1. Push-down beats everything (an explicit session path provided out of band).
  const pushed = env.CLAUDE_SESSION_PATH || env.BANYAN_SESSION_PATH;
  if (pushed) return { source: 'push-down', runDir: pushed };

  // 2. Explicit run-id (a named run dir).
  if (explicitRunId) {
    const dir = path.join(runsDir, explicitRunId);
    if (safeStat(dir)?.isDirectory()) return { source: 'explicit-run-id', runDir: dir };
    return { source: 'none', runDir: null, reason: 'explicit-run-id-not-found' };
  }

  // 3. Heuristic: newest run dir with NO terminal report AND activity.log appended within window.
  let best = null;
  for (const name of safeReadDirNames(runsDir)) {
    const runDir = path.join(runsDir, name);
    if (!safeStat(runDir)?.isDirectory()) continue;
    if (hasTerminalReport(runDir)) continue; // finished — not "active"
    const mtime = activityMtimeMs(runDir);
    if (mtime === null) continue;
    if (now - mtime > stalenessMs) continue; // stale/abandoned — do NOT lock onto it
    if (!best || mtime > best.mtime) best = { runDir, mtime };
  }
  if (best) return { source: 'heuristic', runDir: best.runDir };
  return { source: 'none', runDir: null, reason: 'no-active-run-within-staleness-window' };
}
