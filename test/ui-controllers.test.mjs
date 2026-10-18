import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntercomController} from '../src/cell/ui/intercom-controller.js';

function fakeDocument() {
  const listeners = new Map();
  const input = {
    value: '',
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const button = {};
  return {
    input,
    button,
    listeners,
    getElementById(id) {
      return id === 'ask' ? input : id === 'ask-btn' ? button : null;
    },
  };
}

test('intercom controller owns input normalization without sending before the feed is available', () => {
  const document = fakeDocument();
  const sent = [];
  let ready = false;
  const controller = createIntercomController({
    document,
    canSend: () => ready,
    onSend: (text) => sent.push(text),
  });

  document.input.value = '  hello before start  ';
  assert.equal(controller.submit(), false);
  assert.equal(document.input.value, '  hello before start  ');
  assert.deepEqual(sent, []);

  ready = true;
  document.input.value = '  hello after start  ';
  assert.equal(controller.submit(), true);
  assert.equal(document.input.value, '');
  assert.deepEqual(sent, ['hello after start']);

  document.input.value = 'x'.repeat(400);
  controller.submit();
  assert.equal(sent[1].length, 300);
});

test('intercom enter key prevents form behavior and stops propagation', () => {
  const document = fakeDocument();
  const sent = [];
  createIntercomController({document, onSend: (text) => sent.push(text)});
  document.input.value = 'status';

  let prevented = false;
  let stopped = false;
  document.listeners.get('keydown')({
    key: 'Enter',
    preventDefault: () => (prevented = true),
    stopPropagation: () => (stopped = true),
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.deepEqual(sent, ['status']);
});
