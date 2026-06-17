#!/usr/bin/env node

// Liveness heartbeat: append one timestamped line to <run-dir>/activity.log so a
// long-running subtree is observable from outside. A child has no upward channel
// mid-work (invariant 3), so without this a healthy-but-slow deep agent looks
// identical to a hung one. This is shared-run-state (a write, not an upward
// return), so it does not violate invariant 3.
//
// Usage: heartbeat.mjs <run-dir> <actor> <message...>
// Bad input exits 2 with usage; an append failure is reported but still exits 0 —
// a heartbeat must never break the work it reports on.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [, , runDir, actor, ...rest] = process.argv;
const message = rest.join(' ').replace(/\s+/g, ' ').trim();

if (!runDir || !actor || !message) {
  process.stderr.write('usage: heartbeat.mjs <run-dir> <actor> <message...>\n');
  process.exit(2);
}

// One short line is an atomic append across processes on POSIX (< PIPE_BUF),
// so parallel agents in separate worktrees can share one canonical log.
const line = `${new Date().toISOString()}\t${actor}\t${message}\n`;

try {
  fs.mkdirSync(runDir, { recursive: true });
  fs.appendFileSync(path.join(runDir, 'activity.log'), line);
} catch (err) {
  process.stderr.write(`heartbeat: append failed: ${err.message}\n`);
}
process.exit(0);
