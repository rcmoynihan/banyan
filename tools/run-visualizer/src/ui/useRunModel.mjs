// U8 — subscribe the Ink renderer to the RunModel. Wires the watcher (U6) + liveness FSM (U2)
// into the pure model (U5) and exposes [state, dispatch] for the App. The hook owns the
// side-effecting subscription lifecycle; the model itself stays pure (DI1).

import { useState, useEffect, useCallback, useRef } from 'react';
import { initialState, apply } from '../model/run-model.mjs';
import { createLivenessFsm } from '../model/liveness-fsm.mjs';
import { realClock } from '../core/clock.mjs';

/**
 * @param {{
 *   bootstrap?: (dispatchEvent: (ev: object) => void, onGrowth: (g: object) => void) => (void | (() => void)),
 *   initial?: object,
 *   quiescenceMs?: number,
 *   clock?: { now: () => number },
 *   scheduleTick?: (cb: () => void, periodMs: number) => (() => void),
 * }} opts
 *   scheduleTick: DI seam for the quiescence-tick producer (F3). Defaults to setInterval; a test
 *   injects a synchronous scheduler so it can drive ticks without real time. Returns a cleanup fn.
 * @returns {[object, (event: object) => void]}
 */
export function useRunModel({
  bootstrap,
  initial = initialState(),
  quiescenceMs = 2500,
  clock = realClock(),
  scheduleTick = defaultScheduleTick,
} = {}) {
  const [state, setState] = useState(initial);
  const fsmRef = useRef(createLivenessFsm({ quiescenceMs }));
  // Track the set of known node ids so the quiescence producer can tick each one (F3). Kept in a
  // ref (not state) so the tick callback always reads the latest roster without re-subscribing.
  const nodeIdsRef = useRef(new Set(Object.keys(initial.nodes ?? {})));

  const dispatch = useCallback((event) => {
    setState((prev) => {
      const next = apply(prev, event);
      // A (re)build-tree or durable-only event resets the known-node roster the producer ticks.
      if (event?.type === 'build-tree' || event?.type === 'durable-only') {
        nodeIdsRef.current = new Set(Object.keys(next.nodes ?? {}));
      }
      return next;
    });
  }, []);

  // Translate a raw watcher growth event into a model 'liveness' event via the FSM.
  const onGrowth = useCallback((growth) => {
    nodeIdsRef.current.add(growth.id); // a growth for a freshly-seen node enters the tick roster
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

  // The bootstrap subscription and the tick producer are MOUNT-ONCE side effects: they start a
  // watch / interval that lives for the component's lifetime and tear down on unmount. Re-running
  // them on every render (e.g. because launch() passes a fresh inline bootstrap) would restart the
  // watcher and re-apply a growth at the latest clock time each render — which would, among other
  // things, keep resetting the FSM's lastGrowthAt and defeat quiescence. Stash the latest closures
  // in refs and depend on [] so each effect runs exactly once.
  const bootstrapRef = useRef(bootstrap);
  const onGrowthRef = useRef(onGrowth);
  const dispatchRef = useRef(dispatch);
  const scheduleTickRef = useRef(scheduleTick);
  const clockRef = useRef(clock);
  const quiescenceRef = useRef(quiescenceMs);
  bootstrapRef.current = bootstrap;
  onGrowthRef.current = onGrowth;
  dispatchRef.current = dispatch;
  scheduleTickRef.current = scheduleTick;
  clockRef.current = clock;
  quiescenceRef.current = quiescenceMs;

  useEffect(() => {
    if (typeof bootstrapRef.current !== 'function') return undefined;
    const cleanup = bootstrapRef.current(
      (ev) => dispatchRef.current(ev),
      (g) => onGrowthRef.current(g),
    );
    return typeof cleanup === 'function' ? cleanup : undefined;
  }, []);

  // F3: the quiescence-tick PRODUCER. The FSM flips active→finished only on a 'quiescence-tick'
  // (or 'durable-done'); nothing else produces it in production. Run a periodic tick (~half the
  // quiescence window so an idle node is caught within ~1.5 windows) over every known node and
  // dispatch the resulting transitions. Injected via scheduleTick so tests drive it deterministically.
  useEffect(() => {
    const periodMs = Math.max(1, Math.floor(quiescenceRef.current / 2));
    const tick = () => {
      const now = clockRef.current.now();
      const transitions = [];
      for (const id of nodeIdsRef.current) {
        transitions.push(...fsmRef.current.apply({ type: 'quiescence-tick', id, now }));
      }
      if (transitions.length) dispatchRef.current({ type: 'liveness', transitions });
    };
    const cancel = scheduleTickRef.current(tick, periodMs);
    return typeof cancel === 'function' ? cancel : undefined;
  }, []);

  return [state, dispatch];
}

/** Default tick scheduler: a real setInterval, cleared on cleanup. Unref'd so a stray interval
 *  (e.g. a test that forgets to unmount) never by itself keeps the process / `node --test` alive. */
function defaultScheduleTick(cb, periodMs) {
  const handle = setInterval(cb, periodMs);
  if (typeof handle?.unref === 'function') handle.unref();
  return () => clearInterval(handle);
}
