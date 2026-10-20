import {cleanScope, queryTerms, rankRecords} from './records.mjs';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS learned_memory (
    id TEXT NOT NULL, scope TEXT NOT NULL, session TEXT, kind TEXT NOT NULL,
    text TEXT NOT NULL, at INTEGER NOT NULL, stored_at INTEGER NOT NULL,
    PRIMARY KEY (scope, id))`,
  'CREATE INDEX IF NOT EXISTS learned_memory_scope_at ON learned_memory (scope, at DESC)',
];
const row = (r) => ({
  id: String(r.id),
  kind: String(r.kind),
  text: String(r.text),
  at: Number(r.at),
  session: r.session == null ? null : String(r.session),
});

// Cloud store on Turso (libSQL). Credentials stay in this Node process; the
// browser only ever talks to the token-protected /memory routes.
export async function createTursoMemoryStore({url, authToken, client = null, candidates = 300} = {}) {
  if (!client) {
    const {createClient} = await import('@libsql/client/web');
    client = createClient({url, authToken});
  }
  let ready = null;
  const init = () => (ready ||= client.batch(SCHEMA, 'write').catch((error) => {
    ready = null;
    throw error;
  }));
  return {
    backend: 'turso',
    async add(scope, records) {
      scope = cleanScope(scope);
      await init();
      if (!records.length) return {stored: 0, acknowledged: []};
      const storedAt = Date.now();
      const results = await client.batch(
        records.map((r) => ({
          sql: 'INSERT OR IGNORE INTO learned_memory (id, scope, session, kind, text, at, stored_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [r.id, scope, r.session, r.kind, r.text, r.at, storedAt],
        })),
        'write',
      );
      const stored = results.reduce((n, result) => n + Number(result?.rowsAffected || 0), 0);
      return {stored, acknowledged: records.map((r) => r.id)};
    },
    async recall(scope, query, {limit = 8, excludeSession = ''} = {}) {
      scope = cleanScope(scope);
      await init();
      const terms = queryTerms(query).slice(0, 8),
        args = [scope];
      let sql = 'SELECT id, session, kind, text, at FROM learned_memory WHERE scope = ?';
      if (excludeSession) {
        sql += ' AND (session IS NULL OR session <> ?)';
        args.push(excludeSession);
      }
      if (terms.length) {
        sql += ' AND (' + terms.map(() => 'lower(text) LIKE ?').join(' OR ') + ')';
        args.push(...terms.map((t) => `%${t}%`));
      }
      sql += ' ORDER BY at DESC LIMIT ?';
      args.push(candidates);
      const result = await client.execute({sql, args});
      return rankRecords(result.rows.map(row), query, {limit, excludeSession});
    },
    async count(scope) {
      scope = cleanScope(scope);
      await init();
      const result = await client.execute({sql: 'SELECT count(*) AS n FROM learned_memory WHERE scope = ?', args: [scope]});
      return Number(result.rows[0]?.n || 0);
    },
    async clear(scope) {
      scope = cleanScope(scope);
      await init();
      const result = await client.execute({sql: 'DELETE FROM learned_memory WHERE scope = ?', args: [scope]});
      return {removed: Number(result.rowsAffected || 0)};
    },
    close() {
      client.close?.();
    },
  };
}
