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
} = {}) {
  let running = false;
  let frameId = null;
  let hiddenTimer = null;
  let saveTimer = null;

  function frame(ms) {
    if (!running) return;
    try {
      tick(ms);
    } catch (error) {
      console.error(error);
    }
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
    if (running) return;
    running = true;
    hiddenTimer = setIntervalFn(tickHidden, 250);
    saveTimer = setIntervalFn(persist, 5000);
    window.addEventListener('pagehide', persist);
    frameId = requestFrame(frame);
  }

  function stop() {
    if (!running) return;
    running = false;
    if (frameId != null) cancelFrame(frameId);
    if (hiddenTimer != null) clearIntervalFn(hiddenTimer);
    if (saveTimer != null) clearIntervalFn(saveTimer);
    window.removeEventListener('pagehide', persist);
    frameId = hiddenTimer = saveTimer = null;
  }

  return {
    start,
    stop,
    get running() {
      return running;
    },
  };
}
