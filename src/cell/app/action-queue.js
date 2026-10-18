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

    actions
      .run(pending, token)
      .then((result) => {
        if (token.cancelled) return;
        if (token.observation) state.pendingObservation = token.observation;
        if (!result) return;

        state.events.push({kind: 'result', text: result, t: formatTime(state.simMin)});
        if (/repair|create_3d|code|draw|write/.test(action.do || ''))
          lifeMemory.experience.observe({
            id: createId(),
            kind: /could not|failed|unable|not reached/i.test(result)
              ? 'task_failure'
              : /repaired|created|built|finished|completed|wrote|drew|saved|installed|success/i.test(
                    result,
                  )
                ? 'task_success'
                : null,
            source: 'world',
            observed: true,
            text: result,
            choice: describeAction(action),
          });
        journal('result', result + ' ' + nervous.describe(), {
          action,
          progress: Math.hypot(body.st.x - before.x, body.st.z - before.z),
          remaining: body.navigation?.remaining,
        });
      })
      .catch((error) => {
        if (error === interrupt || token.cancelled || error?.name === 'AbortError') return;
        console.error(error);
        const result = 'That action failed: ' + String(error?.message || error).slice(0, 220);
        state.events.push({kind: 'result', text: result, t: formatTime(state.simMin)});
        journal('result', result, {action, success: false});
        lifeMemory.experience.observe({
          id: createId(),
          kind: 'task_failure',
          source: 'world',
          observed: true,
          text: result,
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
