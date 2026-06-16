// U1 — pure byte-offset tailer cursor (DI1, no fs). The caller supplies Buffers; this advances
// by BYTES (never chars) so a multi-byte UTF-8 char split across two reads reassembles correctly.
// An incomplete trailing line is carried in `partial` and parsed only once complete — this is
// simultaneously the torn-write guard (R1 / P1a).

/**
 * Create a cursor. Cursors always replay from the start (R18 replay default); the caller
 * re-reads bytes from `offset` and feeds them to advance().
 * @param {{offset?: number}} [opts] - `offset` seeds a non-zero start (a prior position).
 *   (A legacy `from` option is accepted and ignored for backward compatibility.)
 */
export function createCursor(opts = {}) {
  return {
    offset: Number.isInteger(opts.offset) ? opts.offset : 0,
    // partial is a Buffer holding bytes after the last newline (an incomplete trailing line).
    partial: Buffer.alloc(0),
  };
}

/**
 * Advance the cursor by appending newly-read bytes. Returns the COMPLETE lines newly available
 * (as UTF-8 strings) and a new cursor; the incomplete trailing line stays in `partial`.
 *
 * @param {object} cursor - prior cursor (from createCursor or a prior advance()).
 * @param {Buffer} chunk - newly-read bytes starting at cursor.offset.
 * @returns {{lines: string[], cursor: object}}
 */
export function advance(cursor, chunk) {
  const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk ?? '');
  // Prepend any carried partial bytes, then split on the newline BYTE (0x0a).
  const combined = Buffer.concat([cursor.partial, buf]);
  const lines = [];
  let start = 0;
  for (let i = 0; i < combined.length; i++) {
    if (combined[i] === 0x0a) {
      // toString('utf8') over a complete line reassembles any multi-byte char whole.
      lines.push(combined.toString('utf8', start, i));
      start = i + 1;
    }
  }
  const partial = combined.subarray(start); // bytes after the last newline (incomplete line)
  return {
    lines,
    cursor: {
      offset: cursor.offset + buf.length,
      partial: Buffer.from(partial), // copy so the caller can reuse `combined`'s memory
    },
  };
}

/**
 * Reconcile the cursor against the current file size. If size < offset, the file was truncated/
 * rotated → reset to a fresh replay-from-zero cursor (caller re-reads from 0). Otherwise unchanged.
 * @returns {{cursor: object, reset: boolean}}
 */
export function reconcileSize(cursor, size) {
  if (typeof size === 'number' && size < cursor.offset) {
    return { cursor: createCursor(), reset: true };
  }
  return { cursor, reset: false };
}
