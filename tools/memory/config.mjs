import {readFileSync} from 'node:fs';
import {link, mkdir, readFile, unlink, writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {join, resolve} from 'node:path';

const TOKEN = /^[\x21-\x7E]{16,512}$/;
export const TOKEN_FILE = 'api-token';
const blank = (value) => !String(value ?? '').trim();

export function memoryDirectory(env = process.env) {
  return resolve(blank(env.MEMORY_DIR) ? 'saved-world/memory' : String(env.MEMORY_DIR).trim());
}

// Turso is used only when both values are set; otherwise the local file store.
export function memoryConfiguration(env = process.env) {
  const url = String(env.TURSO_DATABASE_URL || '').trim(),
    authToken = String(env.TURSO_AUTH_TOKEN || '').trim();
  if (!blank(env.MEMORY_API_TOKEN) && !TOKEN.test(String(env.MEMORY_API_TOKEN).trim()))
    throw Error('MEMORY_API_TOKEN must be one printable line of at least 16 characters.');
  if (url || authToken) {
    if (!url || !authToken) throw Error('Set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, or neither.');
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw Error('TURSO_DATABASE_URL must be a libsql:// or https:// URL.');
    }
    if (!['libsql:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search)
      throw Error('TURSO_DATABASE_URL must be a libsql:// or https:// URL without credentials or queries.');
  }
  return {
    backend: url ? 'turso' : 'local',
    directory: memoryDirectory(env),
    token: blank(env.MEMORY_API_TOKEN) ? '' : String(env.MEMORY_API_TOKEN).trim(),
    turso: url ? {url, authToken} : null,
  };
}

// Without MEMORY_API_TOKEN the adapter creates a random token once and keeps it
// in an owner-only file beside the local store, so zero-config setups still
// require a token. The value is never printed.
export async function ensureMemoryToken({token, directory}) {
  if (token) return {token, source: 'env'};
  const path = join(directory, TOKEN_FILE);
  try {
    const saved = (await readFile(path, 'utf8')).trim();
    if (TOKEN.test(saved)) return {token: saved, source: 'file', path};
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await mkdir(directory, {recursive: true, mode: 0o700});
  const fresh = randomBytes(32).toString('base64url');
  // Two adapters starting on one MEMORY_DIR must agree on the token: the complete
  // file is hard-linked into place, which fails if another adapter already won.
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temp, fresh + '\n', {mode: 0o600});
  try {
    await link(temp, path);
  } catch (error) {
    if (error.code === 'EEXIST') {
      const saved = (await readFile(path, 'utf8')).trim();
      if (TOKEN.test(saved)) return {token: saved, source: 'file', path};
    }
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EMLINK', 'EEXIST'].includes(error.code)) throw error;
    // No hard links (or an unreadable leftover): fall back to replacing the file.
    await writeFile(path, fresh + '\n', {mode: 0o600});
  } finally {
    await unlink(temp).catch(() => {});
  }
  return {token: fresh, source: 'generated', path};
}

// Synchronous read used by the scene proxy on the same computer.
export function readMemoryToken(env = process.env) {
  if (!blank(env.MEMORY_API_TOKEN)) return String(env.MEMORY_API_TOKEN).trim();
  try {
    const saved = readFileSync(join(memoryDirectory(env), TOKEN_FILE), 'utf8').trim();
    return TOKEN.test(saved) ? saved : '';
  } catch {
    return '';
  }
}
