import {cleanScope, queryTerms, rankRecords} from './records.mjs';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS learned_memory (
    id TEXT NOT NULL, scope TEXT NOT NULL, session TEXT, kind TEXT NOT NULL,
    text TEXT NOT NULL, at INTEGER NOT NULL, stored_at INTEGER NOT NULL,
    PRIMARY KEY (scope, id))`,
  'CREATE INDEX IF NOT EXISTS learned_memory_scope_at ON learned_memory (scope, at DESC)',
  `CREATE TABLE IF NOT EXISTS learned_memory_epoch (
    scope TEXT PRIMARY KEY, epoch INTEGER NOT NULL)`,
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
const likeTerm = (term) => `%${String(term).replace(/[\\%_]/g, (char) => '\\' + char)}%`;

export async function createTursoMemoryStore({url, authToken, client = null} = {}) {
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
      const trimmed = String(query || '').trim();
      const terms = queryTerms(trimmed).slice(0, 8);
      if (trimmed && !terms.length) return [];
      const capped = Math.max(1, Math.min(20, Number(limit) || 8));
      const likes = terms.map(likeTerm);
      let sql = 'SELECT id, session, kind, text, at';
      const args = [];
      if (terms.length) {
        sql +=
          ', (' +
          terms.map(() => "CASE WHEN lower(text) LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END").join(' + ') +
          ") + CASE WHEN kind IN ('intercom', 'say') THEN 1 ELSE 0 END AS score";
        args.push(...likes);
      }
      sql += ' FROM learned_memory WHERE scope = ?';
      args.push(scope);
      if (excludeSession) {
        sql += ' AND (session IS NULL OR session <> ?)';
        args.push(excludeSession);
      }
      if (terms.length) {
        sql += ' AND (' + terms.map(() => "lower(text) LIKE ? ESCAPE '\\'").join(' OR ') + ')';
        args.push(...likes);
        sql += ' ORDER BY score DESC, at DESC LIMIT ?';
        args.push(capped);
      } else {
        // No search terms: browse a recent window, then let shared ranking apply the caller's limit.
        sql += ' ORDER BY at DESC LIMIT ?';
        args.push(300);
      }
      const result = await client.execute({sql, args});
      return rankRecords(result.rows.map(row), query, {limit: capped, excludeSession});
    },
    async count(scope) {
      scope = cleanScope(scope);
      await init();
      const result = await client.execute({sql: 'SELECT count(*) AS n FROM learned_memory WHERE scope = ?', args: [scope]});
      return Number(result.rows[0]?.n || 0);
    },
    async epoch(scope) {
      scope = cleanScope(scope);
      await init();
      const result = await client.execute({
        sql: 'SELECT epoch FROM learned_memory_epoch WHERE scope = ?',
        args: [scope],
      });
      const value = Number(result.rows[0]?.epoch);
      return Number.isInteger(value) && value >= 0 ? value : 0;
    },
    async clear(scope) {
      scope = cleanScope(scope);
      await init();
      // One batch commits the delete and the generation together.
      const results = await client.batch(
        [
          {sql: 'SELECT count(*) AS n FROM learned_memory WHERE scope = ?', args: [scope]},
          {sql: 'DELETE FROM learned_memory WHERE scope = ?', args: [scope]},
          {
            sql: `INSERT INTO learned_memory_epoch (scope, epoch) VALUES (?, 1)
              ON CONFLICT(scope) DO UPDATE SET epoch = epoch + 1
              RETURNING epoch`,
            args: [scope],
          },
        ],
        'write',
      );
      const epoch = Number(results[2]?.rows?.[0]?.epoch);
      return {removed: Number(results[0]?.rows?.[0]?.n || 0), epoch: Number.isInteger(epoch) ? epoch : 0};
    },
    close() {
      client.close?.();
    },
  };
}
