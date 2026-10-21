import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm, utimes, writeFile, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir, hostname} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {acquireDirectoryLock, withDirectoryLock, LOCK_FILE} from '../tools/memory/dir-lock.mjs';
import {createLocalMemoryStore} from '../tools/memory/local-store.mjs';
import {ensureMemoryToken} from '../tools/memory/config.mjs';

const WORKER = fileURLToPath(new URL('./fixtures/memory-lock-worker.mjs', import.meta.url));
const tempDir = () => mkdtemp(join(tmpdir(), 'memory-lock-'));

function startWorker(args) {
  const child = spawn(process.execPath, [WORKER, ...args.map(String)], {stdio: ['ignore', 'pipe', 'pipe']});
  const lines = [];
  let buffer = '',
    errors = '';
  const waiters = [];
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = JSON.parse(buffer.slice(0, at));
      buffer = buffer.slice(at + 1);
      lines.push(line);
      for (const w of [...waiters]) if (w.match(line)) waiters.splice(waiters.indexOf(w), 1), w.resolve(line);
    }
  });
  child.stderr.on('data', (chunk) => (errors += chunk));
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({code, signal})));
  return {
    child,
    lines,
    exited,
    errors: () => errors,
    waitFor: (match) => {
      const found = lines.find(match);
      return found ? Promise.resolve(found) : new Promise((resolve) => waiters.push({match, resolve}));
    },
  };
}

async function runHammer(dir, workers) {
  const running = workers.map((args) => startWorker(['hammer', dir, ...args]));
  await Promise.all(running.map((w) => w.waitFor((l) => l.ready)));
  await writeFile(join(dir, 'go'), '');
  const results = await Promise.all(running.map((w) => w.exited));
  for (const [i, result] of results.entries()) assert.equal(result.code, 0, `worker ${i} failed: ${running[i].errors()}`);
  return running.flatMap((w) => w.lines.filter((l) => l.op));
}

