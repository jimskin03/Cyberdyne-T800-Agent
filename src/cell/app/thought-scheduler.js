export function createThoughtScheduler({
  state,
  runThought,
  isOnline,
  isHidden = () => false,
  randomAction,
  allowAutonomousMove = () => true,
  now = Date.now,
  schedule = (fn) => setTimeout(fn, 0),
} = {}) {
  let nextOfflineMoveAt = 0;

  function scheduleThought() {
    schedule(() => runThought());
  }

  function runThoughtNow() {
    void runThought();
  }

  function requestNow(interrupt = true) {
    if (state.thinking) {
      if (!interrupt || state.thinking.intercom) return false;
      state.thinking.ac.abort();
      state.events.unshift(...state.thinking.consumed);
      state.thinking = null;
    }
    state.thinkBackoffUntil = 0;
    state.beatsSince = 99;
    runThoughtNow();
    return true;
  }

  function poll() {
    if (!state.started || state.thinking || isHidden()) return false;
    if (isOnline()) {
      runThoughtNow();
      return true;
    }
    if (
      allowAutonomousMove() &&
      !state.current &&
      !state.queue.length &&
      !state.operatorBusy &&
      now() >= nextOfflineMoveAt
    ) {
      state.queue = [randomAction()];
      nextOfflineMoveAt = now() + 4000;
      return true;
    }
    return false;
  }

  return {requestNow, poll, scheduleThought};
}
