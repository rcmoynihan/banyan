// U8 — subscribe the Ink renderer to the RunModel. Wires the watcher (U6) + liveness FSM (U2)
// into the pure model (U5) and exposes [state, dispatch] for the App. The hook owns the
// side-effecting subscription lifecycle; the model itself stays pure (DI1).

import { useState, useEffect, useCallback, useRef } from 'react';
import { initialState, apply } from '../model/run-model.mjs';
import { createLivenessFsm } from '../model/liveness-fsm.mjs';
import { realClock } from '../core/clock.mjs';

/**
 * @param {{
 *   bootstrap?: (dispatchEvent: (ev: object) => void) => (void | (() => void)),
 *   initial?: object,
 *   quiescenceMs?: number,
 *   clock?: { now: () => number },
 * }} opts
 * @returns {[object, (event: object) => void]}
 */
export function useRunModel({ bootstrap, initial = initialState(), quiescenceMs = 2500, clock = realClock() } = {}) {
  const [state, setState] = useState(initial);
  const fsmRef = useRef(createLivenessFsm({ quiescenceMs }));

  const dispatch = useCallback((event) => {
    setState((prev) => apply(prev, event));
  }, []);

  // Translate a raw watcher growth event into a model 'liveness' event via the FSM.
  const onGrowth = useCallback((growth) => {
    const last = growth.records[growth.records.length - 1];
    const transitions = fsmRef.current.apply({
      type: 'growth',
      id: growth.id,
      now: clock.now(),
      lastLineComplete: growth.lastLineComplete,
      lastGoodTs: last?.timestamp,
    });
    if (transitions.length) dispatch({ type: 'liveness', transitions });
  }, [dispatch, clock]);

  useEffect(() => {
    if (typeof bootstrap !== 'function') return undefined;
    const cleanup = bootstrap(dispatch, onGrowth);
    return typeof cleanup === 'function' ? cleanup : undefined;
  }, [bootstrap, dispatch, onGrowth]);

  return [state, dispatch];
}
