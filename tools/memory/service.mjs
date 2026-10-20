import {createHash, timingSafeEqual} from 'node:crypto';
import {readJson, sendJson} from '../local-http.mjs';
import {cleanBatch, cleanScope} from './records.mjs';
import {createLocalMemoryStore} from './local-store.mjs';
import {createTursoMemoryStore} from './turso-store.mjs';
import {ensureMemoryToken, memoryConfiguration} from './config.mjs';

export const CLEAR_CONFIRMATION = 'forget-learned-memory';
const digest = (value) => createHash('sha256').update(String(value)).digest();

function bindMemory(memory) {
  if (memory.mutate) return memory;
  let mutations = Promise.resolve();
  // Adds and clears share one queue so a sync that started before a forget cannot land after it.
  memory.mutate = (task) => {
    const run = mutations.then(task, task);
    mutations = run.then(
      () => {},
      () => {},
    );
    return run;
  };
  return memory;
}

export function memoryAuthorized(req, token) {
  if (!token) return false;
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer ([\x21-\x7E]{1,512})$/);
  return !!match && timingSafeEqual(digest(match[1]), digest(token));
}

export async function createMemoryService(env = process.env, {client = null} = {}) {
  const config = memoryConfiguration(env);
  const {token, source} = await ensureMemoryToken(config);
  const store = config.turso
    ? await createTursoMemoryStore({...config.turso, client})
    : createLocalMemoryStore(config.directory);
  return bindMemory({token, tokenSource: source, store, backend: store.backend, directory: config.directory});
}

// Routes under /memory. Every route needs the bearer token, including status.
export async function handleMemoryRequest(req, res, pathname, memory) {
  if (pathname !== '/memory' && !pathname.startsWith('/memory/')) return false;
  const send = (status, value) => sendJson(res, status, value);
  if (!memory?.store) {
    send(503, {code: 'memory_unavailable', error: 'Learned memory is not enabled on this adapter.'});
    return true;
  }
  if (!memoryAuthorized(req, memory.token)) {
    send(401, {code: 'memory_token_required', error: 'Learned memory needs the adapter memory token.'});
    return true;
  }
  bindMemory(memory);
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && pathname === '/memory/status') {
      const scope = cleanScope(url.searchParams.get('scope') || 'cell');
      send(200, {
        available: true,
        backend: memory.store.backend,
        scope,
        count: await memory.store.count(scope),
        epoch: await memory.store.epoch(scope),
      });
    } else if (req.method === 'GET' && pathname === '/memory/recall') {
      const scope = cleanScope(url.searchParams.get('scope') || 'cell');
      const query = String(url.searchParams.get('q') || '').slice(0, 800);
      const limit = Math.max(1, Math.min(20, Number(url.searchParams.get('limit')) || 8));
      const excludeSession = String(url.searchParams.get('excludeSession') || '').slice(0, 80);
      send(200, {backend: memory.store.backend, records: await memory.store.recall(scope, query, {limit, excludeSession})});
    } else if (req.method === 'POST' && pathname === '/memory/records') {
      await memory.mutate(async () => {
        const body = await readJson(req, {limit: 256 * 1024});
        const {scope, records} = cleanBatch(body);
        const epoch = await memory.store.epoch(scope);
        // A missing generation used to be accepted as current, which let a restarted
        // adapter or another browser recreate memories that had been deleted.
        if (!Number.isInteger(body?.epoch) || body.epoch < 0) {
          send(400, {code: 'memory_epoch_required', error: 'Memory sync needs a generation.'});
          return;
        }
        if (body.epoch !== epoch) {
          send(409, {code: 'memory_stale', error: 'Memory sync is stale.', epoch});
          return;
        }
        send(200, {
          backend: memory.store.backend,
          epoch,
          ...(await memory.store.add(scope, records)),
        });
      });
    } else if (req.method === 'POST' && pathname === '/memory/clear') {
      await memory.mutate(async () => {
        const body = await readJson(req, {limit: 4 * 1024});
        if (body?.confirm !== CLEAR_CONFIRMATION) {
          send(400, {code: 'memory_confirmation_required', error: 'Clearing learned memory needs explicit confirmation.'});
          return;
        }
        const scope = cleanScope(body.scope);
        const cleared = await memory.store.clear(scope);
        send(200, {backend: memory.store.backend, ...cleared});
      });
    } else send(404, {error: 'Not found.'});
  } catch (error) {
    // Store errors can mention database hosts; return a fixed message instead.
    if (error.status) send(error.status, {error: String(error.message).slice(0, 180)});
    else send(502, {code: 'memory_store_failed', error: 'Learned memory store is unavailable. Records stay queued in the browser.'});
  }
  return true;
}
