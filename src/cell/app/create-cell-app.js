export function createCellApp({
  state,
  tick,
  save,
  document = globalThis.document,
  window = globalThis.window,
  now = () => performance.now(),
  requestFrame = (fn) => requestAnimationFrame(fn),
  cancelFrame = (id) => cancelAnimationFrame(id),
  setIntervalFn = (fn, ms) => setInterval(fn, ms),
  clearIntervalFn = (id) => clearInterval(id),
  intervals = [],
  teardown = [],
} = {}) {
  let running = false;
  let destroyed = false;
  let frameId = null;
  let hiddenTimer = null;
  let saveTimer = null;
  const extraTimers = [];

  function frame(ms) {
    if (!running || destroyed) return;
    try {
      tick(ms);
    } catch (error) {
      console.error(error);
    }
    if (!running || destroyed) return;
    frameId = requestFrame(frame);
  }

  function tickHidden() {
    if (!running || !document.hidden) return;
    try {
      tick(now());
    } catch (error) {
      console.error(error);
    }
  }

  function persist() {
    if (running && state.started) save();
  }

  function start() {
    if (running || destroyed) return;
    running = true;
    hiddenTimer = setIntervalFn(tickHidden, 250);
    saveTimer = setIntervalFn(persist, 5000);
    for (const item of intervals) extraTimers.push(setIntervalFn(item.fn, item.ms));
    window.addEventListener('pagehide', persist);
    frameId = requestFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    if (frameId != null) cancelFrame(frameId);
    if (hiddenTimer != null) clearIntervalFn(hiddenTimer);
    if (saveTimer != null) clearIntervalFn(saveTimer);
    for (const id of extraTimers) clearIntervalFn(id);
    extraTimers.length = 0;
    window.removeEventListener('pagehide', persist);
    frameId = hiddenTimer = saveTimer = null;
  }

  function destroy() {
    if (destroyed) return;
    stop();
    destroyed = true;
    for (const cleanup of teardown) {
      try {
        cleanup?.();
      } catch (error) {
        console.error(error);
      }
    }
  }

  return {
    start,
    stop,
    destroy,
    get running() {
      return running;
    },
    get destroyed() {
      return destroyed;
    },
  };
}
