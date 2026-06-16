// U1 — best-effort per-line JSONL parser. PURE: no fs/ink/react/chokidar imports (DI1).
// Every JSON.parse is guarded; a throw NEVER escapes — a bad line degrades to {ok:false}
// and is dropped by the caller, never crashing the render loop (DI2 / R1 / P1a).

/**
 * Parse one transcript line.
 * @param {string} line - a single JSONL line (no trailing newline expected).
 * @returns {{ok: true, record: object} | {ok: false, raw: string, error: string}}
 */
export function parseLine(line) {
  if (typeof line !== 'string') {
    return { ok: false, raw: String(line ?? ''), error: 'non-string-line' };
  }
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return { ok: false, raw: line, error: 'empty-line' };
  }
  try {
    const record = JSON.parse(trimmed);
    if (record === null || typeof record !== 'object') {
      // A bare JSON scalar (number/string/bool/null) is not a transcript record.
      return { ok: false, raw: line, error: 'not-an-object' };
    }
    return { ok: true, record };
  } catch (err) {
    return { ok: false, raw: line, error: err?.message ?? 'parse-error' };
  }
}

/**
 * Parse a block of complete lines, dropping bad ones. Never throws.
 * @param {string} text - newline-joined complete lines.
 * @returns {{records: object[], dropped: Array<{raw: string, error: string}>}}
 */
export function parseLines(text) {
  const records = [];
  const dropped = [];
  for (const line of String(text ?? '').split('\n')) {
    if (line.length === 0) continue;
    const r = parseLine(line);
    if (r.ok) records.push(r.record);
    else dropped.push({ raw: r.raw, error: r.error });
  }
  return { records, dropped };
}
