// U2 — pure liveness / quiescence state machine (DI1: no fs/ink/react/chokidar). Time is
// INJECTED (every event carries a `now` ms timestamp) so latency + oscillation are deterministically
// testable without real waits. The real-fs latency MEASUREMENT is U9.
//
// States per node: 'active' | 'finished'.
// finished ⇔ (last line parses complete AND no growth for the quiescence window) OR durableUnitDone.
// A re-grow after finished re-emits 'active' (monotonic-but-correctable, R4).
// End-time on an unparseable last line = the last good line's timestamp, flagged approximate (R4).

export const DEFAULT_QUIESCENCE_MS = 2500; // R17: ~2-3s; tunable within P2/P3 bounds.

/**
 * @param {{quiescenceMs?: number}} [opts]
 */
export function createLivenessFsm(opts = {}) {
  const quiescenceMs = Number.isFinite(opts.quiescenceMs) ? opts.quiescenceMs : DEFAULT_QUIESCENCE_MS;
  /** @type {Map<string, NodeState>} */
  const nodes = new Map();

  function ensure(id) {
    let s = nodes.get(id);
    if (!s) {
      s = {
        id,
        status: 'active',
        lastGrowthAt: undefined,
        lastGoodTs: undefined,
        lastLineComplete: true,
        endTime: undefined,
        endTimeApprox: false,
      };
      nodes.set(id, s);
    }
    return s;
  }

  /**
   * Apply one liveness event. Returns the emitted transition(s) for this event (possibly empty).
   * @param {object} ev
   *   ev.type: 'growth' | 'quiescence-tick' | 'durable-done'
   *   ev.id: node id
   *   ev.now: ms timestamp (injected clock)
   *   ev.lastLineComplete?: boolean (for 'growth')
   *   ev.lastGoodTs?: string ISO (for 'growth' — timestamp of last successfully-parsed line)
   * @returns {Array<{id:string, from:string, to:string, at:number, endTime?:string, endTimeApprox?:boolean}>}
   */
  function apply(ev) {
    const s = ensure(ev.id);
    const out = [];
    const from = s.status;

    if (ev.type === 'growth') {
      s.lastGrowthAt = ev.now;
      if (typeof ev.lastGoodTs === 'string') s.lastGoodTs = ev.lastGoodTs;
      s.lastLineComplete = ev.lastLineComplete !== false;
      // Growth always means active; a re-grow after finished re-activates (correctable).
      if (s.status !== 'active') {
        s.status = 'active';
        s.endTime = undefined;
        s.endTimeApprox = false;
        out.push({ id: s.id, from, to: 'active', at: ev.now });
      }
      return out;
    }

    if (ev.type === 'durable-done') {
      if (s.status !== 'finished') {
        s.status = 'finished';
        // End-time: prefer last good ts; flag approx if the last line was incomplete.
        s.endTime = s.lastGoodTs;
        s.endTimeApprox = s.lastLineComplete === false;
        out.push({ id: s.id, from, to: 'finished', at: ev.now, endTime: s.endTime, endTimeApprox: s.endTimeApprox });
      }
      return out;
    }

    if (ev.type === 'quiescence-tick') {
      // Flip to finished iff active AND no growth for >= quiescenceMs.
      if (s.status === 'active' && s.lastGrowthAt !== undefined) {
        const idle = ev.now - s.lastGrowthAt;
        if (idle >= quiescenceMs) {
          s.status = 'finished';
          s.endTime = s.lastGoodTs;
          // An unparseable last line ⇒ end-time = last good ts, marked approximate (R4).
          s.endTimeApprox = s.lastLineComplete === false;
          out.push({ id: s.id, from, to: 'finished', at: ev.now, endTime: s.endTime, endTimeApprox: s.endTimeApprox });
        }
      }
      // No oscillation: a finished node staying quiescent emits NOTHING on repeated ticks.
      return out;
    }

    return out;
  }

  function statusOf(id) {
    return nodes.get(id)?.status;
  }

  function snapshot() {
    // JSON-serializable plain object (no Map, no class instances) for the pure-core contract.
    const obj = {};
    for (const [id, s] of nodes) {
      obj[id] = {
        status: s.status,
        endTime: s.endTime ?? null,
        endTimeApprox: s.endTimeApprox,
      };
    }
    return obj;
  }

  return { apply, statusOf, snapshot, quiescenceMs };
}

/**
 * @typedef {{id:string,status:'active'|'finished',lastGrowthAt?:number,lastGoodTs?:string,
 *            lastLineComplete:boolean,endTime?:string,endTimeApprox:boolean}} NodeState
 */
