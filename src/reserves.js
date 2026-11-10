import { validLootSql } from './raid-loot.js';

export async function raidReserves(db, id, includeKeys = false) {
  const { results } = await db.prepare(`SELECT r.player_key, COALESCE(s.character, r.character) AS character, r.items
    FROM raid_reserves r
    LEFT JOIN raid_signups s ON s.raid_id = r.raid_id AND r.player_key = 'member:' || s.member
    WHERE r.raid_id = ? AND (r.player_key LIKE 'guest:%' OR s.status = 'Going')
    AND json_array_length(r.items) > 0 ORDER BY character COLLATE NOCASE`).bind(id).all();
  return results.map(row=>({
    character: row.character, items: JSON.parse(row.items),
    ...(includeKeys ? { key: row.player_key } : {}),
  }));
}

export async function reserveHistory(db, raid, user, requestedKey, reply) {
  const key = requestedKey || 'member:' + user;
  if (raid.owner !== user && key !== 'member:' + user) {
    return reply({ error:'Only the raid organizer can view another player’s reserve history.' },403);
  }
  if (key !== 'member:' + user) {
    const present = await db.prepare(`SELECT 1 FROM raid_signups WHERE raid_id = ? AND 'member:' || member = ?
      UNION ALL SELECT 1 FROM raid_reserves WHERE raid_id = ? AND player_key = ? LIMIT 1`).bind(raid.id,key,raid.id,key).first();
    if (!present) return reply({ error:'Player is not on this raid.' },404);
  }
  const { results } = await db.prepare(`SELECT r.id, r.title, r.starts_at, p.character, p.items
    FROM raid_reserves p JOIN raids r ON r.id = p.raid_id
    WHERE p.player_key = ? AND json_array_length(p.items) > 0 ORDER BY r.starts_at DESC, r.id DESC`).bind(key).all();
  return reply({ history:results.map(row=>({...row,items:JSON.parse(row.items)})) });
}

export async function changeReserves(db, raid, user, input, reply) {
  const organizer = raid.owner === user;
  if (input.action === 'reserve-review') {
    if (!organizer) return reply({error:'Only the organizer can review guest requests.'},403);
    const {key,approve} = input;
    if (typeof key !== 'string' || !key.startsWith('request:') || key.length > 130 || typeof approve !== 'boolean') {
      return reply({error:'Invalid guest request.'},400);
    }
    const result = approve ? await db.prepare(`UPDATE OR IGNORE raid_reserves SET player_key = ?
      WHERE raid_id = ? AND player_key = ? AND EXISTS (SELECT 1 FROM raids r
      WHERE r.id = raid_reserves.raid_id AND r.owner = ? AND r.reserves_locked = 0
      AND r.state <> 'Cancelled' AND r.reserve_limit >= json_array_length(raid_reserves.items)
      AND ${validLootSql('raid_reserves.items','r')})`)
      .bind('guest:'+key.slice(8),raid.id,key,user).run() :
      await db.prepare('DELETE FROM raid_reserves WHERE raid_id = ? AND player_key = ?').bind(raid.id,key).run();
    return result.meta.changes ? reply({ok:true}) : reply({error:'Request unavailable, reserves closed, or an approved reserve already exists for this character.'},409);
  }
  if (input.action === 'reserve-settings') {
    if (!organizer) return reply({ error:'Only the organizer can change reserve settings.' },403);
    const {limit,locked} = input;
    if ((limit === undefined) === (locked === undefined) ||
        (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 5)) ||
        (locked !== undefined && typeof locked !== 'boolean')) {
      return reply({error:'Set a limit from 1 to 5 or change the lock state.'},400);
    }
    const result = locked !== undefined ?
      await db.prepare('UPDATE raids SET reserves_locked = ? WHERE id = ? AND owner = ?').bind(Number(locked),raid.id,user).run() :
      await db.prepare(`UPDATE raids SET reserve_limit = ? WHERE id = ? AND owner = ?
        AND NOT EXISTS (SELECT 1 FROM raid_reserves WHERE raid_id = raids.id AND player_key NOT LIKE 'request:%' AND json_array_length(items) > ?)`)
        .bind(limit,raid.id,user,limit).run();
    return result.meta.changes ? reply({ok:true}) : reply({error:'The raid is unavailable or has players with more picks than the new limit.'},409);
  }
  if (input.action !== 'reserve-picks') return reply({error:'Unknown reserve action.'},400);
  if ((input.member != null || input.guest != null) && !organizer) return reply({error:'Only the organizer can manage other players’ picks.'},403);
  const guest = typeof input.guest === 'string' ? input.guest.trim().replace(/\s+/g,' ') : '';
  if (input.guest != null && (!guest || guest.length > 61 || input.member != null)) return reply({error:'Enter a guest character name.'},400);
  const member = input.member ?? user;
  if (typeof member !== 'string' || member.length > 250) return reply({error:'Invalid raider.'},400);
  if (!Array.isArray(input.items) || input.items.length > 5 || input.items.some(item=>typeof item !== 'string' || !item.trim() || item.trim().length > 120)) {
    return reply({error:'Enter up to five item names, one per line.'},400);
  }
  const items = input.items.map(item=>item.trim());
  if (new Set(items.map(item=>item.toLowerCase())).size !== items.length) return reply({error:'Each item can only be reserved once per player.'},400);
  const key = guest ? 'guest:'+guest.toLowerCase() : 'member:'+member;
  const result = await db.prepare(`INSERT INTO raid_reserves (raid_id,player_key,character,items)
    SELECT r.id, ?, CASE WHEN ? <> '' THEN ? ELSE s.character END, ? FROM raids r
    LEFT JOIN raid_signups s ON s.raid_id = r.id AND s.member = ?
    WHERE r.id = ? AND r.reserves_locked = 0 AND r.state <> 'Cancelled' AND r.reserve_limit >= ?
    AND ((? <> '' AND r.owner = ?) OR (s.status = 'Going' AND (s.member = ? OR r.owner = ?)))
    AND ${validLootSql('?','r')}
    ON CONFLICT(raid_id,player_key) DO UPDATE SET character = excluded.character, items = excluded.items`)
    .bind(key,guest,guest,JSON.stringify(items),member,raid.id,items.length,guest,user,user,user,JSON.stringify(items)).run();
  return result.meta.changes ? reply({ok:true}) : reply({error:'Picks can only be saved for confirmed raiders or organizer-entered guests while reserves are open, within the limit, and on the raid loot table.'},409);
}

