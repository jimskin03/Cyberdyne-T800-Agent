import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCreation} from '../src/cell/creator.js';
import {createMind} from '../src/cell/mind.js';
import {createCreativeGenerator} from '../src/cell/ai/creative.js';

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test('mind destroy clears owned polling and aborts its lifecycle signal', async () => {
  let healthSignal;
  let cleared;
  const mind = createMind({
    client: {
      health: async ({signal}) => {
        healthSignal = signal;
        return {
          status: 'ok',
          vision: true,
          agent: {name: 'Lifecycle Agent'},
          auth: {mode: 'none', connected: true},
        };
      },
      complete: async () => ({choices: []}),
    },
    setIntervalFn: () => 73,
    clearIntervalFn: (id) => {
      cleared = id;
    },
  });
  await nextTurn();
  assert.equal(mind.online, true);
  assert.equal(healthSignal.aborted, false);

  mind.destroy();
  assert.equal(cleared, 73);
  assert.equal(healthSignal.aborted, true);
  assert.equal(mind.online, false);

  mind.destroy();
  assert.equal(cleared, 73);
});

test('creative generation inherits lifecycle cancellation even without an action signal', async () => {
  const lifecycle = new AbortController();
  let requestSignal;
  const generator = createCreativeGenerator({
    state: {vision: false},
    lifecycleSignal: lifecycle.signal,
    logger: {error() {}},
    client: {
      complete(_body, {signal}) {
        requestSignal = signal;
        return new Promise((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(signal.reason ?? new DOMException('cancelled', 'AbortError')),
            {once: true},
          );
        });
      },
    },
  });

  const pending = generator.create3D({name: 'unfinished', idea: 'cancel me'});
  await nextTurn();
  assert.equal(requestSignal.aborted, false);
  lifecycle.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(requestSignal.aborted, true);
});

test('procedural worker is terminated immediately when its action is cancelled', async () => {
  const originalWorker = globalThis.Worker;
  const workers = [];
  class FakeWorker {
    constructor() {
      this.terminated = false;
      workers.push(this);
    }
    postMessage() {}
    terminate() {
      this.terminated = true;
    }
  }
  globalThis.Worker = FakeWorker;
  try {
    const controller = new AbortController();
    const pending = buildCreation('return new THREE.Group()', {signal: controller.signal});
    assert.equal(workers.length, 1);
    controller.abort();
    await assert.rejects(pending, {name: 'AbortError'});
    assert.equal(workers[0].terminated, true);
  } finally {
    globalThis.Worker = originalWorker;
  }
});
