import { sameOriginWrite } from './auth.js';

export const eventTypes = {
  Raid: '#b65f44',
  Dungeon: '#6089bb',
  Leveling: '#83a259',
  Other: '#a48f64',
};

export function eventSchedule(input) {
  const start = Date.parse(input.startsAt);
  const end = input.endsAt ? Date.parse(input.endsAt) : null;
  const dates = input.dates ?? [input.startsAt];
  if (!Number.isFinite(start) || start <= Date.now() ||
      (end !== null && (!Number.isFinite(end) || end <= start)) ||
      !Array.isArray(dates) || dates.length < 1 || dates.length > 12 || dates[0] !== input.startsAt) return null;

  const times = dates.map(value => Date.parse(value));
  if (times.some((time, index) => !Number.isFinite(time) ||
    (index && Math.abs(time - times[index - 1] - 7 * 86400000) > 2 * 3600000))) return null;

  return times.map(time => ({
    startsAt: new Date(time).toISOString(),
    endsAt: end === null ? null : new Date(time + (end - start)).toISOString(),
  }));
}

export async function guildEventsApi(request, env, url, user) {
  const db = env.DB;
  const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!db) return reply({ error: 'Event storage is unavailable.' }, 503);
  if (request.method === 'GET') {
    const from = Date.parse(url.searchParams.get('from'));
    const to = Date.parse(url.searchParams.get('to'));
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 120 * 86400000) {
      return reply({ error: 'Choose a valid calendar range.' }, 400);
    }
    const start = new Date(from).toISOString();
    const end = new Date(to).toISOString();
    const raids = db.prepare(`SELECT id, title, starts_at, state, notes AS description,
      json_extract(settings, '$.endsAt') AS ends_at, 'Raid' AS type,
      (SELECT COUNT(*) FROM raid_signups WHERE raid_id = raids.id AND status = 'Going') AS signups
      FROM raids WHERE starts_at >= ? AND starts_at < ? AND state <> 'Cancelled'
      AND (state = 'Open' OR owner = ? OR EXISTS (SELECT 1 FROM raid_signups WHERE raid_id = raids.id AND member = ?))`).bind(start,end,user,user);
    const events = db.prepare(`SELECT id, title, type, starts_at, ends_at, description,
      (SELECT COUNT(*) FROM guild_event_signups WHERE event_id = guild_events.id) AS signups,
      EXISTS (SELECT 1 FROM guild_event_signups WHERE event_id = guild_events.id AND member = ?) AS joined
      FROM guild_events WHERE starts_at >= ? AND starts_at < ?`).bind(user,start,end);
    const results = await Promise.all([raids.all(), events.all()]);
    return reply({ events: results.flatMap(result => result.results) });
  }
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  if (!sameOriginWrite(request, url) || !request.headers.get('Content-Type')?.startsWith('application/json')) {
    return reply({ error: 'Invalid request origin.' }, 403);
  }
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== 'object') return reply({ error: 'Invalid event form.' }, 400);

  if (input.action === 'signup') {
    if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/.test(input.id) || typeof input.joined !== 'boolean') {
      return reply({ error: 'Invalid sign-up.' }, 400);
    }
    const event = await db.prepare('SELECT starts_at FROM guild_events WHERE id = ?').bind(input.id).first();
    if (!event) return reply({ error: 'Event not found.' }, 404);
    if (Date.parse(event.starts_at) <= Date.now()) return reply({ error: 'This event has already started.' }, 409);
    if (input.joined) {
      await db.prepare('INSERT INTO guild_event_signups (event_id, member) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(input.id,user).run();
    } else {
      await db.prepare('DELETE FROM guild_event_signups WHERE event_id = ? AND member = ?').bind(input.id,user).run();
    }
    const { signups } = await db.prepare('SELECT COUNT(*) AS signups FROM guild_event_signups WHERE event_id = ?').bind(input.id).first();
    return reply({ signups, joined: input.joined });
  }

  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 80) : '';
  const description = typeof input.description === 'string' ? input.description.trim().slice(0, 1000) : '';
  const schedule = eventSchedule(input);
  if (!['Dungeon', 'Leveling', 'Other'].includes(input.type) || !title || !schedule) {
    return reply({ error: 'Enter a title, select an event type, and check the start, end, and repeat schedule.' }, 400);
  }
  const ids = schedule.map(() => crypto.randomUUID());
  const statements = schedule.map(({startsAt, endsAt}, index) =>
    db.prepare('INSERT INTO guild_events (id, owner, title, type, starts_at, ends_at, description) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(ids[index],user,title,input.type,startsAt,endsAt,description));
  await db.batch(statements);
  return reply({ id: ids[0], count: ids.length }, 201);
}