async function onDisk(dir) {
  try {
    return (await readFile(join(dir, 'learned-cell.jsonl'), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).id);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

test('adapters in separate processes never restore cleared memories or lose accepted writes', {timeout: 30000}, async () => {
  const dir = await tempDir();
  try {
    // Three processes: each appends with the generation it just read; one also clears.
    const ops = await runHammer(dir, [
      ['a', 120, 0, 20000, 1],
      ['b', 120, 0, 20000, 1],
      ['c', 120, 10, 20000, 1],
    ]);
    const clears = ops.filter((o) => o.op === 'clear');
    const accepted = ops.filter((o) => o.op === 'add' && !o.conflict);
    assert.equal(clears.length, 12);
    assert.deepEqual(clears.map((c) => c.epoch).sort((x, y) => x - y), Array.from({length: 12}, (_, i) => i + 1));
    const finalEpoch = 12;
    assert.equal(JSON.parse(await readFile(join(dir, 'epochs.json'), 'utf8')).cell, finalEpoch);
    for (const add of accepted) assert.equal(add.stored, 1);
    const disk = await onDisk(dir);
    assert.equal(new Set(disk).size, disk.length, 'no duplicate rows');
    const byId = new Map(accepted.map((a) => [a.id, a]));
    // Nothing on disk comes from an older generation or from a rejected sync.
    for (const id of disk) assert.equal(byId.get(id)?.epoch, finalEpoch, `${id} came back after a clear`);
    // Every write accepted in the final generation is still there.
    const survivors = accepted.filter((a) => a.epoch === finalEpoch).map((a) => a.id);
    assert.deepEqual([...disk].sort(), survivors.sort());
    // Every accepted write was either removed by exactly one clear or is still on disk.
    const removed = clears.reduce((sum, c) => sum + c.removed, 0);
    assert.equal(removed + disk.length, accepted.length);
    // A fresh adapter sees the same state.
    const store = createLocalMemoryStore(dir);
    assert.equal(await store.count('cell'), disk.length);
    assert.equal(await store.epoch('cell'), finalEpoch);
    assert.equal(existsSync(join(dir, LOCK_FILE)), false);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('trimming in one process never drops records appended by another', {timeout: 30000}, async () => {
  const dir = await tempDir();
  try {
    const ops = await runHammer(dir, [
      ['a', 80, 0, 40, 0],
      ['b', 80, 0, 40, 0],
      ['c', 80, 0, 40, 0],
    ]);
    assert.equal(ops.filter((o) => o.stored === 1).length, 240);
    const disk = await onDisk(dir);
    // The file keeps exactly the newest 40 rows across all writers.
    assert.equal(disk.length, 40);
    assert.equal(new Set(disk).size, 40);
    // Appends are totally ordered by the lock, so each writer's surviving records are
    // its most recent ones, with no gap left by another process's stale rewrite.
    for (const name of ['a', 'b', 'c']) {
      const kept = disk.filter((id) => id.startsWith(name + '-')).map((id) => Number(id.split('-')[1]));
      const expected = Array.from({length: kept.length}, (_, i) => 80 - kept.length + i);
      assert.deepEqual(kept, expected, `writer ${name} lost a record`);
    }
    const leftovers = (await readdir(dir)).filter((f) => f.endsWith('.next') || f.endsWith('.tmp') || f.includes('.lock'));
    assert.deepEqual(leftovers, []);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('a waiting adapter gets the lock once the holder releases it', {timeout: 10000}, async () => {
  const dir = await tempDir();
  try {
    const holder = startWorker(['hold', dir, 'h', 300]);
    await holder.waitFor((l) => l.locked);
    const started = Date.now();
    await withDirectoryLock(dir, async () => {
      assert.ok(holder.lines.some((l) => l.releasing), 'lock was granted while still held');
    });
    assert.ok(Date.now() - started >= 100);
    assert.equal((await holder.exited).code, 0);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('stale locks are recovered: a dead owner on this host, or an old lock from another host', {timeout: 10000}, async () => {
  const dir = await tempDir();
  try {
    const path = join(dir, LOCK_FILE);
    // A holder killed with SIGKILL cannot clean up; its pid is gone, so the lock is free at once.
    const crashed = startWorker(['crash', dir, 'k']);
    await crashed.waitFor((l) => l.locked);
    assert.equal((await crashed.exited).signal, 'SIGKILL');
    assert.equal(existsSync(path), true);
    let started = Date.now();
    const store = createLocalMemoryStore(dir, {lock: {staleMs: 60000, timeoutMs: 3000}});
    await store.add('cell', [{id: 'after-crash', kind: 'intercom', text: 'x', at: 1, session: 's'}]);
    assert.ok(Date.now() - started < 2000);
    assert.equal(existsSync(path), false);

    // A live-looking lock from another host is respected until it stops being refreshed.
    const foreign = JSON.stringify({pid: 1, hostname: hostname() + '-elsewhere', token: 'f'.repeat(32), createdAt: Date.now()});
    await writeFile(path, foreign);
    await assert.rejects(acquireDirectoryLock(dir, {staleMs: 5000, timeoutMs: 150}), {code: 'ELOCKED'});
    const old = new Date(Date.now() - 60000);
    await utimes(path, old, old);
    started = Date.now();
    const release = await acquireDirectoryLock(dir, {staleMs: 5000, timeoutMs: 2000});
    assert.ok(Date.now() - started < 1000);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).pid, process.pid);
    await release();
    assert.equal(existsSync(path), false);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('the lock is released when the task throws and when the process exits', {timeout: 10000}, async () => {
  const dir = await tempDir();
  try {
    const path = join(dir, LOCK_FILE);
    await assert.rejects(
      withDirectoryLock(dir, async () => {
        assert.equal(existsSync(path), true);
        throw Error('boom');
      }),
      /boom/,
    );
    assert.equal(existsSync(path), false);
    const exiting = startWorker(['exit', dir, 'e']);
    await exiting.waitFor((l) => l.locked);
    assert.equal((await exiting.exited).code, 0);
    assert.equal(existsSync(path), false);
    // Release only removes the lock it owns.
    const release = await acquireDirectoryLock(dir);
    const replaced = JSON.stringify({pid: process.pid, hostname: hostname(), token: 'other', createdAt: Date.now()});
    await writeFile(path, replaced);
    await release();
    assert.equal(await readFile(path, 'utf8'), replaced);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

test('adapters starting together on one MEMORY_DIR agree on the generated token', async () => {
  const dir = await tempDir();
  try {
    const results = await Promise.all(Array.from({length: 6}, () => ensureMemoryToken({token: '', directory: dir})));
    assert.equal(new Set(results.map((r) => r.token)).size, 1);
    assert.equal(results.filter((r) => r.source === 'generated').length, 1);
    assert.equal((await readFile(join(dir, 'api-token'), 'utf8')).trim(), results[0].token);
    assert.deepEqual((await readdir(dir)).filter((f) => f.endsWith('.tmp')), []);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});
