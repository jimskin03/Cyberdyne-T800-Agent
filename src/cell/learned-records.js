// Learned memory: interactions recorded while the AI mind is on. This is a
// separate layer from the authored JSON Brain. Shared by the browser and backend.
export const LEARNED_KINDS = ['intercom', 'say', 'note', 'pain'];
export const MAX_TEXT = 2000;
export const MAX_BATCH = 100;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const SCOPE = /^[a-z0-9-]{1,32}$/;
const STOP = new Set(
  'that this with have were what your from about remember session previous earlier before again happened feeling felt during could would being there last past them they then than when will just like into over some does said tell know'.split(
    ' ',
  ),
);

const fail = (status, message) => {
  throw Object.assign(Error(message), {status});
};

export function cleanScope(value = 'cell') {
  const scope = String(value || 'cell');
  if (!SCOPE.test(scope)) fail(400, 'Invalid memory scope.');
  return scope;
}

export function cleanRecord(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Invalid memory record.');
  const {id, kind, text, at, session} = value;
  if (typeof id !== 'string' || !ID.test(id)) fail(400, 'Memory record id is invalid.');
  if (!LEARNED_KINDS.includes(kind)) fail(400, 'Memory record kind is not stored.');
  if (typeof text !== 'string' || !text.trim()) fail(400, 'Memory record text is required.');
  if (session != null && (typeof session !== 'string' || !ID.test(session)))
    fail(400, 'Memory record session is invalid.');
  const time = Number.isFinite(at) && at > 0 && at <= now + 60_000 ? Math.floor(at) : now;
  return {id, kind, text: text.trim().slice(0, MAX_TEXT), at: time, session: session || null};
}

export function cleanBatch(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.records))
    fail(400, 'Expected {"records": [...]}.');
  if (body.records.length > MAX_BATCH) fail(413, `Send at most ${MAX_BATCH} records at once.`);
  return {scope: cleanScope(body.scope), records: body.records.map((r) => cleanRecord(r, now))};
}

export function queryTerms(query) {
  return [...new Set(String(query || '').toLowerCase().match(/[a-z]{4,}/g) || [])]
    .filter((word) => !STOP.has(word))
    .slice(0, 12);
}

// Shared by the file store, Turso and the browser fallback so results agree.
export function rankRecords(records, query, {limit = 8, excludeSession = ''} = {}) {
  const terms = queryTerms(query),
    best = [];
  for (const record of records) {
    if (excludeSession && record.session === excludeSession) continue;
    const text = String(record.text || '').toLowerCase();
    const matches = terms.reduce((n, term) => n + (text.includes(term) ? 1 : 0), 0);
    if (terms.length && !matches) continue;
    best.push({record, score: matches + (record.kind === 'intercom' || record.kind === 'say' ? 1 : 0)});
  }
  best.sort((a, b) => b.score - a.score || (b.record.at || 0) - (a.record.at || 0));
  return best.slice(0, Math.max(1, Math.min(20, limit))).map(({record}) => record);
}
