import test from 'node:test';
import assert from 'node:assert/strict';
import {createThoughtScheduler} from '../src/cell/app/thought-scheduler.js';
import {createCellApp} from '../src/cell/app/create-cell-app.js';

test('thought scheduler uses the injected wall clock for offline pacing', () => {
  let time = 0;
  let online = false;
  let thoughts = 0;
  const state = {
    started: true,
    thinking: null,
    events: [],
    queue: [],
    current: null,
    operatorBusy: false,
    beatsSince: 0,
  };
  const scheduler = createThoughtScheduler({
    state,
    runThought: () => {
      thoughts++;
    },
    isOnline: () => online,
    randomAction: () => ({do: 'wait'}),
    now: () => time,
  });

  assert.equal(scheduler.poll(), true);
  assert.deepEqual(state.queue, [{do: 'wait'}]);
  state.queue = [];
  time = 3999;
  assert.equal(scheduler.poll(), false);
  time = 4000;
  assert.equal(scheduler.poll(), true);

  state.queue = [];
  online = true;
  assert.equal(scheduler.poll(), true);
  assert.equal(thoughts, 1);
});

test('urgent thought scheduling cancels stale work but never interrupts an active intercom reply', () => {
  let thoughts = 0;
  let aborted = 0;
  const state = {
    started: true,
    events: [{kind: 'event', text: 'new'}],
    queue: [],
    current: null,
    operatorBusy: false,
    beatsSince: 0,
    thinkBackoffUntil: 99,
    thinking: {
      intercom: false,
      consumed: [{kind: 'event', text: 'old'}],
      ac: {abort: () => aborted++},
    },
  };
  const scheduler = createThoughtScheduler({
    state,
    runThought: () => thoughts++,
    isOnline: () => true,
    randomAction: () => ({do: 'wait'}),
  });

  assert.equal(scheduler.requestNow(true), true);
  assert.equal(aborted, 1);
  assert.equal(thoughts, 1);
  assert.equal(state.thinkBackoffUntil, 0);
  assert.equal(state.beatsSince, 99);
  assert.equal(state.events[0].text, 'old');

  state.thinking = {
    intercom: true,
    consumed: [],
    ac: {abort: () => aborted++},
  };
  assert.equal(scheduler.requestNow(true), false);
  assert.equal(aborted, 1);
  assert.equal(thoughts, 1);
});

test('cell app owns frame, hidden-tab and persistence scheduling and can tear them down', () => {
  const intervals = [];
  const cleared = [];
  const frames = [];
  const cancelledFrames = [];
  const listeners = new Map();
  const document = {hidden: false};
  const window = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const ticks = [];
  let saves = 0;
  const state = {started: true};
  const app = createCellApp({
    state,
    document,
    window,
    tick: (time) => ticks.push(time),
    save: () => saves++,
    now: () => 321,
    requestFrame: (fn) => {
      frames.push(fn);
      return frames.length;
    },
    cancelFrame: (id) => cancelledFrames.push(id),
    setIntervalFn: (fn, ms) => {
      intervals.push({fn, ms});
      return intervals.length;
    },
    clearIntervalFn: (id) => cleared.push(id),
  });

  app.start();
  assert.equal(app.running, true);
  assert.deepEqual(
    intervals.map((item) => item.ms),
    [250, 5000],
  );
  assert.equal(frames.length, 1);
  frames[0](12);
  assert.deepEqual(ticks, [12]);
  assert.equal(frames.length, 2);

  document.hidden = true;
  intervals[0].fn();
  assert.deepEqual(ticks, [12, 321]);
  intervals[1].fn();
  listeners.get('pagehide')();
  assert.equal(saves, 2);

  app.stop();
  assert.equal(app.running, false);
  assert.deepEqual(cleared, [1, 2]);
  assert.ok(cancelledFrames.length);
  assert.equal(listeners.has('pagehide'), false);
});
