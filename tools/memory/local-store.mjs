import {mkdir, readFile, rm, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {cleanScope, rankRecords} from './records.mjs';
import {appendFileDurable, syncDirectory, withDirectoryLock, writeFileAtomic} from './dir-lock.mjs';

// Zero-config backend store: one append-only JSONL file per scope plus the
// deletion generations in epochs.json. No native dependencies.
//
// Several adapters (separate processes) may share one directory. Every operation
// runs inside a cross-process directory lock (dir-lock.mjs) and reads the current
// generation and records from disk under that lock before it changes anything, so
// a clear made by another adapter is seen before an append, and a rewrite never
// drops records another adapter appended. Inside one process a queue serializes
// operations as before, so the lock is taken by one operation at a time.
export function createLocalMemoryStore(directory, {maxRecords = 20000, lock: lockOptions = {}} = {}) {
  let queue = Promise.resolve();
  // Parsed records per scope, reused only while the file on disk is unchanged
  // (same inode, size and modification time).
  const cache = new Map();
  const file = (scope) => join(directory, `learned-${cleanScope(scope)}.jsonl`);
  const epochsFile = join(directory, 'epochs.json');
  const run = (task) => {
    const job = queue.then(() => withDirectoryLock(directory, task, lockOptions));
    queue = job.catch(() => {});
    return job;
  };
  async function signature(path) {
    try {
      const info = await stat(path, {bigint: true});
      return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
    } catch (error) {
      if (error.code === 'ENOENT') return 'missing';
      throw error;
    }
  }
  // Must run while the lock is held.
  async function load(scope) {
    const path = file(scope),
      sig = await signature(path),
      cached = cache.get(scope);
    if (cached && cached.sig === sig) return cached;
    const rows = [],
      ids = new Set();
    if (sig !== 'missing') {
      let text = '';
      try {
        text = await readFile(path, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          const row = JSON.parse(line);
          if (row?.id && !ids.has(row.id)) {
            ids.add(row.id);
            rows.push(row);
          }
        } catch {}
      }
    }
    let entry = {rows: rows.slice(-maxRecords), ids, sig};
    if (rows.length > maxRecords) {
      entry = {rows: entry.rows, ids: new Set(entry.rows.map((r) => r.id))};
      await rewrite(scope, entry.rows);
      entry.sig = await signature(path);
    }
    cache.set(scope, entry);
    return entry;
  }
  async function rewrite(scope, rows) {
    await mkdir(directory, {recursive: true, mode: 0o700});
    await writeFileAtomic(file(scope), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
  }
  // Generations are always re-read under the lock: another adapter may have cleared.
  async function loadEpochs() {
    let parsed = {};
    try {
      parsed = JSON.parse(await readFile(epochsFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const epochs = Object.create(null);
    if (parsed && typeof parsed === 'object') {
      for (const [key, value] of Object.entries(parsed)) {
        if (Number.isInteger(value) && value >= 0) epochs[key] = value;
      }
    }
    return epochs;
  }
  async function saveEpochs(map) {
    await mkdir(directory, {recursive: true, mode: 0o700});
    await writeFileAtomic(epochsFile, JSON.stringify(map) + '\n');
  }
  return {
    backend: 'local',
    epoch(scope) {
      return run(async () => {
        const map = await loadEpochs();
        const value = map[cleanScope(scope)];
        return Number.isInteger(value) ? value : 0;
      });
    },
    add(scope, records, {epoch} = {}) {
      return run(async () => {
        scope = cleanScope(scope);
        const map = await loadEpochs();
        const current = Number.isInteger(map[scope]) ? map[scope] : 0;
        // The caller's generation is checked under the same lock as the append, so a
        // clear that already ran (in any adapter sharing this directory) cannot be
        // followed by those records.
        if (Number.isInteger(epoch) && epoch !== current) {
          return {conflict: true, epoch: current, stored: 0, acknowledged: []};
        }
        const entry = await load(scope),
          fresh = records.filter((r) => !entry.ids.has(r.id));
        if (!fresh.length) return {conflict: false, epoch: current, stored: 0, acknowledged: records.map((r) => r.id)};
        const storedAt = Date.now(),
          rows = fresh.map((r) => ({...r, storedAt}));
        await mkdir(directory, {recursive: true, mode: 0o700});
        await appendFileDurable(file(scope), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
        for (const row of rows) {
          entry.ids.add(row.id);
          entry.rows.push(row);
        }
        if (entry.rows.length > maxRecords) {
          entry.rows = entry.rows.slice(-maxRecords);
          entry.ids = new Set(entry.rows.map((r) => r.id));
          await rewrite(scope, entry.rows);
        }
        entry.sig = await signature(file(scope));
        return {conflict: false, epoch: current, stored: rows.length, acknowledged: records.map((r) => r.id)};
      });
    },
    recall(scope, query, options) {
      return run(async () => rankRecords((await load(cleanScope(scope))).rows, query, options));
    },
    count(scope) {
      return run(async () => (await load(cleanScope(scope))).rows.length);
    },
    clear(scope) {
      return run(async () => {
        scope = cleanScope(scope);
        const removed = (await load(scope)).rows.length;
        // Advance the generation before deleting records. A crash in between
        // keeps the new generation, so a restarted adapter still rejects a stale re-upload.
        const map = await loadEpochs();
        const next = (Number.isInteger(map[scope]) ? map[scope] : 0) + 1;
        map[scope] = next;
        await saveEpochs(map);
        await rm(file(scope), {force: true});
        await syncDirectory(directory);
        cache.delete(scope);
        return {removed, epoch: next};
      });
    },
    close() {},
  };
}
