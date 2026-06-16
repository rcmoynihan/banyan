// U9 — injectable clock so timing-sensitive logic is deterministically testable. The real clock
// uses Date.now(); a manual clock lets tests advance time without real waits.

export function realClock() {
  return { now: () => Date.now() };
}

export function manualClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => { t += ms; return t; },
    set: (ms) => { t = ms; return t; },
  };
}
