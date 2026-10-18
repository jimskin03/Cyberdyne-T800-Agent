import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createId} from '../src/cell/id.js';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('IDs use native randomUUID when available and preserve its receiver', () => {
  const crypto = {randomUUID() { assert.equal(this, crypto); return 'native-id'; }};
  assert.equal(createId(crypto), 'native-id');
});

test('HTTP fallback sets UUID version and variant for any random bytes', () => {
  for (const fill of [0, 255]) {
    const crypto = {getRandomValues(bytes) {
      assert.equal(this, crypto);
      assert.equal(bytes.length, 16);
      return bytes.fill(fill);
    }};
    assert.match(createId(crypto), uuidV4);
  }
});

test('HTTP fallback generates distinct IDs with Web Crypto randomness', () => {
  const crypto = {getRandomValues: webcrypto.getRandomValues.bind(webcrypto)};
  const ids = Array.from({length: 1000}, () => createId(crypto));
  for (const id of ids) assert.match(id, uuidV4);
  assert.equal(new Set(ids).size, ids.length);
});
