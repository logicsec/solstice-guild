export const prepCategories = ['Group runs', 'Individual quests & tasks', 'Professions'];

export async function prepTasks(db, raidId) {
  const result = await db.prepare('SELECT id, task, reported_at FROM raid_prep WHERE raid_id = ? ORDER BY rowid').bind(raidId).all();
  return result.results.map(row=>({ ...JSON.parse(row.task), id: row.id, reportedAt: row.reported_at }));
}

export async function changePrep(db, raidId, input, reply) {
  if (input.action === 'prep-add') {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const benefit = typeof input.benefit === 'string' ? input.benefit.trim().slice(0,240) : '';
    const minutes = Number(input.minutes);
    const roster = await db.prepare("SELECT character, role FROM raid_signups WHERE raid_id = ? AND status = 'Going'").bind(raidId).all();
    const uniqueNames = [...new Set(Array.isArray(input.players) ? input.players : [])];
    const players = uniqueNames.map(name=>roster.results.filter(row=>row.character === name));
    const group = input.category === prepCategories[0];
    if (!title || title.length > 100 || !Number.isInteger(minutes) || minutes < 5 || minutes > 240 ||
        !prepCategories.includes(input.category) || players.length !== (group ? 5 : 1) ||
        players.some(matches=>matches.length !== 1) ||
        (group && (players.filter(([player])=>player.role === 'Tank').length !== 1 ||
          players.filter(([player])=>player.role === 'Healer').length !== 1))) {
      return reply({ error:'Enter a title, 5–240 minutes and eligible players. Groups need one tank, one healer and three DPS.' },400);
    }
    const check = ['access','gear','enchants','supplies'].includes(input.check) ? input.check : '';
    const target = check && uniqueNames.includes(input.target) ? input.target : '';
    const tasks = await prepTasks(db,raidId);
    const after = tasks.find(task=>task.id === input.after)?.id ?? '';
    const task = {title,minutes,benefit,players:uniqueNames,category:input.category,ready:input.ready === true,after,check:target ? check : '',target};
    const result = await db.prepare(`INSERT INTO raid_prep (raid_id,id,task) SELECT ?,?,?
      WHERE (SELECT COUNT(*) FROM raid_prep WHERE raid_id = ?) < 100`).bind(raidId,crypto.randomUUID(),JSON.stringify(task),raidId).run();
    return result.meta.changes ? reply({ ok:true }) : reply({ error:'This raid has reached its preparation task limit.' },409);
  }
  if (input.action === 'prep-report') {
    if (!Array.isArray(input.ids) || input.ids.length > 100 || input.ids.some(id=>typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))) {
      return reply({ error:'Invalid preparation assignments.' },400);
    }
    await db.prepare(`UPDATE raid_prep SET reported_at = ? WHERE raid_id = ? AND reported_at IS NULL
      AND id IN (SELECT value FROM json_each(?))`).bind(new Date().toISOString(),raidId,JSON.stringify(input.ids)).run();
    return reply({ ok:true });
  }
  if (input.action === 'prep-remove') {
    await db.prepare('DELETE FROM raid_prep WHERE raid_id = ? AND id = ? AND reported_at IS NULL').bind(raidId,typeof input.id === 'string' ? input.id : '').run();
    return reply({ ok:true });
  }
  return reply({ error:'Unknown preparation action.' },400);
}

export function schedulePrep(tasks, roster, available, minutes) {
  const placed = new Map();
  const completed = new Set(tasks.filter(task=>task.reportedAt).map(task=>task.id));
  const roles = new Map(roster.map(player=>[player.character,player.role]));
  const busy = new Map(available.map(name=>[name,[]]));
  const remaining = [];
  const ordered = tasks.filter(task=>!task.reportedAt);
  // Prefer raid-entry work when several independent activities can fit.
  ordered.sort((a,b)=>Number(b.check === 'access') - Number(a.check === 'access'));
  const pending = [...ordered];
  while (pending.length) {
    const index = pending.findIndex(task=>!pending.some(prerequisite=>prerequisite.id === task.after));
    if (index < 0) break;
    const [task] = pending.splice(index,1);
    const prior = placed.get(task.after);
    const partyRoles = task.players.map(name=>roles.get(name));
    const validGroup = task.category !== 'Group runs' ||
      (partyRoles.filter(role=>role === 'Tank').length === 1 && partyRoles.filter(role=>role === 'Healer').length === 1 &&
       partyRoles.filter(role=>role?.endsWith('DPS')).length === 3);
    const calendars = task.players.map(name=>busy.get(name));
    const reason = !task.ready ? 'Materials or prerequisites need confirmation' :
      calendars.some(calendar=>!calendar) ? 'A required player is unavailable' :
      !validGroup ? 'The party no longer meets its role requirements' :
      task.after && !prior && !completed.has(task.after) ? 'Prerequisite task is unavailable' : '';
    if (reason) { remaining.push({task,reason}); continue; }
    let start = prior?.end ?? 0;
    const conflicts = calendars.flat().sort((a,b)=>a.start-b.start);
    for (const slot of conflicts) {
      if (start + task.minutes <= slot.start) break;
      if (start < slot.end) start = slot.end;
    }
    const end = start + task.minutes;
    if (end > minutes) { remaining.push({task,reason:'Does not fit the session'}); continue; }
    const assignment = { ...task, start, end };
    placed.set(task.id, assignment);
    for (const calendar of calendars) calendar.push(assignment);
  }
  return { assignments:[...placed.values()].sort((a,b)=>a.start-b.start), remaining };
}
