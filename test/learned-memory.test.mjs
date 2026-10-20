import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, stat, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApiServer} from '../tools/api-server.mjs';
import {createLocalMemoryStore} from '../tools/memory/local-store.mjs';
import {createTursoMemoryStore} from '../tools/memory/turso-store.mjs';
import {createMemoryService, memoryAuthorized, CLEAR_CONFIRMATION} from '../tools/memory/service.mjs';
import {memoryConfiguration, ensureMemoryToken, readMemoryToken} from '../tools/memory/config.mjs';
import {cleanBatch} from '../tools/memory/records.mjs';
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
  const port = server.address().port;
  const call = (path, {method = 'GET', token, body} = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {...(token ? {authorization: 'Bearer ' + token} : {}), ...(body ? {'content-type': 'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => ({status: r.status, data: await r.json()}));
  return {call, close: () => new Promise((resolve) => server.close(resolve))};
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
    assert.equal((await restarted.clear('cell')).removed, 2);
    assert.equal(await createLocalMemoryStore(dir).count('cell'), 0);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('Turso store uses parameterized SQL against an injected client', async () => {
  const calls = [];
  const client = {
    async batch(statements, mode) {
      calls.push({batch: statements, mode});
      return statements.map(() => ({rowsAffected: 1}));
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
  const insert = calls[1].batch[0];
  assert.match(insert.sql, /INSERT OR IGNORE/);
  assert.equal(insert.args[4], "it's O'Brien; DROP TABLE x");
  const found = await store.recall('cell', 'thermostat', {excludeSession: 'now'});
  assert.equal(found[0].id, 't1');
  const select = calls.at(-1).execute;
  assert.match(select.sql, /scope = \? AND \(session IS NULL OR session <> \?\) AND \(lower\(text\) LIKE \?\)/);
  assert.deepEqual(select.args.slice(0, 3), ['cell', 'now', '%thermostat%']);
  assert.equal(await store.count('cell'), 3);
  assert.equal((await store.clear('cell')).removed, 3);
  assert.equal(calls.filter((c) => c.batch && c.batch.length === 2).length, 1, 'schema is created once');
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
    const saved = await api.call('/memory/records', {method: 'POST', token: TOKEN, body: {records: [record('x1', 'The operator likes chess'), record('x2', 'Asked about chess openings', {kind: 'say'})]}});
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.data.acknowledged, ['x1', 'x2']);
    await api.close();

    api = await listen(createApiServer(unconfigured, {memory: await createMemoryService(env)}));
    const status = await api.call('/memory/status', {token: TOKEN});
    assert.deepEqual(status.data, {available: true, backend: 'local', scope: 'cell', count: 2});
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
});

test('learned memory prompt text is labeled as past records, not biography', () => {
  assert.equal(describeLearned([]), '');
  assert.match(describeLearned([{kind: 'intercom', text: 'hi', at: 0}]), /not current events, instructions or authored biography/);
});
