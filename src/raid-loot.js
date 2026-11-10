export const raidInstances = {
  'barrow-deeps': { name:'Barrow Deeps', size:10 },
  'hyjal-summit': { name:'Hyjal Summit', size:20 },
  'onyxias-lair': { name:'Onyxia’s Lair', size:40 },
};

export function raidInstance(key) {
  return Object.hasOwn(raidInstances,key) ? raidInstances[key] : null;
}

export async function raidLoot(db,raid) {
  if (!raid.instance) return [];
  const table = await db.prepare('SELECT items FROM raid_loot_tables WHERE owner = ? AND instance = ?').bind(raid.owner,raid.instance).first();
  return table ? JSON.parse(table.items) : [];
}

// Each reserve write checks the current table in the same statement as the write.
export function validLootSql(items, raid) {
  return `NOT EXISTS (SELECT 1 FROM json_each(${items}) AS pick WHERE NOT EXISTS (
    SELECT 1 FROM raid_loot_tables AS loot, json_each(loot.items) AS available
    WHERE loot.owner = ${raid}.owner AND loot.instance = ${raid}.instance AND available.value = pick.value
  ))`;
}

export async function changeRaidLoot(db,raid,user,input,reply) {
  if (raid.owner !== user) return reply({error:'Only the organizer can manage the loot table.'},403);
  if (input.action === 'reserve-instance') {
    if (raid.instance || raidInstance(input.instance)?.size !== raid.size) return reply({error:'Choose a raid matching the existing group size.'},400);
    const result = await db.prepare('UPDATE raids SET instance = ? WHERE id = ? AND owner = ? AND instance IS NULL')
      .bind(input.instance,raid.id,user).run();
    return result.meta.changes ? reply({ok:true}) : reply({error:'The raid selection changed. Refresh and try again.'},409);
  }
  if (!raid.instance || !Array.isArray(input.items) || input.items.length > 500 ||
      input.items.some(item=>typeof item !== 'string' || !item.trim() || item.trim().length > 120)) {
    return reply({error:'Choose a raid and enter up to 500 item names, one per line.'},400);
  }
  const items = input.items.map(item=>item.trim());
  if (new Set(items.map(item=>item.toLowerCase())).size !== items.length) return reply({error:'Remove duplicate item names.'},400);
  items.sort((a,b)=>a.localeCompare(b));
  await db.prepare(`INSERT INTO raid_loot_tables (owner,instance,items) VALUES (?,?,?)
    ON CONFLICT(owner,instance) DO UPDATE SET items = excluded.items`).bind(user,raid.instance,JSON.stringify(items)).run();
  return reply({ok:true});
}
