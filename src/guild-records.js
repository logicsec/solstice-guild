import { sameOriginWrite } from './auth.js';

const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const clean = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const idPattern = /^[0-9a-f-]{36}$/;
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

export async function guildRecords(request, env, url, user, admin) {
  const db = env.DB;
  const meetings = url.pathname === '/api/meetings';
  if (request.method === 'GET') {
    if (meetings) {
      const { results } = await db.prepare(`SELECT * FROM guild_meetings
        ORDER BY starts_at < ?, CASE WHEN starts_at >= ? THEN starts_at END,
        starts_at DESC LIMIT 150`).bind(new Date().toISOString(), new Date().toISOString()).all();
      return reply({ meetings: results.map(({ owner, ...row }) => ({ ...row, editable: admin || owner === user })) });
    }
    const raid = url.searchParams.get('raid');
    if (raid && !idPattern.test(raid)) return reply({ error: 'Choose a raid.' }, 400);
    const [entries, history] = await Promise.all([
      db.prepare('SELECT * FROM raid_loot_awards WHERE raid_id = ? ORDER BY recorded_at DESC, id LIMIT 250').bind(raid ?? '').all(),
      db.prepare(`SELECT a.raid_id AS id, COALESCE(r.title, MAX(a.raid_title)) AS title,
        COALESCE(r.starts_at, MAX(a.raid_starts_at)) AS starts_at, COUNT(a.id) AS awards
        FROM raid_loot_awards a LEFT JOIN raids r ON r.id = a.raid_id
        GROUP BY a.raid_id, r.title, r.starts_at ORDER BY starts_at DESC, id DESC LIMIT 12`).bind().all(),
    ]);
    return reply({ awards: entries.results, history: history.results.reverse() });
  }
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  if (!sameOriginWrite(request, url)) return reply({ error: 'Invalid origin.' }, 403);
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== 'object') return reply({ error: 'Invalid form.' }, 400);
  if (meetings) {
    const title = clean(input.title, 120);
    if (!title || !iso(input.start) || !iso(input.end) || input.end <= input.start) {
      return reply({ error: 'Enter a title and an end time after the start.' }, 400);
    }
    const fields = [title, input.start, input.end, clean(input.location, 250), clean(input.agenda, 8000), clean(input.notes, 16000)];
    if (input.id == null) {
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO guild_meetings (id,owner,title,starts_at,ends_at,location,agenda,notes)
        VALUES (?,?,?,?,?,?,?,?)`).bind(id,user,...fields).run();
      return reply({ id });
    }
    if (!idPattern.test(input.id) || !Number.isSafeInteger(input.revision)) return reply({ error: 'Invalid meeting.' }, 400);
    const existing = await db.prepare('SELECT owner FROM guild_meetings WHERE id = ?').bind(input.id).first();
    if (!existing) return reply({ error: 'Meeting not found.' }, 404);
    if (!admin && existing.owner !== user) return reply({ error: 'Only the meeting organizer can edit this meeting.' }, 403);
    const result = await db.prepare(`UPDATE guild_meetings SET title=?,starts_at=?,ends_at=?,location=?,agenda=?,notes=?,revision=revision+1
      WHERE id=? AND revision=?`).bind(...fields,input.id,input.revision).run();
    return result.meta.changes ? reply({ id: input.id }) : reply({ error: 'This meeting changed. Copy any unsaved notes, then reload before editing.' }, 409);
  }
  if (!idPattern.test(input.raid ?? '') || !idPattern.test(input.id ?? '')) return reply({ error: 'Invalid award.' }, 400);
  const raid = await db.prepare('SELECT owner FROM raids WHERE id = ?').bind(input.raid).first();
  if (!raid) return reply({ error: 'Raid not found.' }, 404);
  if (raid.owner !== user) return reply({ error: 'Only the raid organizer can record awards.' }, 403);
  if (input.action === 'remove') {
    await db.prepare('DELETE FROM raid_loot_awards WHERE id = ? AND raid_id = ?').bind(input.id,input.raid).run();
    return reply({ ok: true });
  }
  const item = clean(input.item, 120), recipient = clean(input.recipient, 80);
  if (!item || !recipient) return reply({ error: 'Enter an item and the receiving character.' }, 400);
  await db.prepare(`INSERT INTO raid_loot_awards (id,raid_id,raid_title,raid_starts_at,item,recipient,note,recorded_at)
    SELECT ?,id,title,starts_at,?,?,?,? FROM raids WHERE id=? AND owner=?
    ON CONFLICT(id) DO NOTHING`)
    .bind(input.id,item,recipient,clean(input.note, 400),new Date().toISOString(),input.raid,user).run();
  return reply({ ok: true });
}
