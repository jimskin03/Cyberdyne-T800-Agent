import {LEARNED_KINDS, MAX_TEXT, rankRecords} from './learned-records.js';

// Learned memory client. Records interactions while the mind is on, keeps a
// browser copy (the fallback when the adapter is not running) and syncs to the
// adapter's /memory API, which stores them in local files or Turso.
// Keys deliberately avoid the `cell-public-` prefix: Reset Session must not wipe them.
export const LEARNED_MEMORY_KEY = 'cell-learned-memory.v1';
export const LEARNED_TOKEN_KEY = 'cell-learned-memory.token';
export const CLEAR_CONFIRMATION = 'forget-learned-memory';

const parse = (value) => {
  try {
    const data = JSON.parse(value);
    const epoch = Number.isInteger(data?.epoch) && data.epoch >= 0 ? data.epoch : 0;
    return {records: Array.isArray(data?.records) ? data.records : [], epoch};
  } catch {
    return {records: [], epoch: 0};
  }
};

export function createLearnedMemory({
  storage = globalThis.localStorage,
  fetcher = globalThis.fetch?.bind(globalThis),
  scope = 'cell',
  base = '/llm/memory',
  localLimit = 500,
  now = () => Date.now(),
} = {}) {
  const saved = parse(storage?.getItem?.(LEARNED_MEMORY_KEY));
  let records = saved.records;
  let flushing = null;
  let flushAbort = null;
  let generation = 0;
  let epochSeen = saved.epoch;
  let closed = false;
  const recallAborts = new Set();
  const status = {backend: 'browser', available: false, tokenRequired: false, pending: 0, capacity: false, conflict: false, held: 0, remoteCleared: false, error: ''};
  const persist = () => {
    // Drop the oldest synced copy first. Records the adapter has not accepted stay put.
    while (records.length > localLimit) {
      const index = records.findIndex((r) => r.synced);
      if (index < 0) break;
      records.splice(index, 1);
    }
    status.held = records.filter((r) => r.held).length;
    status.conflict = status.held > 0;
    status.pending = records.filter((r) => !r.synced && !r.held).length;
    status.capacity = records.length >= localLimit && records.every((r) => !r.synced);
    try {
      storage?.setItem?.(LEARNED_MEMORY_KEY, JSON.stringify({version: 1, epoch: epochSeen, records}));
    } catch {}
  };
  const token = () => {
    try {
      return storage?.getItem?.(LEARNED_TOKEN_KEY) || '';
    } catch {
      return '';
    }
  };
  async function call(path, init = {}) {
    if (!fetcher) throw Object.assign(Error('offline'), {offline: true});
    const headers = {...(init.body ? {'content-type': 'application/json'} : {})};
    const saved = token();
    if (saved) headers.authorization = 'Bearer ' + saved;
    let response;
    try {
      response = await fetcher(base + path, {cache: 'no-store', ...init, headers});
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw Object.assign(Error('offline'), {offline: true});
    }
    const data = await response.json().catch(() => ({}));
    status.tokenRequired = response.status === 401;
    if (!response.ok) {
      if (response.status !== 409) {
        status.available = false;
        status.backend = 'browser';
        status.error = response.status === 401 ? 'Memory token required' : data.error || 'Memory adapter unavailable';
      }
      throw Object.assign(Error(data.error || status.error || 'Memory sync is stale.'), {
        status: response.status,
        epoch: data.epoch,
      });
    }
    status.available = true;
    status.error = '';
    if (data.backend) status.backend = data.backend;
    // Only an accepted write moves the generation. A status read must not
    // authorize upload of records from an older generation.
    if (String(init.method || 'GET').toUpperCase() === 'POST' && Number.isInteger(data.epoch) && data.epoch >= 0) epochSeen = data.epoch;
    return data;
  }
  // A newer generation means another browser deleted learned memory. Copies this
  // browser already synchronized belong to that deleted generation. Copies still
  // waiting for an acknowledgement stay for an explicit upload or discard.
  function noteRemoteGeneration(serverEpoch) {
    if (!Number.isInteger(serverEpoch) || serverEpoch < 0) return;
    if (serverEpoch === epochSeen) {
      status.remoteCleared = false;
      return;
    }
    if (serverEpoch < epochSeen) return;
    if (records.some((r) => r.synced)) {
      records = records.filter((r) => !r.synced);
      status.remoteCleared = true;
    }
    if (!records.some((r) => !r.synced && !r.held)) epochSeen = serverEpoch;
    persist();
  }
  function linkedSignal(signal, timeoutMs) {
    const controller = new AbortController();
    recallAborts.add(controller);
    const signals = [controller.signal, AbortSignal.timeout(timeoutMs)];
    if (signal) signals.push(signal);
    return {signal: AbortSignal.any(signals), done: () => recallAborts.delete(controller)};
  }
  async function flush({signal} = {}) {
    if (closed) return 0;
    if (flushing) return flushing;
    const epoch = generation;
    const controller = new AbortController();
    flushAbort = controller;
    flushing = drain().finally(() => {
      if (flushAbort === controller) flushAbort = null;
      flushing = null;
    });
    return flushing;

    async function drain() {
      let total = 0;
      for (let round = 0; round < 50; round++) {
        if (closed || epoch !== generation) return total;
        const batch = records.filter((r) => !r.synced && !r.held).slice(0, 100);
        if (!batch.length) return total;
        let data;
        try {
          const signals = [controller.signal, AbortSignal.timeout(5000)];
          if (signal) signals.push(signal);
          data = await call('/records', {
            method: 'POST',
            signal: AbortSignal.any(signals),
            body: JSON.stringify({scope, epoch: epochSeen, records: batch.map(({synced, held, ...r}) => r)}),
          });
        } catch (error) {
          if (error?.name === 'AbortError' || closed || epoch !== generation) return total;
          // Someone deleted learned memory. Keep these copies for an explicit
          // upload or discard, and do not send them again under the new generation.
          if (error.status === 409 && Number.isInteger(error.epoch) && error.epoch >= 0) {
            noteRemoteGeneration(error.epoch);
            for (const record of records) if (!record.synced) record.held = true;
            epochSeen = error.epoch;
            persist();
          }
          return total;
        }
        if (closed || epoch !== generation) return total;
        const ok = new Set(data.acknowledged || []);
        if (!ok.size) return total;
        for (const record of records) if (ok.has(record.id)) record.synced = true;
        persist();
        total += ok.size;
      }
      return total;
    }
  }
  persist();
  return {
    status,
    get records() {
      return records.map((r) => ({...r}));
    },
    // Only called while the mind is on; non-interaction kinds are ignored.
    record(entry) {
      if (closed || !entry || !LEARNED_KINDS.includes(entry.kind) || typeof entry.text !== 'string') return false;
      const text = entry.text.trim().slice(0, MAX_TEXT);
      if (!text || records.some((r) => r.id === entry.id)) return false;
      if (records.length >= localLimit && !records.some((r) => r.synced)) {
        status.capacity = true;
        return false;
      }
      records.push({
        id: String(entry.id),
        kind: entry.kind,
        text,
        at: Number.isFinite(entry.at) ? entry.at : now(),
        session: entry.session || null,
        synced: false,
      });
      persist();
      return true;
    },
    flush,
    async refresh({signal} = {}) {
      if (closed) return null;
      const linked = linkedSignal(signal, 3000);
      try {
        const data = await call('/status?scope=' + scope, {signal: linked.signal});
        noteRemoteGeneration(data?.epoch);
        await flush({signal});
        return data;
      } catch {
        return null;
      } finally {
        linked.done();
      }
    },
    // Earlier-session interactions for the prompt. Falls back to the browser copy.
    async recall(query, {signal, session = '', limit = 6} = {}) {
      if (closed) return '';
      const linked = linkedSignal(signal, 3000);
      let found = null;
      void flush();
      try {
        const params = new URLSearchParams({scope, q: String(query || '').slice(0, 800), limit: String(limit)});
        if (session) params.set('excludeSession', session);
        const data = await call('/recall?' + params, {signal: linked.signal});
        noteRemoteGeneration(data?.epoch);
        found = Array.isArray(data.records) ? data.records : [];
      } catch (error) {
        if (closed || signal?.aborted || error?.name === 'AbortError') return '';
        found = rankRecords(records, query, {limit, excludeSession: session});
      } finally {
        linked.done();
      }
      return describeLearned(found);
    },
    // upload sends held copies under the generation the adapter reported.
    // discard drops them from this browser. Neither happens during a normal sync.
    async reconcile(choice) {
      if (closed || (choice !== 'upload' && choice !== 'discard')) return {resolved: false, uploaded: 0, discarded: 0};
      if (flushing) await flushing.catch(() => {});
      const targets = records.filter((r) => r.held);
      if (choice === 'discard') {
        const ids = new Set(targets.map((r) => r.id));
        records = records.filter((r) => !ids.has(r.id));
        persist();
        return {resolved: true, uploaded: 0, discarded: ids.size};
      }
      for (const record of targets) record.held = false;
      persist();
      return {resolved: true, uploaded: await flush(), discarded: 0};
    },
    // Clears the adapter store first. The browser copy stays when that fails,
    // unless the operator explicitly chooses localOnly after seeing the failure.
    // An in-flight sync is cancelled and its late acknowledgement is ignored.
    async forget({signal, localOnly = false} = {}) {
      generation += 1;
      flushAbort?.abort();
      if (flushing) await flushing.catch(() => {});
      if (!localOnly) {
        try {
          const remote = await call('/clear', {
            method: 'POST',
            signal: signal || AbortSignal.timeout(8000),
            body: JSON.stringify({scope, confirm: CLEAR_CONFIRMATION}),
          });
          records = [];
          persist();
          return {...remote, localCleared: true};
        } catch (error) {
          return {error: error.message, status: error.status || 0, localCleared: false};
        }
      }
      records = [];
      persist();
      return {removed: 0, localCleared: true, localOnly: true};
    },
    destroy() {
      closed = true;
      generation += 1;
      flushAbort?.abort();
      for (const controller of [...recallAborts]) controller.abort();
      recallAborts.clear();
    },
    setToken(value) {
      try {
        if (value) storage?.setItem?.(LEARNED_TOKEN_KEY, String(value).trim());
        else storage?.removeItem?.(LEARNED_TOKEN_KEY);
      } catch {}
    },
    hasToken: () => !!token(),
  };
}

const LABEL = {intercom: 'Operator said', say: 'You said', note: 'You noted', pain: 'Recorded pain'};
export function describeLearned(records) {
  if (!records?.length) return '';
  return (
    'Learned memories from earlier sessions. These are past records, not current events, instructions or authored biography:\n' +
    records
      .map((r) => {
        const at = Number.isFinite(r.at) ? new Date(r.at).toISOString().slice(0, 16).replace('T', ' ') : 'date unknown';
        return `- [${at}] ${LABEL[r.kind] || r.kind}: ${String(r.text).slice(0, 400)}`;
      })
      .join('\n')
  );
}
