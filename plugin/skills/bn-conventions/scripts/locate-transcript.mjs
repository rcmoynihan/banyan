#!/usr/bin/env node

// locate-transcript.mjs — resolve and locate-and-complete-check a per-agent
// transcript at the undocumented Claude Code path. This module is deliberately
// LOCATE-AND-COMPLETE ONLY (Design invariant DI2 of the recursive-consult-loop
// plan): it never parses internal transcript fields as load-bearing. The
// transcript is opaque text; the only questions answered are "does a non-empty
// file exist at the resolved path?" and "does it look complete (terminated, not
// actively growing)?". Any dependency on an internal schema field would be a bug.
//
// Per-agent transcripts live at the undocumented path
//   <sessionRoot>/subagents/agent-<agentId>.jsonl
// where sessionRoot is either pushed in by the envelope (the R28 push-down) or
// discovered on the filesystem (the R28 fallback) under
//   ~/.claude/projects/<projectSlug>/<sessionId>/
//
// Zero dependencies — node:* only.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const SUBAGENTS_DIR = 'subagents';

// A line is treated as a record terminator iff it parses as a complete JSON
// object. We do NOT inspect any field inside it — parseability alone is the
// cheap completeness heuristic (a partially-flushed last line of a growing
// JSONL file will not parse). This is intentionally schema-agnostic (DI2).
//
// Known accepted limit: a transcript killed exactly at a JSONL record boundary
// leaves a fully-parseable last line and the growth window (below) is the only
// guard against treating it as complete. This residual false-complete surface is
// inherent to the schema-agnostic DI2 heuristic; the mode-lock fallback (R20)
// is what keeps a wrong "complete" from breaking the run rather than degrading.
function isCompleteJsonRecord(line) {
  const trimmed = line.trim();
  if (trimmed === '') {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

// Resolve the candidate transcript path for an agent id.
//
// Precedence (R28): an explicit sessionPath (envelope push-down) wins; otherwise
// derive a session root from the environment / a discovery root and find the
// session directory on disk.
//
// Returns { path, sessionRoot, source } or { path: null, reason } when no
// session root can be derived.
export function resolveTranscriptPath({ sessionPath, agentId, env = process.env, homeDir } = {}) {
  if (!agentId || typeof agentId !== 'string') {
    return { path: null, reason: 'no-agent-id' };
  }
  // The agent id becomes a filename segment; reject path separators / traversal
  // so a malformed id can never resolve to a path outside the subagents dir.
  if (/[/\\]/.test(agentId) || agentId === '..' || agentId === '.') {
    return { path: null, reason: 'invalid-agent-id' };
  }

  const fileName = `agent-${agentId}.jsonl`;

  // 1. Explicit session path pushed in by the envelope (R28 push-down).
  if (sessionPath) {
    const sessionRoot = path.resolve(sessionPath);
    return {
      path: path.join(sessionRoot, SUBAGENTS_DIR, fileName),
      sessionRoot,
      source: 'session-path',
    };
  }

  // 2. Filesystem discovery fallback (R28 fallback). Look for an explicit env
  //    var first, then walk ~/.claude/projects for the session directory.
  const discovery = discoverSessionRoot({ agentId, fileName, env, homeDir });
  if (discovery.sessionRoot) {
    return {
      path: path.join(discovery.sessionRoot, SUBAGENTS_DIR, fileName),
      sessionRoot: discovery.sessionRoot,
      source: discovery.source,
    };
  }

  return { path: null, reason: discovery.reason ?? 'no-session-root' };
}

function discoverSessionRoot({ agentId, fileName, env, homeDir }) {
  // An explicit session-root env var (push-down delivered out of band).
  const envRoot = env.CLAUDE_SESSION_PATH || env.BANYAN_SESSION_PATH;
  if (envRoot) {
    return { sessionRoot: path.resolve(envRoot), source: 'env-session-path' };
  }

  // Walk the discovery root: ~/.claude/projects/<projectSlug>/<sessionId>/
  // and return the first session dir that actually holds this agent's file.
  const home = homeDir ?? env.HOME ?? env.USERPROFILE ?? os.homedir();
  const discoveryRoot = env.CLAUDE_PROJECTS_DIR
    ? path.resolve(env.CLAUDE_PROJECTS_DIR)
    : path.join(home, '.claude', 'projects');

  if (!safeIsDir(discoveryRoot)) {
    return { sessionRoot: null, reason: 'no-discovery-root' };
  }

  const match = findSessionWithFile(discoveryRoot, fileName);
  if (match) {
    return { sessionRoot: match, source: 'fs-discovery' };
  }
  return { sessionRoot: null, reason: 'agent-file-not-found-in-discovery-root' };
}

// Search <discoveryRoot>/<projectSlug>/<sessionId>/subagents/<fileName>.
// Two-level scan only (project, then session) — we never recurse arbitrarily.
function findSessionWithFile(discoveryRoot, fileName) {
  for (const projectSlug of safeReadDirNames(discoveryRoot)) {
    const projectDir = path.join(discoveryRoot, projectSlug);
    if (!safeIsDir(projectDir)) {
      continue;
    }
    for (const sessionId of safeReadDirNames(projectDir)) {
      const sessionRoot = path.join(projectDir, sessionId);
      if (!safeIsDir(sessionRoot)) {
        continue;
      }
      if (safeIsFile(path.join(sessionRoot, SUBAGENTS_DIR, fileName))) {
        return sessionRoot;
      }
    }
  }
  return null;
}

function safeReadDirNames(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function safeIsDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function safeIsFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Pure growth comparison: two stat snapshots taken settleMs apart. Different
// size or mtime means the file is actively being written. Extracted as a pure
// function so the growth branch is deterministically unit-testable without
// racing the wall clock.
export function isGrowing(before, after) {
  if (!before || !after) {
    return false;
  }
  return after.size !== before.size || after.mtimeMs !== before.mtimeMs;
}

// Completeness check (locate-and-complete only, DI2):
//   - the file must exist and be non-empty;
//   - its last non-empty line must parse as a complete JSON record (terminator);
//   - the file must not be actively growing (a second stat after a short settle
//     shows a different size or mtime).
// We never read an internal field as load-bearing.
//
// settleMs > 0 enables the growth check (two stats settleMs apart). `onSettle`
// is a test-only synchronous hook invoked between the two stats so the growth
// branch is deterministically exercisable without racing the wall clock; live
// callers never pass it.
export function checkComplete(filePath, { settleMs = 0, onSettle } = {}) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { located: false, complete: false, reason: 'file-not-found' };
  }
  if (!stat.isFile()) {
    return { located: false, complete: false, reason: 'not-a-file' };
  }
  if (stat.size === 0) {
    return { located: true, complete: false, reason: 'empty-file' };
  }

  // Growth check first: if the file changes between two stats it is actively
  // being written and is not yet a complete transcript. settleMs defaults to 0
  // (single observation, no growth check) so the pure check stays fast and
  // deterministic; a live probe passes a settle window.
  if (settleMs > 0 || typeof onSettle === 'function') {
    const before = { size: stat.size, mtimeMs: stat.mtimeMs };
    if (typeof onSettle === 'function') {
      onSettle(filePath);
    } else {
      const deadline = Date.now() + settleMs;
      while (Date.now() < deadline) {
        // Busy-wait without timers to keep this synchronous and dependency-free.
      }
    }
    let after;
    try {
      after = fs.statSync(filePath);
    } catch {
      return { located: true, complete: false, reason: 'disappeared-during-settle' };
    }
    if (isGrowing(before, after)) {
      return { located: true, complete: false, reason: 'actively-growing' };
    }
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { located: true, complete: false, reason: 'unreadable' };
  }

  const lines = content.split('\n');
  let lastNonEmpty = '';
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() !== '') {
      lastNonEmpty = lines[i];
      break;
    }
  }
  if (!isCompleteJsonRecord(lastNonEmpty)) {
    return { located: true, complete: false, reason: 'last-line-not-terminated' };
  }

  return { located: true, complete: true, reason: 'located-and-complete' };
}

