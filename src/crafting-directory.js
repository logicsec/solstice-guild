import { sameOriginWrite } from './auth.js';

export async function craftingDirectory(request, env, url, session, professions) {
  const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
  const db = env.DB;
  const member = session.discord_id;
  const owned = `(SELECT name FROM armory_links WHERE member = ? UNION SELECT name FROM raid_characters WHERE member = ?)`;
  if (request.method === 'GET') {
    const [characters, listings] = await Promise.all([
      db.prepare(`SELECT DISTINCT name COLLATE NOCASE AS name FROM ${owned} ORDER BY name`).bind(member, member).all(),
      db.prepare(`SELECT character, profession, spell_id, recipe_name, result_name, materials, note, confirmed_at, (member = ?) AS mine
        FROM guild_crafts AS c WHERE EXISTS (SELECT 1 FROM armory_links a WHERE a.member = c.member AND a.name = c.character COLLATE NOCASE)
        OR EXISTS (SELECT 1 FROM raid_characters r WHERE r.member = c.member AND r.name = c.character COLLATE NOCASE)
        ORDER BY recipe_name COLLATE NOCASE, character COLLATE NOCASE`).bind(member).all(),
    ]);
    return reply({ characters: characters.results.map(row => row.name), listings: listings.results.map(row => ({ ...row, materials: JSON.parse(row.materials) })) });
  }
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  if (!sameOriginWrite(request, url) || !request.headers.get('Content-Type')?.startsWith('application/json')) {
    return reply({ error: 'Invalid request origin.' }, 403);
  }
  const input = await request.json().catch(() => null);
  const name = typeof input?.character === 'string' ? input.character.trim() : '';
  const profession = input?.profession;
  const spellId = input?.spellId;
  if (!name || name.length > 61 || !professions.includes(profession) || !Number.isSafeInteger(spellId) || spellId <= 0) {
    return reply({ error: 'Choose a character and recipe.' }, 400);
  }
  if (input.action === 'remove') {
    await db.prepare('DELETE FROM guild_crafts WHERE member = ? AND character = ? AND profession = ? AND spell_id = ?')
      .bind(member, name, profession, spellId).run();
    return reply({ ok: true });
  }
  if (input.action !== 'confirm') return reply({ error: 'Unknown crafting action.' }, 400);
  const character = await db.prepare(`SELECT name FROM ${owned} WHERE name = ? COLLATE NOCASE LIMIT 1`)
    .bind(member, member, name).first();
  if (!character) return reply({ error: 'You can only confirm recipes for your own characters.' }, 403);
  const response = await fetch('https://api.ahledger.com/v1/crafting/forever.normal.alliance.us?all=1&profession=' + encodeURIComponent(profession),
    { signal: AbortSignal.timeout(9000), redirect: 'error' });
  if (!response.ok) return reply({ error: 'Recipe catalog temporarily unavailable.' }, 502);
  const catalog = await response.json();
  const craft = catalog.recipes?.find(row => row.recipe?.spellId === spellId);
  if (!craft?.recipe?.name) return reply({ error: 'This recipe is no longer available in the catalog.' }, 404);
  const materials = (craft.reagents ?? []).filter(row => typeof row.name === 'string' && Number.isFinite(row.qty) && row.qty > 0)
    .slice(0, 25).map(row => ({ name: row.name.slice(0, 120), qty: row.qty }));
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 240) : '';
  await db.prepare(`INSERT INTO guild_crafts (member, character, profession, spell_id, recipe_name, result_name, materials, note, confirmed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (member, character, profession, spell_id) DO UPDATE SET
    recipe_name=excluded.recipe_name, result_name=excluded.result_name, materials=excluded.materials, note=excluded.note, confirmed_at=excluded.confirmed_at`)
    .bind(member, character.name, profession, spellId, craft.recipe.name, craft.result?.name ?? '', JSON.stringify(materials), note, new Date().toISOString()).run();
  return reply({ ok: true });
}