export async function pendingGuestReserves(db,id) {
  const {results} = await db.prepare(`SELECT player_key AS key, character, items FROM raid_reserves
    WHERE raid_id = ? AND player_key LIKE 'request:%' ORDER BY character COLLATE NOCASE`).bind(id).all();
  return results.map(row=>({...row,items:JSON.parse(row.items)}));
}

export async function requestGuestReserves(db,id,form) {
  const name = String(form.get('character') ?? '').trim().replace(/\s+/g,' ');
  const items = form.getAll('items').filter(item=>typeof item === 'string' && item !== '');
  if (!name || name.length > 61 || !items.length || items.length > 5 ||
      items.some(item=>item.length > 120) || new Set(items.map(item=>item.toLowerCase())).size !== items.length) {
    return new Response('Enter a character name and choose up to five distinct loot items.',{status:400});
  }
  const normalized = name.toLowerCase();
  const result = await db.prepare(`INSERT OR IGNORE INTO raid_reserves (raid_id,player_key,character,items)
    SELECT r.id, ?, ?, ? FROM raids r WHERE r.id = ? AND r.reserves_locked = 0 AND r.state <> 'Cancelled' AND r.reserve_limit >= ?
    AND NOT EXISTS (SELECT 1 FROM raid_reserves WHERE raid_id = r.id AND player_key = ?)
    AND (SELECT count(*) FROM raid_reserves WHERE raid_id = r.id AND player_key LIKE 'request:%') < 100
    AND ${validLootSql('?','r')}`)
    .bind('request:'+normalized,name,JSON.stringify(items),id,items.length,'guest:'+normalized,JSON.stringify(items)).run();
  return result.meta.changes ?
    new Response(null,{status:303,headers:{Location:'/raid/'+id+'?reserve=requested#loot-reserves','Cache-Control':'no-store'}}) :
    new Response('This request could not be saved. Check the raid’s loot table, reserve limit, and lock status, or ask the organizer if a request already exists.',{status:409});
}
