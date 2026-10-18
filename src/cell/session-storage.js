// Compatibility facade for callers that still import the legacy path.
export {
  CELL_AI_ENABLED_KEY,
  CELL_SAVE_KEY,
  createCellSessionStore,
  hasSessionBackup,
  resetSessionStorage,
  restoreSessionStorage,
} from './storage/session-store.js';
