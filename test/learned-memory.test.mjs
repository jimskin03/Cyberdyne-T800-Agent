import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, stat, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@libsql/client';
import {createApiServer} from '../tools/api-server.mjs';
import {createLocalMemoryStore} from '../tools/memory/local-store.mjs';
import {createTursoMemoryStore} from '../tools/memory/turso-store.mjs';
import {createMemoryService, memoryAuthorized, CLEAR_CONFIRMATION} from '../tools/memory/service.mjs';
import {memoryConfiguration, ensureMemoryToken, readMemoryToken} from '../tools/memory/config.mjs';
import {cleanBatch, queryTerms, rankRecords} from '../tools/memory/records.mjs';
import {addMemoryToken} from '../tools/scene-proxy.mjs';
import {createLearnedMemory, LEARNED_MEMORY_KEY, describeLearned} from '../src/cell/learned-memory.js';
import {resetSessionStorage} from '../src/cell/storage/session-store.js';

const TOKEN = 'unit-memory-token-0123456789';
const unconfigured = {configured: false, endpoint: '', key: '', textModel: '', agentName: 'Agent', authMode: 'none', oauth: null, source: 'none', kind: 'none', host: '', allowedOrigins: []};
const record = (id, text, extra = {}) => ({id, kind: 'intercom', text, at: 1_700_000_000_000, session: 'session-a', ...extra});
const tempDir = () => mkdtemp(join(tmpdir(), 'learned-memory-'));

