import {normalizeActionResult, failed} from '../actions/result.js';
export function createActionQueue({
  state,
  actions,
  body,
  nervous,
  lifeMemory,
  journal,
  describeAction,
  formatTime,
  save,
  isBlocked = () => false,
  onDoing = () => {},
  scheduleThought = () => {},
  interrupt,
  now = () => performance.now() / 1000,
  wallNow = Date.now,
  random = Math.random,
  createId = () => crypto.randomUUID(),
  createAbortController = () => new AbortController(),
} = {}) {
  function runNext(time) {
    if (isBlocked() || state.current || !state.queue.length || time < state.nextActionAt)
      return false;

    const pending = state.queue.shift();
    state.current = pending;
    pending.t0 = time;
    const controller = createAbortController();
    const token = {
      cancelled: false,
      signal: controller.signal,
      abort: () => controller.abort(),
    };
    pending.tok = token;
    const before = {x: body.st.x, z: body.st.z};
    const action = Object.fromEntries(
      Object.entries(pending).filter(([key]) => !['tok', 't0'].includes(key)),
    );

    journal('act', describeAction(pending), {action});
    onDoing(describeAction(pending));
    if (/^(browser|slopcannon)$/.test(pending.do || '')) state.lastBrowserCheck = wallNow();

    const execute = actions.runResult ? actions.runResult(pending, token) : actions.run(pending, token).then(normalizeActionResult);
    execute
      .then((outcome) => {
        const result=normalizeActionResult(outcome);
        if (token.cancelled || result.status==='cancelled') return;
        if (token.observation) state.pendingObservation = token.observation;
        if (!result.text) return;

        state.events.push({kind: 'result', text: result.text, status: result.status, t: formatTime(state.simMin)});
        if (/repair|create_3d|code|draw|write/.test(action.do || ''))
          lifeMemory.experience.observe({
            id: createId(),
            kind: result.status === 'completed' ? 'task_success' : 'task_failure',
            source: 'world',
            observed: true,
            text: result.text,
            choice: describeAction(action),
          });
        journal('result', result.text + ' ' + nervous.describe(), {
          action,
          status: result.status,
          success: result.status === 'completed',
          progress: Math.hypot(body.st.x - before.x, body.st.z - before.z),
          remaining: body.navigation?.remaining,
        });
      })
      .catch((error) => {
        if (error === interrupt || token.cancelled || error?.name === 'AbortError') return;
        console.error(error);
        const result = failed('That action failed: ' + String(error?.message || error).slice(0, 220));
        state.events.push({kind: 'result', text: result.text, status: result.status, t: formatTime(state.simMin)});
        journal('result', result.text, {action, status: result.status, success: false});
        lifeMemory.experience.observe({
          id: createId(),
          kind: 'task_failure',
          source: 'world',
          observed: true,
          text: result.text,
          choice: describeAction(action),
        });
      })
      .finally(() => {
        if (state.current === pending) {
          state.current = null;
          onDoing(state.queue.length ? '…' : '');
          if (!state.queue.length) state.operatorBusy = false;
        }
        state.nextActionAt = now() + 0.35 + random() * 0.6;
        save();
        if (state.pendingObservation) scheduleThought();
      });
    return true;
  }

  return {runNext};
}
