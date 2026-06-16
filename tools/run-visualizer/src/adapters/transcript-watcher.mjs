// U6 — chokidar watch adapter (the ONLY side-effecting IO layer for live updates). Watches the
// subagents/ subtree + the run dir + the sibling root <sessionId>.jsonl (F1). Emits plain domain
// 'growth' events (with the new complete lines) into a callback; the model/FSM consume them. Uses
// an app-level debounce (NOT chokidar awaitWriteFinish) and the U1 byte-offset tailer. This module
// is deliberately impure (fs/chokidar) — it stays OUT of the run-model import graph (DI1).

import fs from 'node:fs';
import { createCursor, advance, reconcileSize } from '../parse/offset-cursor.mjs';
import { parseLines } from '../parse/jsonl-line.mjs';

export const DEFAULT_DEBOUNCE_MS = 50; // ~30-80ms app-level debounce (R17).

/**
 * Create a watcher. `chokidarFactory` is injectable so tests can drive it without a real fs watch;
 * the default uses chokidar. Returns { start, stop, _tailPath } — _tailPath is exposed for tests.
 *
 * @param {{
 *   paths: string[],                 // files/dirs to watch (subagents/, run dir, sibling root)
 *   onGrowth: (ev: {id, lines, records, lastLineComplete, size}) => void,
 *   debounceMs?: number,
 *   chokidarFactory?: (paths, opts) => { on: Function, close: Function },
 *   usePolling?: boolean,            // network-mount fallback
 *   fsImpl?: typeof fs,
 * }} opts
 */
export function createWatcher({ paths, onGrowth, debounceMs = DEFAULT_DEBOUNCE_MS, chokidarFactory, usePolling = false, fsImpl = fs }) {
  const cursors = new Map(); // filePath → cursor
  const timers = new Map();  // filePath → debounce timer
  let watcher = null;

  function idForPath(filePath) {
    const m = filePath.match(/agent-([^/\\]+)\.jsonl$/);
    if (m) return `agent-${m[1]}`;
    // the sibling root transcript
    const r = filePath.match(/([^/\\]+)\.jsonl$/);
    return r ? `root:${r[1]}` : filePath;
  }

  function tail(filePath) {
    let size;
    try { size = fsImpl.statSync(filePath).size; } catch { return; }
    let cursor = cursors.get(filePath) ?? createCursor({ from: 'zero' });
    const rec = reconcileSize(cursor, size);
    cursor = rec.cursor;
    if (rec.reset) cursor = createCursor({ from: 'zero' });
    // Read only the new bytes from cursor.offset to EOF.
    let buf;
    try {
      const fd = fsImpl.openSync(filePath, 'r');
      try {
        const len = Math.max(0, size - cursor.offset);
        buf = Buffer.alloc(len);
        if (len > 0) fsImpl.readSync(fd, buf, 0, len, cursor.offset);
      } finally { fsImpl.closeSync(fd); }
    } catch { return; }
    const out = advance(cursor, buf);
    cursors.set(filePath, out.cursor);
    if (out.lines.length === 0) return;
    const { records } = parseLines(out.lines.join('\n'));
    const lastLineComplete = true; // complete lines only reach here; partial stays in cursor.partial
    onGrowth({
      id: idForPath(filePath),
      lines: out.lines,
      records,
      lastLineComplete,
      size,
    });
  }

  function schedule(filePath) {
    const prev = timers.get(filePath);
    if (prev) clearTimeout(prev);
    timers.set(filePath, setTimeout(() => { timers.delete(filePath); tail(filePath); }, debounceMs));
  }

  async function start() {
    let factory = chokidarFactory;
    if (!factory) {
      const chokidar = await import('chokidar');
      factory = (p, o) => chokidar.watch(p, o);
    }
    watcher = factory(paths, { ignoreInitial: false, usePolling, depth: 99 });
    watcher.on('add', (p) => { if (p.endsWith('.jsonl')) schedule(p); });
    watcher.on('change', (p) => { if (p.endsWith('.jsonl')) schedule(p); });
    return watcher;
  }

  async function stop() {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    if (watcher && typeof watcher.close === 'function') await watcher.close();
  }

  // _tail exposed for deterministic tests (drive a single tail without a real watch event).
  return { start, stop, _tail: tail, _idForPath: idForPath };
}