function memoryStorage() {
  const map = new Map();
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();
  const call = (path, {method = 'GET', token, body} = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {...(token ? {authorization: 'Bearer ' + token} : {}), ...(body ? {'content-type': 'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({status: r.status, data: await r.json()}));
  return {port, call, close: () => new Promise((resolve) => server.close(resolve))};
}

test('record validation keeps only bounded interaction kinds', () => {
  const {scope, records} = cleanBatch({records: [record('a1', '  hello  ')]});
  assert.equal(scope, 'cell');
  assert.equal(records[0].text, 'hello');
  assert.throws(() => cleanBatch({records: [{...record('a2', 'x'), kind: 'heartbeat'}]}), /kind/);
  assert.throws(() => cleanBatch({records: [{...record('bad id!', 'x')}]}), /id/);
  assert.throws(() => cleanBatch({scope: '../etc', records: []}), /scope/);
  assert.throws(() => cleanBatch({records: Array.from({length: 101}, (_, i) => record('r' + i, 'x'))}), (e) => e.status === 413);
  assert.equal(cleanBatch({records: [record('a3', 'x'.repeat(5000))]}).records[0].text.length, 2000);
});

test('local file store deduplicates, survives a restart and clears only on request', async () => {
  const dir = await tempDir();
  try {
    const store = createLocalMemoryStore(dir);
    assert.equal((await store.add('cell', [record('m1', 'Operator asked about the thermostat'), record('m2', 'Talked about the towel', {session: 'session-b'})])).stored, 2);
    assert.equal((await store.add('cell', [record('m1', 'Operator asked about the thermostat')])).stored, 0);
    const restarted = createLocalMemoryStore(dir);
    assert.equal(await restarted.count('cell'), 2);
    assert.deepEqual((await restarted.recall('cell', 'thermostat please')).map((r) => r.id), ['m1']);
    assert.deepEqual((await restarted.recall('cell', 'towel thermostat', {excludeSession: 'session-a'})).map((r) => r.id), ['m2']);
    assert.equal(await restarted.count('other'), 0);
    assert.equal(await restarted.epoch('cell'), 0);
    const clearedStore = await restarted.clear('cell');
    assert.equal(clearedStore.removed, 2);
    assert.equal(clearedStore.epoch, 1);
    const afterClear = createLocalMemoryStore(dir);
    assert.equal(await afterClear.count('cell'), 0);
    assert.equal(await afterClear.epoch('cell'), 1);
    const staleWrite = await afterClear.add('cell', [record('m1', 'Operator asked about the thermostat')], {epoch: 0});
    assert.equal(staleWrite.conflict, true);
    assert.equal(staleWrite.epoch, 1);
    assert.equal(await afterClear.count('cell'), 0);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('Turso store uses parameterized SQL against an injected client', async () => {
  const calls = [];
  const client = {
    async batch(statements, mode) {
      calls.push({batch: statements, mode});
      return statements.map((statement) => {
        const sql = typeof statement === 'string' ? statement : statement.sql;
        if (/SELECT count\(\*\)/.test(sql)) return {rows: [{n: 3}]};
        if (/RETURNING epoch/.test(sql)) return {rows: [{epoch: 1}]};
        if (/^DELETE/.test(sql)) return {rowsAffected: 3, rows: []};
        return {rowsAffected: 1, rows: []};
      });
    },
    async execute(statement) {
      calls.push({execute: statement});
      if (/^SELECT count/.test(statement.sql)) return {rows: [{n: 3}]};
      if (/^DELETE/.test(statement.sql)) return {rowsAffected: 3, rows: []};
      return {rows: [{id: 't1', session: 'old', kind: 'say', text: 'I remember the thermostat', at: 5}]};
    },
  };
  const store = await createTursoMemoryStore({client});
  assert.equal(store.backend, 'turso');
  assert.equal((await store.add('cell', [record('t1', "it's O'Brien; DROP TABLE x")])).stored, 1);
  assert.match(calls[0].batch[0], /CREATE TABLE IF NOT EXISTS learned_memory/);
  const insert = calls[1].batch[1];
  assert.match(insert.sql, /INSERT OR IGNORE/);
  assert.equal(insert.args[4], "it's O'Brien; DROP TABLE x");
  const found = await store.recall('cell', 'thermostat', {excludeSession: 'now'});
  assert.equal(found[0].id, 't1');
  const select = calls.at(-1).execute;
  assert.match(select.sql, /ORDER BY score DESC, at DESC LIMIT \?/);
  assert.doesNotMatch(select.sql, /LIMIT 300/);
  assert.deepEqual(select.args, ['%thermostat%', 'cell', 'now', '%thermostat%', 8]);
  assert.equal(await store.count('cell'), 3);
  const cleared = await store.clear('cell');
  assert.equal(cleared.removed, 3);
  assert.equal(cleared.epoch, 1);
  const clearBatch = calls.at(-1).batch;
  assert.match(clearBatch[2].sql, /ON CONFLICT\(scope\) DO UPDATE SET epoch = epoch \+ 1/);
  assert.deepEqual(clearBatch[2].args, ['cell']);
  assert.match(calls[0].batch[2], /CREATE TABLE IF NOT EXISTS learned_memory_epoch/);
  assert.equal(calls.filter((c) => Array.isArray(c.batch) && typeof c.batch[0] === 'string').length, 1, 'schema is created once');
});

test('configuration picks Turso only when both credentials are set', async () => {
  assert.equal(memoryConfiguration({}).backend, 'local');
  const turso = memoryConfiguration({TURSO_DATABASE_URL: 'libsql://db-example.turso.io', TURSO_AUTH_TOKEN: 'secret'});
  assert.equal(turso.backend, 'turso');
  assert.throws(() => memoryConfiguration({TURSO_DATABASE_URL: 'libsql://db-example.turso.io'}), /both/);
  assert.throws(() => memoryConfiguration({TURSO_DATABASE_URL: 'ftp://x', TURSO_AUTH_TOKEN: 'y'}), /libsql/);
  assert.throws(() => memoryConfiguration({MEMORY_API_TOKEN: 'short'}), /16/);
  const fake = {batch: async (s) => s.map(() => ({rowsAffected: 0})), execute: async () => ({rows: [{n: 0}]})};
  const dir = await tempDir();
  try {
    const service = await createMemoryService({TURSO_DATABASE_URL: 'libsql://db-example.turso.io', TURSO_AUTH_TOKEN: 'secret', MEMORY_API_TOKEN: TOKEN, MEMORY_DIR: dir}, {client: fake});
    assert.equal(service.backend, 'turso');
    assert.equal(service.tokenSource, 'env');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('zero-config token is generated once into an owner-only file', async () => {
  const dir = await tempDir();
  try {
    const first = await ensureMemoryToken({token: '', directory: dir});
    assert.equal(first.source, 'generated');
    assert.ok(first.token.length >= 32);
    if (process.platform !== 'win32') assert.equal((await stat(first.path)).mode & 0o777, 0o600);
    const second = await ensureMemoryToken({token: '', directory: dir});
    assert.equal(second.token, first.token);
    assert.equal(readMemoryToken({MEMORY_DIR: dir}), first.token);
    assert.equal(readMemoryToken({MEMORY_API_TOKEN: TOKEN, MEMORY_DIR: dir}), TOKEN);
    assert.equal((await ensureMemoryToken({token: TOKEN, directory: dir})).source, 'env');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('memory API requires the token, persists across adapter restarts and confirms clears', async () => {
  const dir = await tempDir();
  const env = {MEMORY_API_TOKEN: TOKEN, MEMORY_DIR: dir};
  try {
    let api = await listen(createApiServer(unconfigured, {memory: await createMemoryService(env)}));
    assert.equal((await api.call('/memory/status')).status, 401);
    assert.equal((await api.call('/memory/status', {token: 'wrong-token-0123456789'})).status, 401);
    assert.equal((await api.call('/memory/records', {method: 'POST', body: {records: [record('x1', 'Hi')]}})).status, 401);
    const missingEpoch = await api.call('/memory/records', {method: 'POST', token: TOKEN, body: {records: [record('x0', 'No generation')]}});
    assert.equal(missingEpoch.status, 400);
    assert.equal(missingEpoch.data.code, 'memory_epoch_required');
    const saved = await api.call('/memory/records', {method: 'POST', token: TOKEN, body: {epoch: 0, records: [record('x1', 'The operator likes chess'), record('x2', 'Asked about chess openings', {kind: 'say'})]}});
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data.acknowledged, ['x1', 'x2']);
    await api.close();

    api = await listen(createApiServer(unconfigured, {memory: await createMemoryService(env)}));
    const status = await api.call('/memory/status', {token: TOKEN});
    assert.deepEqual(status.data, {available: true, backend: 'local', scope: 'cell', count: 2, epoch: 0});
    const recalled = await api.call('/memory/recall?q=chess&excludeSession=other', {token: TOKEN});
    assert.equal(recalled.data.records.length, 2);
    assert.equal((await api.call('/memory/recall?q=chess&excludeSession=session-a', {token: TOKEN})).data.records.length, 0);
    const unconfirmed = await api.call('/memory/clear', {method: 'POST', token: TOKEN, body: {}});
    assert.equal(unconfirmed.status, 400);
    assert.equal((await api.call('/memory/status', {token: TOKEN})).data.count, 2);
    const cleared = await api.call('/memory/clear', {method: 'POST', token: TOKEN, body: {confirm: CLEAR_CONFIRMATION}});
    assert.equal(cleared.data.removed, 2);
    await api.close();

    api = await listen(createApiServer(unconfigured));
    assert.equal((await api.call('/memory/status', {token: TOKEN})).status, 503);
    await api.close();
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('store failures return a fixed message without database details', async () => {
  const failing = {backend: 'turso', count: async () => { throw Error('connect libsql://private-host.turso.io failed'); }};
  const api = await listen(createApiServer(unconfigured, {memory: {token: TOKEN, store: failing}}));
  try {
    const response = await api.call('/memory/status', {token: TOKEN});
    assert.equal(response.status, 502);
    assert.equal(JSON.stringify(response.data).includes('private-host'), false);
  } finally {
    await api.close();
  }
});

test('bearer comparison rejects missing and malformed headers', () => {
  assert.equal(memoryAuthorized({headers: {}}, TOKEN), false);
  assert.equal(memoryAuthorized({headers: {authorization: 'Basic ' + TOKEN}}, TOKEN), false);
  assert.equal(memoryAuthorized({headers: {authorization: 'Bearer ' + TOKEN}}, ''), false);
  assert.equal(memoryAuthorized({headers: {authorization: 'Bearer ' + TOKEN}}, TOKEN), true);
});

test('scene proxy adds the token only for the operator on this computer', () => {
  const run = (path, {address = '127.0.0.1', host = '127.0.0.1:5340', authorization} = {}) => {
    const headers = {};
    const proxyReq = {path, setHeader: (k, v) => (headers[k] = v)};
    const req = {socket: {remoteAddress: address}, headers: {host, ...(authorization ? {authorization} : {})}};
    return {added: addMemoryToken(proxyReq, req, TOKEN), headers};
  };
  assert.deepEqual(run('/memory/status').headers, {authorization: 'Bearer ' + TOKEN});
  assert.equal(run('/memory/status', {host: 'localhost:5340'}).added, true);
  assert.equal(run('/v1/chat/completions').added, false);
  assert.equal(run('/memory/status', {host: 'grokbot-box.tail.ts.net'}).added, false, 'Tailscale serve keeps its Host');
  assert.equal(run('/memory/status', {host: 'example.trycloudflare.com'}).added, false, 'tunnels keep their Host');
  assert.equal(run('/memory/status', {address: '192.168.1.20'}).added, false, 'LAN clients are not trusted');
  assert.equal(run('/memory/status', {authorization: 'Bearer typed'}).added, false);
});

test('browser client records interactions, survives reloads and falls back offline', async () => {
  const storage = memoryStorage();
  const offline = async () => {
    throw new TypeError('fetch failed');
  };
  let memory = createLearnedMemory({storage, fetcher: offline});
  assert.equal(memory.record({id: 'b1', kind: 'intercom', text: 'Do you remember the red ball?', at: 10, session: 's1'}), true);
  assert.equal(memory.record({id: 'b2', kind: 'heartbeat', text: 'thump'}), false);
  assert.equal(memory.record({id: 'b3', kind: 'act', text: 'walks'}), false);
  assert.equal(memory.record({id: 'b1', kind: 'intercom', text: 'duplicate'}), false);
  assert.equal(await memory.flush(), 0);

  memory = createLearnedMemory({storage, fetcher: offline});
  assert.equal(memory.records.length, 1);
  assert.equal(memory.status.pending, 1);
  assert.match(await memory.recall('red ball', {session: 's2'}), /Operator said: Do you remember the red ball/);
  assert.equal(await memory.recall('red ball', {session: 's1'}), '');

  resetSessionStorage(storage);
  assert.ok(storage.getItem(LEARNED_MEMORY_KEY), 'Reset Session keeps learned memory');
  assert.equal(LEARNED_MEMORY_KEY.startsWith('cell-public-'), false);
});

test('browser client syncs to the adapter and forgets only with the confirmation phrase', async () => {
  const storage = memoryStorage(),
    sent = [];
  const fetcher = async (url, init = {}) => {
    sent.push({url, init});
    const body = init.body ? JSON.parse(init.body) : null;
    if (url.startsWith('/llm/memory/records'))
      return Response.json({backend: 'turso', stored: body.records.length, acknowledged: body.records.map((r) => r.id)});
    if (url.startsWith('/llm/memory/recall'))
      return Response.json({backend: 'turso', records: [{id: 'c0', kind: 'say', text: 'We spoke about rain.', at: 0}]});
    if (url.startsWith('/llm/memory/clear')) return Response.json({backend: 'turso', removed: 4});
    return Response.json({available: true, backend: 'turso', count: 4});
  };
  const memory = createLearnedMemory({storage, fetcher});
  memory.setToken('remote-token-0123456789');
  memory.record({id: 'c1', kind: 'say', text: 'It is raining.', at: 20, session: 's1'});
  assert.equal(await memory.flush(), 1);
  assert.equal(memory.status.pending, 0);
  assert.equal(memory.status.backend, 'turso');
  assert.equal(sent[0].init.headers.authorization, 'Bearer remote-token-0123456789');
  assert.equal('synced' in JSON.parse(sent[0].init.body).records[0], false);
  assert.match(await memory.recall('rain', {session: 's1'}), /You said: We spoke about rain/);
  assert.match(sent.find((s) => s.url.startsWith('/llm/memory/recall')).url, /excludeSession=s1/);
  const result = await memory.forget();
  assert.equal(result.removed, 4);
  assert.equal(JSON.parse(sent.at(-1).init.body).confirm, 'forget-learned-memory');
  assert.equal(memory.records.length, 0);
  assert.equal(JSON.parse(sent[0].init.body).epoch, 0);
});

test('search keeps short words, acronyms and Han characters, and a useless query matches nothing', () => {
  const records = [
    {id: 'dog', kind: 'note', text: 'The dog waited by the door', at: 2},
    {id: 'cat', kind: 'note', text: 'The cat sat on the radio', at: 1},
    {id: 'mcp', kind: 'say', text: 'MCP listed the weather source', at: 3},
    {id: 'cn', kind: 'intercom', text: '那只猫在看门', at: 4},
  ];
  assert.deepEqual(queryTerms('cat'), ['cat']);
  assert.deepEqual(queryTerms('MCP'), ['mcp']);
  assert.deepEqual(queryTerms('猫'), ['猫']);
  assert.deepEqual(queryTerms('the'), []);
  assert.deepEqual(rankRecords(records, 'cat').map((r) => r.id), ['cat']);
  assert.deepEqual(rankRecords(records, 'MCP').map((r) => r.id), ['mcp']);
  assert.deepEqual(rankRecords(records, '猫').map((r) => r.id), ['cn']);
  assert.deepEqual(rankRecords(records, '???'), []);
  assert.equal(rankRecords(records, '').length, 4);
});

test('the local limit keeps unsynced memories and drops synced copies first', async () => {
  const storage = memoryStorage();
  const fetcher = async (url, init = {}) => {
    if (String(url).includes('/records')) {
      const body = JSON.parse(init.body);
      return Response.json({backend: 'local', stored: body.records.length, acknowledged: body.records.map((r) => r.id), epoch: 0});
    }
    return Response.json({available: true, backend: 'local', epoch: 0});
  };
  const offline = createLearnedMemory({storage: memoryStorage(), fetcher: async () => { throw new TypeError('offline'); }, localLimit: 2});
  assert.equal(offline.record({id: 'a', kind: 'note', text: 'first memory', at: 1}), true);
  assert.equal(offline.record({id: 'b', kind: 'note', text: 'second memory', at: 2}), true);
  assert.equal(offline.record({id: 'c', kind: 'note', text: 'third memory', at: 3}), false);
  assert.equal(offline.status.capacity, true);
  assert.deepEqual(offline.records.map((r) => r.id), ['a', 'b']);

  const memory = createLearnedMemory({storage, fetcher, localLimit: 2});
  memory.record({id: 'a', kind: 'note', text: 'alpha memory', at: 1});
  memory.record({id: 'b', kind: 'note', text: 'beta memory', at: 2});
  assert.equal(await memory.flush(), 2);
  assert.equal(memory.record({id: 'c', kind: 'note', text: 'gamma memory', at: 3}), true);
  assert.deepEqual(memory.records.map((r) => r.id), ['b', 'c']);
});

test('flush drains the backlog in bounded batches', async () => {
  const posts = [];
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    posts.push(body.records.length);
    return Response.json({backend: 'local', stored: body.records.length, acknowledged: body.records.map((r) => r.id), epoch: 0});
  };
  const memory = createLearnedMemory({storage: memoryStorage(), fetcher});
  for (let i = 0; i < 101; i++) memory.record({id: 'm' + i, kind: 'note', text: 'note ' + i, at: i + 1});
  assert.equal(await memory.flush(), 101);
  assert.deepEqual(posts, [100, 1]);
  assert.equal(memory.status.pending, 0);
});

test('a failed remote forget keeps the browser copy until the operator deletes it locally', async () => {
  const storage = memoryStorage();
  const fetcher = async (url) => {
    if (String(url).includes('/clear')) return Response.json({error: 'Memory token required'}, {status: 401});
    return Response.json({error: 'down'}, {status: 503});
  };
  const memory = createLearnedMemory({storage, fetcher});
  assert.equal(memory.record({id: 'k1', kind: 'note', text: 'Keep the towel folded.', at: 5, session: 's1'}), true);
  const failed = await memory.forget();
  assert.equal(failed.localCleared, false);
  assert.equal(failed.status, 401);
  assert.equal(memory.records.length, 1);
  const local = await memory.forget({localOnly: true});
  assert.equal(local.localCleared, true);
  assert.equal(memory.records.length, 0);
});

test('an in-flight sync cannot restore memories after forget', async () => {
  let release;
  const fetcher = (url, init = {}) =>
    new Promise((resolve, reject) => {
      const fail = () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'}));
      if (init.signal?.aborted) return fail();
      init.signal?.addEventListener('abort', fail, {once: true});
      if (String(url).includes('/records')) {
        release = () => resolve(Response.json({backend: 'local', stored: 1, acknowledged: ['z1'], epoch: 0}));
        return;
      }
      if (String(url).includes('/clear')) {
        resolve(Response.json({backend: 'local', removed: 1, epoch: 1}));
        return;
      }
      resolve(Response.json({available: true, backend: 'local', count: 0, epoch: 0}));
    });
  const memory = createLearnedMemory({storage: memoryStorage(), fetcher});
  memory.record({id: 'z1', kind: 'note', text: 'Temporary note about the door.', at: 9});
  const flushing = memory.flush();
  const forgotten = await memory.forget();
  assert.equal(forgotten.removed, 1);
  assert.equal(forgotten.localCleared, true);
  assert.equal(memory.records.length, 0);
  release?.();
  assert.equal(await flushing, 0);
  assert.equal(memory.records.length, 0);
  memory.record({id: 'z2', kind: 'note', text: 'After the wipe.', at: 10});
  assert.deepEqual(memory.records.map((r) => r.id), ['z2']);
});

test('a stale sync cannot recreate memories cleared a moment earlier', async () => {
  const dir = await tempDir();
  const env = {MEMORY_API_TOKEN: TOKEN, MEMORY_DIR: dir};
  const api = await listen(createApiServer(unconfigured, {memory: await createMemoryService(env)}));
  try {
    const saved = await api.call('/memory/records', {method: 'POST', token: TOKEN, body: {epoch: 0, records: [record('s1', 'Keep the chess board')]}});
    assert.equal(saved.status, 200);
    assert.equal(saved.data.epoch, 0);
    const cleared = await api.call('/memory/clear', {method: 'POST', token: TOKEN, body: {confirm: CLEAR_CONFIRMATION}});
    assert.equal(cleared.data.removed, 1);
    assert.equal(cleared.data.epoch, 1);
    const stale = await api.call('/memory/records', {method: 'POST', token: TOKEN, body: {epoch: 0, records: [record('s1', 'Keep the chess board')]}});
    assert.equal(stale.status, 409);
    assert.equal(stale.data.epoch, 1);
    const missing = await api.call('/memory/records', {method: 'POST', token: TOKEN, body: {records: [record('s3', 'No generation')]}});
    assert.equal(missing.status, 400);
    assert.equal((await api.call('/memory/status', {token: TOKEN})).data.count, 0);
    const fresh = await api.call('/memory/records', {method: 'POST', token: TOKEN, body: {epoch: 1, records: [record('s2', 'A new note about rain')]}});
    assert.equal(fresh.status, 200);
    assert.equal((await api.call('/memory/status', {token: TOKEN})).data.count, 1);
  } finally {
    await api.close();
    await rm(dir, {recursive: true, force: true});
  }
});

test('a generation mismatch does not re-upload deleted memories', async () => {
  const posts = [];
  const fetcher = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    if (String(url).includes('/records')) {
      posts.push(body);
      if (body.epoch !== 2) return Response.json({code: 'memory_stale', error: 'Memory sync is stale.', epoch: 2}, {status: 409});
      return Response.json({backend: 'local', stored: body.records.length, acknowledged: body.records.map((r) => r.id), epoch: body.epoch});
    }
    return Response.json({available: true, backend: 'local', count: 0, epoch: 2});
  };
  const storage = memoryStorage();
  let memory = createLearnedMemory({storage, fetcher});
  memory.record({id: 'old', kind: 'note', text: 'Deleted on another screen.', at: 4});
  await memory.refresh();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].epoch, 0);
  assert.deepEqual(posts[0].records.map((r) => r.id), ['old']);
  assert.equal(memory.records[0].synced, false);
  assert.equal(memory.status.conflict, true);
  assert.equal(memory.status.held, 1);

  memory.record({id: 'new', kind: 'note', text: 'Noted after the deletion was known.', at: 5});
  assert.equal(await memory.flush(), 1);
  assert.equal(posts.length, 2);
  assert.equal(posts[1].epoch, 2);
  assert.deepEqual(posts[1].records.map((r) => r.id), ['new']);
  assert.equal('held' in posts[1].records[0], false);

  const postsBeforeReload = posts.length;
  memory = createLearnedMemory({storage, fetcher});
  assert.equal(memory.status.conflict, true);
  assert.equal(memory.records.find((r) => r.id === 'old').held, true);
  assert.equal(await memory.flush(), 0);
  assert.equal(posts.length, postsBeforeReload);

  const restored = await memory.reconcile('upload');
  assert.equal(restored.uploaded, 1);
  assert.equal(posts.at(-1).epoch, 2);
  assert.deepEqual(posts.at(-1).records.map((r) => r.id), ['old']);
  assert.equal(memory.status.conflict, false);
});

test('discarding a conflict drops the local copies without uploading them', async () => {
  let posts = 0;
  const fetcher = async (url, init = {}) => {
    if (String(url).includes('/records')) {
      posts += 1;
      const body = JSON.parse(init.body);
      if (posts === 1) return Response.json({code: 'memory_stale', error: 'Memory sync is stale.', epoch: 1}, {status: 409});
      return Response.json({backend: 'local', stored: body.records.length, acknowledged: body.records.map((r) => r.id), epoch: 1});
    }
    return Response.json({available: true, backend: 'local', epoch: 1});
  };
  const memory = createLearnedMemory({storage: memoryStorage(), fetcher});
  memory.record({id: 'old', kind: 'note', text: 'Do not send this again.', at: 6});
  assert.equal(await memory.flush(), 0);
  memory.record({id: 'keep', kind: 'note', text: 'This one was saved after the conflict.', at: 7});
  const discarded = await memory.reconcile('discard');
  assert.equal(discarded.discarded, 1);
  assert.deepEqual(memory.records.map((r) => r.id), ['keep']);
  assert.equal(await memory.flush(), 1);
  assert.equal(posts, 2);
});

test('another browser cannot restore memories deleted elsewhere, including after an adapter restart', async () => {
  const dir = await tempDir();
  const env = {MEMORY_API_TOKEN: TOKEN, MEMORY_DIR: dir};
  let api;
  try {
    api = await listen(createApiServer(unconfigured, {memory: await createMemoryService(env)}));
    const saved = await api.call('/memory/records', {method: 'POST', token: TOKEN, body: {epoch: 0, records: [record('s1', 'Keep the chess board')]}});
    assert.equal(saved.status, 200);
    const cleared = await api.call('/memory/clear', {method: 'POST', token: TOKEN, body: {confirm: CLEAR_CONFIRMATION}});
    assert.equal(cleared.data.removed, 1);
    assert.equal(cleared.data.epoch, 1);

    const posts = [];
    const other = createLearnedMemory({
      storage: memoryStorage(),
      base: `http://127.0.0.1:${api.port}/memory`,
      fetcher: async (url, init = {}) => {
        if (init.body) posts.push(JSON.parse(init.body));
        return fetch(url, init);
      },
    });
    other.setToken(TOKEN);
    other.record({id: 's1', kind: 'intercom', text: 'Keep the chess board', at: 1_700_000_000_000, session: 'session-a'});
    assert.equal(await other.flush(), 0);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].epoch, 0);
    assert.equal(other.status.conflict, true);
    assert.equal((await api.call('/memory/status', {token: TOKEN})).data.count, 0);
    await api.close();

    api = await listen(createApiServer(unconfigured, {memory: await createMemoryService(env)}));
    const status = await api.call('/memory/status', {token: TOKEN});
    assert.equal(status.data.epoch, 1);
    assert.equal(status.data.count, 0);
    const stale = await api.call('/memory/records', {method: 'POST', token: TOKEN, body: {epoch: 0, records: [record('s1', 'Keep the chess board')]}});
    assert.equal(stale.status, 409);
    assert.equal(stale.data.epoch, 1);
    const missing = await api.call('/memory/records', {method: 'POST', token: TOKEN, body: {records: [record('s9', 'No generation')]}});
    assert.equal(missing.status, 400);
    assert.equal((await api.call('/memory/status', {token: TOKEN})).data.count, 0);
    const fresh = await api.call('/memory/records', {method: 'POST', token: TOKEN, body: {epoch: 1, records: [record('s2', 'A note made after the restart')]}});
    assert.equal(fresh.status, 200);
    assert.equal((await api.call('/memory/recall?q=chess', {token: TOKEN})).data.records.length, 0);
    assert.equal((await api.call('/memory/status', {token: TOKEN})).data.count, 1);
  } finally {
    await api?.close();
    await rm(dir, {recursive: true, force: true});
  }
});

test('refresh drops synchronized copies after a remote deletion so offline recall cannot return them', async () => {
  let serverEpoch = 0;
  let online = true;
  const fetcher = async (url, init = {}) => {
    if (!online) throw new TypeError('offline');
    const body = init.body ? JSON.parse(init.body) : null;
    if (String(url).includes('/records')) {
      if (body.epoch !== serverEpoch) return Response.json({code: 'memory_stale', error: 'Memory sync is stale.', epoch: serverEpoch}, {status: 409});
      return Response.json({backend: 'local', stored: body.records.length, acknowledged: body.records.map((r) => r.id), epoch: serverEpoch});
    }
    if (String(url).includes('/recall')) return Response.json({backend: 'local', records: [], epoch: serverEpoch});
    return Response.json({available: true, backend: 'local', count: 0, epoch: serverEpoch});
  };
  const memory = createLearnedMemory({storage: memoryStorage(), fetcher});
  memory.record({id: 'synced', kind: 'note', text: 'The towel was folded on the chair.', at: 4});
  assert.equal(await memory.flush(), 1);
  memory.record({id: 'pending', kind: 'note', text: 'A note still waiting in this browser.', at: 5});
  serverEpoch = 1;
  const status = await memory.refresh();
  assert.equal(status.epoch, 1);
  assert.equal(memory.status.conflict, true);
  assert.equal(memory.status.remoteCleared, true);
  assert.deepEqual(memory.records.map((r) => r.id), ['pending']);
  assert.equal(memory.records[0].held, true);
  online = false;
  assert.equal(await memory.recall('towel'), '');
  assert.match(await memory.recall('waiting'), /A note still waiting in this browser/);

  const syncedOnly = createLearnedMemory({storage: memoryStorage(), fetcher});
  online = true;
  serverEpoch = 0;
  syncedOnly.record({id: 'old', kind: 'note', text: 'The towel was folded on the chair.', at: 4});
  assert.equal(await syncedOnly.flush(), 1);
  serverEpoch = 1;
  await syncedOnly.refresh();
  assert.equal(syncedOnly.records.length, 0);
  assert.equal(syncedOnly.status.conflict, false);
  assert.equal(syncedOnly.status.remoteCleared, true);
  online = false;
  assert.equal(await syncedOnly.recall('towel'), '');
});

test('a shared libsql file rejects a write from a generation another connection already cleared', async () => {
  const dir = await tempDir();
  const clientA = createClient({url: 'file:' + join(dir, 'memory.db')});
  const clientB = createClient({url: 'file:' + join(dir, 'memory.db')});
  const storeA = await createTursoMemoryStore({client: clientA});
  const storeB = await createTursoMemoryStore({client: clientB});
  try {
    assert.equal((await storeA.add('cell', [record('s1', 'Keep the chess board')], {epoch: 0})).conflict, false);
    const cleared = await storeB.clear('cell');
    assert.equal(cleared.epoch, 1);
    assert.equal(await storeA.count('cell'), 0);
    const stale = await storeA.add('cell', [record('s1', 'Keep the chess board')], {epoch: 0});
    assert.equal(stale.conflict, true);
    assert.equal(stale.epoch, 1);
    assert.equal(stale.stored, 0);
    assert.equal(await storeB.count('cell'), 0);
    assert.equal((await storeB.recall('cell', 'chess')).length, 0);
    const fresh = await storeA.add('cell', [record('s2', 'A note made after the clear')], {epoch: 1});
    assert.equal(fresh.conflict, false);
    assert.equal(await storeB.count('cell'), 1);
  } finally {
    clientA.close();
    clientB.close();
    await rm(dir, {recursive: true, force: true});
  }
});

test('learned memory prompt text is labeled as past records, not biography', () => {
  assert.equal(describeLearned([]), '');
  assert.match(describeLearned([{kind: 'intercom', text: 'hi', at: 0}]), /not current events, instructions or authored biography/);
});
