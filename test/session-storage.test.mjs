import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CELL_AI_ENABLED_KEY,
  CELL_SAVE_KEY,
  createCellSessionStore,
  hasSessionBackup,
  resetSessionStorage,
  restoreSessionStorage,
} from '../src/cell/session-storage.js';

function memoryStorage(entries = []) {
  const map = new Map(entries);
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test('session reset clears namespaced state, remains undoable, and isolates other projects', () => {
  const storage = memoryStorage([
    [CELL_SAVE_KEY, 'private journal'],
    [CELL_AI_ENABLED_KEY, 'true'],
    ['cell-public-cell.computer.v1', 'private notes'],
    ['other-project', 'untouched'],
  ]);

  resetSessionStorage(storage);
  assert.equal(storage.getItem(CELL_SAVE_KEY), null);
  assert.equal(storage.getItem(CELL_AI_ENABLED_KEY), null);
  assert.equal(storage.getItem('other-project'), 'untouched');
  assert(hasSessionBackup(storage));

  storage.setItem(CELL_SAVE_KEY, 'new session');
  assert(restoreSessionStorage(storage));
  assert.equal(storage.getItem(CELL_SAVE_KEY), 'private journal');
  assert.equal(storage.getItem('cell-public-cell.computer.v1'), 'private notes');
  assert.equal(storage.getItem('other-project'), 'untouched');
  assert(!hasSessionBackup(storage));
});

test('cell session store preserves storage keys, AI preference, archive bounds and persistence delegation', () => {
  const storage = memoryStorage([
    [CELL_SAVE_KEY, JSON.stringify({journal: ['legacy'], where: {x: 1, z: 2}})],
    [CELL_AI_ENABLED_KEY, 'true'],
  ]);
  const saved = [];
  const persistence = {
    loading: Promise.resolve(null),
    save: (value) => saved.push(value),
    takeAcknowledged: () => ['ack-1'],
    status: {available: true, savedAt: 42, error: '', conflict: false},
  };
  const store = createCellSessionStore({storage, persistence});

  assert.deepEqual(store.readLocal(), {journal: ['legacy'], where: {x: 1, z: 2}});
  assert.equal(store.getAiEnabled(), true);
  store.setAiEnabled(false);
  assert.equal(storage.getItem(CELL_AI_ENABLED_KEY), 'false');
  assert.deepEqual(store.takeAcknowledged(), ['ack-1']);
  assert.deepEqual(store.status, persistence.status);

  const archive = Array.from({length: 600}, (_, i) => ({id: String(i)}));
  store.save({journal: ['current'], archive});
  assert.equal(JSON.parse(storage.getItem(CELL_SAVE_KEY)).archive.length, 600);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].archive.length, 500);
});

test('cell session loading prefers persistence data while retaining local archive compatibility', async () => {
  const local = {journal: ['browser'], archive: [{id: 'local-event'}]};
  const disk = {journal: ['disk'], archive: [{id: 'disk-event'}]};
  const storage = memoryStorage([[CELL_SAVE_KEY, JSON.stringify(local)]]);
  const persistence = {loading: Promise.resolve({data: disk, savedAt: 123})};
  const store = createCellSessionStore({storage, persistence});

  const loaded = await store.loading;
  assert.deepEqual(loaded.data, disk);
  assert.deepEqual(loaded.local, local);
  assert.equal(loaded.snapshot.savedAt, 123);
});

test('cell session store tolerates malformed or unavailable browser data', async () => {
  const storage = memoryStorage([[CELL_SAVE_KEY, '{not-json']]);
  const store = createCellSessionStore({storage, persistence: {loading: Promise.resolve(null)}});

  assert.equal(store.readLocal(), null);
  assert.equal((await store.loading).data, null);
  assert.equal(store.getAiEnabled(), false);
});
