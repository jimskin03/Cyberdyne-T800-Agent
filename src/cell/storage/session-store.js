const PREFIX = 'cell-public-';
const BACKUP = 'cell-session-reset-backup.v1';

export const CELL_SAVE_KEY = 'cell-public-cell.v1';
export const CELL_AI_ENABLED_KEY = 'cell-public-ai.enabled';

function parseJson(value, fallback = null) {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function resetSessionStorage(storage) {
  const entries = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) entries[key] = storage.getItem(key);
  }
  storage.setItem(BACKUP, JSON.stringify(entries));
  for (const key of Object.keys(entries)) storage.removeItem(key);
}

export function hasSessionBackup(storage) {
  return storage.getItem(BACKUP) !== null;
}

export function restoreSessionStorage(storage) {
  const entries = parseJson(storage.getItem(BACKUP));
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return false;
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  for (const [key, value] of Object.entries(entries))
    if (key.startsWith(PREFIX) && typeof value === 'string') storage.setItem(key, value);
  storage.removeItem(BACKUP);
  return true;
}

export function createCellSessionStore({
  storage = globalThis.localStorage,
  persistence = null,
  archiveLimit = 500,
} = {}) {
  const readLocal = () => parseJson(storage?.getItem?.(CELL_SAVE_KEY));

  const loading = Promise.resolve(persistence?.loading).then((snapshot) => {
    const local = readLocal();
    return {snapshot: snapshot || null, local, data: snapshot?.data ?? local};
  });

  return {
    readLocal,
    save(data) {
      try {
        storage?.setItem?.(CELL_SAVE_KEY, JSON.stringify(data));
      } catch {}
      persistence?.save?.({
        ...data,
        archive: Array.isArray(data?.archive) ? data.archive.slice(0, archiveLimit) : [],
      });
    },
    takeAcknowledged() {
      return persistence?.takeAcknowledged?.() || [];
    },
    get status() {
      return (
        persistence?.status || {
          available: false,
          savedAt: 0,
          error: 'Browser storage only',
          conflict: false,
        }
      );
    },
    loading,
    getAiEnabled() {
      try {
        return storage?.getItem?.(CELL_AI_ENABLED_KEY) === 'true';
      } catch {
        return false;
      }
    },
    setAiEnabled(enabled) {
      try {
        storage?.setItem?.(CELL_AI_ENABLED_KEY, String(!!enabled));
      } catch {}
    },
    reset() {
      resetSessionStorage(storage);
    },
    hasBackup() {
      return hasSessionBackup(storage);
    },
    restoreBackup() {
      return restoreSessionStorage(storage);
    },
  };
}
