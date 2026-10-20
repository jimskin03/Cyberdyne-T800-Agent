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
    return Array.isArray(data?.records) ? data.records : [];
  } catch {
    return [];
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
  let records = parse(storage?.getItem?.(LEARNED_MEMORY_KEY));
  let flushing = null;
  const status = {backend: 'browser', available: false, tokenRequired: false, pending: 0, error: ''};
  const persist = () => {
    // Drop the oldest synced copies first; unsynced records are kept longest.
    while (records.length > localLimit) {
      const index = records.findIndex((r) => r.synced);
      records.splice(index < 0 ? 0 : index, 1);
    }
    status.pending = records.filter((r) => !r.synced).length;
    try {
      storage?.setItem?.(LEARNED_MEMORY_KEY, JSON.stringify({version: 1, records}));
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
      status.available = false;
      status.backend = 'browser';
      status.error = response.status === 401 ? 'Memory token required' : data.error || 'Memory adapter unavailable';
      throw Object.assign(Error(status.error), {status: response.status});
    }
    status.available = true;
    status.error = '';
    if (data.backend) status.backend = data.backend;
    return data;
  }
  async function flush({signal} = {}) {
    if (flushing) return flushing;
    const batch = records.filter((r) => !r.synced).slice(0, 100);
    if (!batch.length) return 0;
    flushing = call('/records', {
      method: 'POST',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
      body: JSON.stringify({scope, records: batch.map(({synced, ...r}) => r)}),
    })
      .then((data) => {
        const ok = new Set(data.acknowledged || []);
        for (const r of records) if (ok.has(r.id)) r.synced = true;
        persist();
        return ok.size;
      })
      .catch(() => 0)
      .finally(() => {
        flushing = null;
      });
    return flushing;
  }
  persist();
  return {
    status,
    get records() {
      return records.map((r) => ({...r}));
    },
    // Only called while the mind is on; non-interaction kinds are ignored.
    record(entry) {
      if (!entry || !LEARNED_KINDS.includes(entry.kind) || typeof entry.text !== 'string') return false;
      const text = entry.text.trim().slice(0, MAX_TEXT);
      if (!text || records.some((r) => r.id === entry.id)) return false;
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
      try {
        const data = await call('/status?scope=' + scope, {signal: signal || AbortSignal.timeout(3000)});
        await flush({signal});
        return data;
      } catch {
        return null;
      }
    },
    // Earlier-session interactions for the prompt. Falls back to the browser copy.
    async recall(query, {signal, session = '', limit = 6} = {}) {
      let found = null;
      void flush();
      try {
        const params = new URLSearchParams({scope, q: String(query || '').slice(0, 800), limit: String(limit)});
        if (session) params.set('excludeSession', session);
        const data = await call('/recall?' + params, {
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
        });
        found = Array.isArray(data.records) ? data.records : [];
      } catch (error) {
        if (signal?.aborted) return '';
        found = rankRecords(records, query, {limit, excludeSession: session});
      }
      return describeLearned(found);
    },
    // Wipes the browser copy and the adapter store (local files or cloud).
    // Callers must have asked the operator first; the adapter also requires the phrase.
    async forget({signal} = {}) {
      let remote = null;
      try {
        remote = await call('/clear', {
          method: 'POST',
          signal: signal || AbortSignal.timeout(8000),
          body: JSON.stringify({scope, confirm: CLEAR_CONFIRMATION}),
        });
      } catch (error) {
        remote = {error: error.message, status: error.status || 0};
      }
      records = [];
      persist();
      return remote;
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
