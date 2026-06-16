// U6 — chokidar watch adapter (the ONLY side-effecting IO layer for live updates). Watches the
// subagents/ subtree + the run dir + the sibling root <sessionId>.jsonl (F1). Emits plain domain
// 'growth' events (with the new complete lines) into a callback; the model/FSM consume them. Uses
// an app-level debounce (NOT chokidar awaitWriteFinish) and the U1 byte-offset tailer. This module
// is deliberately impure (fs/chokidar) — it stays OUT of the run-model import graph (DI1).

import fs from 'node:fs';
import { createCursor, advance, reconcileSize } from '../parse/offset-cursor.mjs';
import { parseLines } from '../parse/jsonl-line.mjs';
import { idForTranscriptPath } from '../model/ids.mjs';

export const DEFAULT_DEBOUNCE_MS = 50; // ~30-80ms app-level debounce (R17).

/**
 * Create a watcher. Returns { start, stop, _tail, _idForPath } — the underscore-prefixed handles
 * are exposed for the deterministic tests (drive a single tail without a real chokidar event).
 *
 * Two injected seams, each with a real consumer:
 *   - `fsImpl`: the deterministic short-read test (controlled-append) injects a stub whose readSync
 *     returns FEWER bytes than requested, asserting advance() sees only buf.subarray(0,n) — the F5
 *     byte-count guard. Defaults to node:fs for production.
 *   - `chokidarFactory`: lets the start()/stop() race test (controlled-append, R2-F2) drive a fake
 *     chokidar deterministically — assert that a stop() racing an unresolved start() closes the
 *     just-created watcher and registers no handlers. Defaults to a real `import('chokidar')`.
 *
 * @param {{
 *   paths: string[],                 // files/dirs to watch (subagents/, run dir, sibling root)
 *   onGrowth: (ev: {id, lines, records, lastLineComplete, size}) => void,
 *   debounceMs?: number,
 *   fsImpl?: typeof fs,
 *   chokidarFactory?: () => (Promise<{watch: Function}> | {watch: Function}),
 * }} opts
 */
export function createWatcher({
  paths,
  onGrowth,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  fsImpl = fs,
  chokidarFactory = () => import('chokidar'),
}) {
  const cursors = new Map(); // filePath → cursor
  const timers = new Map();  // filePath → debounce timer
  let watcher = null;
  let stopped = false;       // R2-F2: stop() ran; a still-resolving start() must NOT register, must close.
  let startPromise = null;   // R2-F2: the in-flight start(), so stop() can await-then-close.

  // F10: node identity is the shared contract (subagent → agent-<id>, sibling root → RUN_ROOT_ID),
  // so a wired live root-growth event dispatches against a node id the model actually built.
  const idForPath = idForTranscriptPath;

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
        if (len > 0) {
          // F5: capture the ACTUAL bytes read. A short/raced read (concurrent truncate/rewrite, or
          // a slow network mount) returns n < len; passing the whole zero-padded buffer would wedge
          // NUL bytes into cursor.partial AND advance the offset past EOF, triggering a replay-from-
          // zero on the next reconcileSize and re-emitting delivered spawn/usage lines. Advance by
          // exactly n; the unread tail is simply retried on the next tail.
          const n = fsImpl.readSync(fd, buf, 0, len, cursor.offset);
          buf = buf.subarray(0, n);
        }
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
    startPromise = (async () => {
      const chokidar = await chokidarFactory();
      // R2-F2: stop() may have already run while the chokidar import was in flight. If so, the
      // watch we are about to create must be closed immediately and NO handlers registered, so the
      // leaked-watch / post-teardown-dispatch contract holds. We still create the watch (chokidar
      // gives us no cheaper way) but tear it down on the same tick before wiring any callback.
      const created = chokidar.watch(paths, { ignoreInitial: false, depth: 99 });
      if (stopped) {
        if (created && typeof created.close === 'function') await created.close();
        return null;
      }
      watcher = created;
      watcher.on('add', (p) => { if (p.endsWith('.jsonl')) schedule(p); });
      watcher.on('change', (p) => { if (p.endsWith('.jsonl')) schedule(p); });
      return watcher;
    })();
    return startPromise;
  }

  async function stop() {
    stopped = true; // honored by any still-resolving start()
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    // Await any in-flight start() so a watch created by a still-resolving start() is closed too —
    // either start() closed it itself (saw stopped) or assigned `watcher` for us to close below.
    if (startPromise) { try { await startPromise; } catch { /* start failures are non-fatal to teardown */ } }
    if (watcher && typeof watcher.close === 'function') await watcher.close();
    watcher = null;
  }

  // _tail exposed for deterministic tests (drive a single tail without a real watch event).
  return { start, stop, _tail: tail, _idForPath: idForPath };
}