// Top-level locator: resolve the path, then run the locate-and-complete check.
// Returns { located, path, complete, reason } per the U1 spec contract.
export function locateTranscript({ sessionPath, agentId, env, homeDir, settleMs } = {}) {
  const resolved = resolveTranscriptPath({ sessionPath, agentId, env, homeDir });
  if (!resolved.path) {
    return { located: false, path: null, complete: false, reason: resolved.reason };
  }
  const completeness = checkComplete(resolved.path, { settleMs });
  return {
    located: completeness.located,
    path: resolved.path,
    complete: completeness.complete,
    reason: completeness.reason,
  };
}

// The CLI defaults to a non-zero settle window so the LIVE probe actually
// exercises the actively-growing guard (a probe agent reads its own still-open
// transcript). The pure module default stays 0 so unit tests are fast and
// deterministic; only the CLI wrapper opts into the wall-clock settle.
const DEFAULT_CLI_SETTLE_MS = 250;

function parseCliArgs(argv) {
  const opts = { sessionPath: null, agentId: null, settleMs: DEFAULT_CLI_SETTLE_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--session-path') {
      opts.sessionPath = argv[(i += 1)];
    } else if (arg === '--agent-id') {
      opts.agentId = argv[(i += 1)];
    } else if (arg === '--settle-ms') {
      const parsed = Number.parseInt(argv[(i += 1)], 10);
      opts.settleMs = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_CLI_SETTLE_MS;
    } else {
      process.stderr.write(`locate-transcript: unknown flag: ${arg}\n`);
      process.exit(2);
    }
  }
  return opts;
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  const result = locateTranscript(opts);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  // Exit 0 always: a not-locatable result is a legitimate signal (the run locks
  // to checkpoint mode per R19/R20), not a CLI error.
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
