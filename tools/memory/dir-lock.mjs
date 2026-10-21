import {readFileSync, unlinkSync} from 'node:fs';
import {link, mkdir, open, readFile, rename, stat, unlink, utimes, writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {hostname} from 'node:os';
import {dirname, join} from 'node:path';

// Cross-process lock for one directory. Several adapters (separate Node processes)
// may share MEMORY_DIR, so every read-modify-write of the local store runs while
// this lock is held. No dependencies:
// - The lock file is created atomically with its contents: the owner record is
//   written to a private temp file and hard-linked to the lock name, which fails
//   with EEXIST while another owner holds it. Filesystems without hard links fall
//   back to open(path, 'wx').
// - The owner record holds pid, hostname, a random token and the start time. The
//   owner refreshes the file's mtime while it holds the lock.
// - A lock is stale when its owner pid is gone on this host, or when its mtime has
//   not been refreshed for staleMs (any host). Breaking a stale lock goes through a
//   second short-lived "break" lock, and the lock is re-read under it, so two
//   waiters cannot both break it and remove a fresh owner's lock.
// - Waiters retry with capped exponential backoff and jitter until timeoutMs, then
//   fail with code ELOCKED.
// - Release removes the file only if it still holds this owner's token. Locks
//   still held when the process exits are removed synchronously on 'exit'.

export const LOCK_FILE = '.learned-memory.lock';
const HOST = hostname();
const held = new Map();
let exitHookInstalled = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ownerRecord = (token) => JSON.stringify({pid: process.pid, hostname: HOST, token, createdAt: Date.now()}) + '\n';

function installExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.once('exit', () => {
    for (const [path, token] of held) {
      try {
        if (JSON.parse(readFileSync(path, 'utf8')).token === token) unlinkSync(path);
      } catch {}
    }
    held.clear();
  });
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// Creates `path` holding `contents`, or returns false if it already exists.
async function createExclusive(path, contents) {
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temp, contents, {mode: 0o600});
  try {
    await link(temp, path);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EMLINK'].includes(error.code)) throw error;
    // No hard links here: an exclusive create still guarantees a single owner.
    let handle;
    try {
      handle = await open(path, 'wx', 0o600);
    } catch (fallback) {
      if (fallback.code === 'EEXIST') return false;
      throw fallback;
    }
    try {
      await handle.writeFile(contents);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return true;
  } finally {
    await unlink(temp).catch(() => {});
  }
}

async function inspect(path) {
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let owner = null;
  try {
    owner = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
  }
  return {owner, mtimeMs: info.mtimeMs};
}

function isStale(lock, staleMs) {
  if (Date.now() - lock.mtimeMs > staleMs) return true;
  const owner = lock.owner;
  return !!owner && owner.hostname === HOST && !pidAlive(owner.pid);
}

async function breakStale(path, judged, staleMs) {
  const breaker = path + '.break';
  if (!(await createExclusive(breaker, ownerRecord(randomBytes(8).toString('hex'))))) {
    // A breaker that crashed mid-break leaves this file; it only lives for a few
    // filesystem calls, so an old one is safe to remove.
    const info = await stat(breaker).catch(() => null);
    if (info && Date.now() - info.mtimeMs > staleMs) await unlink(breaker).catch(() => {});
    return false;
  }
  try {
    const now = await inspect(path);
    if (!now) return true;
    const same = judged.owner?.token ? now.owner?.token === judged.owner.token : now.mtimeMs === judged.mtimeMs;
    if (!same || !isStale(now, staleMs)) return false;
    await unlink(path).catch(() => {});
    return true;
  } finally {
    await unlink(breaker).catch(() => {});
  }
}

export async function acquireDirectoryLock(directory, {staleMs = 10000, timeoutMs = 20000, retryMs = 5, maxRetryMs = 100} = {}) {
  await mkdir(directory, {recursive: true, mode: 0o700});
  const path = join(directory, LOCK_FILE);
  const token = randomBytes(16).toString('hex');
  const deadline = Date.now() + timeoutMs;
  let delay = retryMs;
  installExitHook();
  for (;;) {
    if (await createExclusive(path, ownerRecord(token))) break;
    const current = await inspect(path);
    if (!current) continue;
    if (isStale(current, staleMs) && (await breakStale(path, current, staleMs))) continue;
    if (Date.now() >= deadline) {
      const error = Error('Learned memory directory is locked by another adapter.');
      error.code = 'ELOCKED';
      throw error;
    }
    await sleep(Math.min(delay, Math.max(1, deadline - Date.now())) * (0.5 + Math.random()));
    delay = Math.min(maxRetryMs, delay * 2);
  }
  held.set(path, token);
  const heartbeat = setInterval(() => {
    const now = new Date();
    utimes(path, now, now).catch(() => {});
  }, Math.max(50, Math.floor(staleMs / 3)));
  heartbeat.unref?.();
  let released = false;
  return async function release() {
    if (released) return;
    released = true;
    clearInterval(heartbeat);
    held.delete(path);
    try {
      if (JSON.parse(await readFile(path, 'utf8')).token === token) await unlink(path);
    } catch {}
  };
}

export async function withDirectoryLock(directory, task, options) {
  const release = await acquireDirectoryLock(directory, options);
  try {
    return await task();
  } finally {
    await release();
  }
}

// Durable atomic replace: temp file in the same directory, fsync, rename, then
// fsync the directory where the platform allows it.
export async function writeFileAtomic(path, contents, {mode = 0o600} = {}) {
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.next`;
  const handle = await open(temp, 'w', mode);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
  await syncDirectory(dirname(path));
}

export async function appendFileDurable(path, contents, {mode = 0o600} = {}) {
  const handle = await open(path, 'a', mode);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch {
    // Some platforms (Windows) cannot fsync a directory; the rename is still atomic.
  } finally {
    await handle?.close().catch(() => {});
  }
}
