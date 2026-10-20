import {mkdir, readFile, writeFile, appendFile, rename, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {cleanScope, rankRecords} from './records.mjs';

// Zero-config backend store: one append-only JSONL file per scope, written by a
// single serialized queue like tools/session-store.mjs. No native dependencies.
export function createLocalMemoryStore(directory, {maxRecords = 20000} = {}) {
  let queue = Promise.resolve();
  const cache = new Map();
  const file = (scope) => join(directory, `learned-${cleanScope(scope)}.jsonl`);
  const run = (task) => {
    const job = queue.then(task);
    queue = job.catch(() => {});
    return job;
  };
  async function load(scope) {
    if (cache.has(scope)) return cache.get(scope);
    const rows = [],
      ids = new Set();
    try {
      for (const line of (await readFile(file(scope), 'utf8')).split('\n')) {
        if (!line) continue;
        try {
          const row = JSON.parse(line);
          if (row?.id && !ids.has(row.id)) {
            ids.add(row.id);
            rows.push(row);
          }
        } catch {}
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const entry = {rows: rows.slice(-maxRecords), ids};
    if (rows.length > maxRecords) {
      entry.ids = new Set(entry.rows.map((r) => r.id));
      await rewrite(scope, entry.rows);
    }
    cache.set(scope, entry);
    return entry;
  }
  async function rewrite(scope, rows) {
    await mkdir(directory, {recursive: true});
    const path = file(scope);
    await writeFile(path + '.next', rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), {mode: 0o600});
    await rename(path + '.next', path);
  }
  return {
    backend: 'local',
    add(scope, records) {
      return run(async () => {
        const entry = await load(scope),
          fresh = records.filter((r) => !entry.ids.has(r.id));
        if (!fresh.length) return {stored: 0, acknowledged: records.map((r) => r.id)};
        const storedAt = Date.now(),
          rows = fresh.map((r) => ({...r, storedAt}));
        await mkdir(directory, {recursive: true});
        await appendFile(file(scope), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', {mode: 0o600});
        for (const row of rows) {
          entry.ids.add(row.id);
          entry.rows.push(row);
        }
        if (entry.rows.length > maxRecords) {
          entry.rows = entry.rows.slice(-maxRecords);
          entry.ids = new Set(entry.rows.map((r) => r.id));
          await rewrite(scope, entry.rows);
        }
        return {stored: rows.length, acknowledged: records.map((r) => r.id)};
      });
    },
    recall(scope, query, options) {
      return run(async () => rankRecords((await load(scope)).rows, query, options));
    },
    count(scope) {
      return run(async () => (await load(scope)).rows.length);
    },
    clear(scope) {
      return run(async () => {
        const removed = (await load(scope)).rows.length;
        await rm(file(scope), {force: true});
        cache.set(scope, {rows: [], ids: new Set()});
        return {removed};
      });
    },
    close() {},
  };
}
