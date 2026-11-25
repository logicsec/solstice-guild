import {raidInstance} from './raid-loot.js';
const formatter=zone=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function parts(format,date){return Object.fromEntries(format.formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));}
export function teamLocalInstant(date,time,zone){
 const [year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number);
 const format=formatter(zone),wanted=Date.UTC(year,month-1,day,hour,minute);let instant=wanted;
 for(let n=0;n<4;n++){const p=parts(format,new Date(instant));const delta=wanted-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);if(!delta)break;instant+=delta;}
 const p=parts(format,new Date(instant));
 if(p.year!==year||p.month!==month||p.day!==day||p.hour!==hour||p.minute!==minute)return null;
 return new Date(instant).toISOString();
}
export function validateTeamSchedule(input){
 if(!['Progress','Farm','Optional','Off night'].includes(input.kind)||typeof input.timezone!=='string'||input.timezone.length>80)return null;
 try{formatter(input.timezone).format(new Date());}catch{return null;}
 const instance=input.kind==='Off night'?null:raidInstance(input.instance);
 if(input.kind!=='Off night'&&!instance)return null;
 if(!Array.isArray(input.days)||!input.days.length||input.days.length>7)return null;
 const seen=new Set(),time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
 for(const day of input.days){if(!day||!Number.isInteger(day.day)||day.day<0||day.day>6||seen.has(day.day)||!time.test(day.start)||!time.test(day.end)||day.start===day.end)return null;seen.add(day.day);}
 return {kind:input.kind,timezone:input.timezone,instance:instance?input.instance:null,days:input.days.map(({day,start,end})=>({day,start,end})).sort((a,b)=>a.day-b.day)};
}
export function scheduledTeamDates(schedule,now=new Date()){
 const format=formatter(schedule.timezone),p=parts(format,now),today=Date.UTC(p.year,p.month-1,p.day);const dates=[];
 for(let offset=0;offset<56;offset++){
  const day=new Date(today+offset*86400000),selection=schedule.days.find(entry=>entry.day===day.getUTCDay());if(!selection)continue;
  const date=day.toISOString().slice(0,10),endDate=new Date(+day+(selection.end<=selection.start?86400000:0)).toISOString().slice(0,10);
  const startsAt=teamLocalInstant(date,selection.start,schedule.timezone),endsAt=teamLocalInstant(endDate,selection.end,schedule.timezone);
  if(startsAt&&endsAt&&Date.parse(startsAt)>+now)dates.push({date,startsAt,endsAt});
 }
 return dates;
}
async function occurrenceId(schedule,date){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(schedule+':'+date))).slice(0,16);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);}
async function teamScheduleOccurrences(row, now) {
 const instance=raidInstance(row.instance);
 if(row.kind==='Off night'||!instance)return [];
 const dates=scheduledTeamDates({...row,days:JSON.parse(row.days)},now);
 return Promise.all(dates.map(async date=>{
  const id=await occurrenceId(row.id,date.date);
  const settings={
   team:{id:row.team_id,name:row.team_name,region:row.region,ruleset:row.ruleset},
   teamSchedule:{id:row.id,kind:row.kind,date:date.date,timezone:row.timezone},
   endsAt:date.endsAt,groupPlan:[],roles:null,review:false,waitlist:false,requirements:'',softReserve:'',
  };
  return {
   id,date,settings,instance,
   title:row.team_name+' · '+row.kind+' · '+instance.name,
  };
 }));
}

function insertOccurrences(db,row,occurrences) {
 return db.prepare(`INSERT INTO raids(id,owner,title,starts_at,size,notes,settings,instance,creator_name)
  SELECT json_extract(value,'$.id'),?,json_extract(value,'$.title'),json_extract(value,'$.date.startsAt'),json_extract(value,'$.instance.size'),'',
   json_extract(value,'$.settings'),?,?
  FROM json_each(?) WHERE EXISTS (
   SELECT 1 FROM raid_team_schedules WHERE id=? AND revision=? AND kind=? AND instance IS ? AND timezone=? AND days=?
  )
  ON CONFLICT(id) DO NOTHING`)
  .bind(row.owner,row.instance,row.creator_name,JSON.stringify(occurrences),row.id,row.revision,row.kind,row.instance,row.timezone,row.days);
}

export async function ensureTeamRaidSchedule(db,teamId=null,now=new Date()){
 const query='SELECT s.*,t.name AS team_name,t.region,t.ruleset FROM raid_team_schedules s JOIN raid_teams t ON t.id=s.team_id'+(teamId?' WHERE s.team_id=?':'');
 const schedules=(await db.prepare(query).bind(...(teamId?[teamId]:[])).all()).results;
 for(const row of schedules){
  if(row.kind==='Off night')continue;
  const existing=new Set((await db.prepare("SELECT id FROM raids WHERE json_extract(settings,'$.teamSchedule.id')=? AND starts_at>?").bind(row.id,now.toISOString()).all()).results.map(raid=>raid.id));
  const occurrences=await teamScheduleOccurrences(row,now);
  const missing=occurrences.filter(event=>!existing.has(event.id));
  if(missing.length)await insertOccurrences(db,row,missing).run();
 }
}

export async function changeTeamSchedule(db,team,session,input) {
 const remove=input.action==='deleteSchedule';
 const editing=input.action==='editSchedule';
 const schedule=remove?null:validateTeamSchedule(input);
 if(!remove&&!schedule)return {error:'Choose raid days, valid times, a time zone and a raid instance.',status:400};
 const id=remove||editing?input.scheduleId:crypto.randomUUID();
 if(typeof id!=='string'||!(/^[0-9a-f-]{36}$/i).test(id))return {error:'Choose a valid schedule.',status:400};
 const now=new Date();
 const teamId=team.id;
 const old=remove||editing?await db.prepare('SELECT * FROM raid_team_schedules WHERE team_id=? AND id=?').bind(teamId,id).first():null;
 if((remove||editing)&&!old)return {error:'Schedule not found.',status:404};
 if(old&&input.revision!==old.revision)return {error:'The schedule changed. Refresh the team before trying again.',status:409};
 const days=schedule?JSON.stringify(schedule.days):null;
 const duplicate=schedule?await db.prepare(
  'SELECT id FROM raid_team_schedules WHERE team_id=? AND id<>? AND kind=? AND instance IS ? AND timezone=? AND days=?'
 ).bind(teamId,id,schedule.kind,schedule.instance,schedule.timezone,days).first():null;
 if(duplicate)return {error:'This team already has an identical schedule.',status:409};

 if(remove){
  const results=await db.batch([
   db.prepare(`UPDATE raids SET state='Cancelled'
    WHERE starts_at>? AND state<>'Cancelled' AND json_extract(settings,'$.teamSchedule.id')=?
    AND EXISTS (SELECT 1 FROM raid_team_schedules WHERE id=? AND team_id=? AND revision=?)`)
    .bind(now.toISOString(),id,id,teamId,old.revision),
   db.prepare('DELETE FROM raid_team_schedules WHERE id=? AND team_id=? AND revision=?').bind(id,teamId,old.revision),
  ]);
  return results[1].meta.changes?{id}:{error:'The schedule changed. Refresh the team before trying again.',status:409};
 }

 const row={...schedule,id,days,team_id:teamId,team_name:team.name,region:team.region,ruleset:team.ruleset,
  revision:old?old.revision+1:0,owner:old?.owner??session.discord_id,creator_name:old?.creator_name??session.display_name??'Team leader'};
 const occurrences=await teamScheduleOccurrences(row,now);
 const statements=[old?
  db.prepare('UPDATE raid_team_schedules SET kind=?,instance=?,timezone=?,days=?,revision=? WHERE id=? AND team_id=? AND revision=?')
   .bind(row.kind,row.instance,row.timezone,row.days,row.revision,id,teamId,old.revision):
  db.prepare('INSERT INTO raid_team_schedules(id,team_id,kind,instance,timezone,days,owner,creator_name) VALUES(?,?,?,?,?,?,?,?)')
   .bind(id,teamId,row.kind,row.instance,row.timezone,row.days,row.owner,row.creator_name)];
 if(editing){
  // Checking changes() after updating the schedule makes a stale edit a no-op. Subsequent statements
  // use the write lock held by the batch and the revision check below.
  statements.push(db.prepare(`UPDATE raids SET state='Cancelled',settings=json_set(settings,'$.teamSchedule.removed',1)
   WHERE starts_at>? AND state<>'Cancelled' AND json_extract(settings,'$.teamSchedule.id')=?
   AND id NOT IN (SELECT value FROM json_each(?)) AND changes()>0`)
   .bind(now.toISOString(),id,JSON.stringify(occurrences.map(event=>event.id))));
  if(occurrences.length){
   statements.push(db.prepare(`UPDATE raids SET title=json_extract(event.value,'$.title'),
    starts_at=json_extract(event.value,'$.date.startsAt'),instance=?,size=json_extract(event.value,'$.instance.size'),
    state=CASE WHEN json_extract(settings,'$.teamSchedule.removed')=1 THEN 'Open' ELSE state END,
    settings=json_set(settings,'$.team',json_extract(event.value,'$.settings.team'),
     '$.teamSchedule',json_extract(event.value,'$.settings.teamSchedule'),'$.endsAt',json_extract(event.value,'$.date.endsAt'))
    FROM json_each(?) event
    WHERE raids.id=json_extract(event.value,'$.id') AND starts_at>?
    AND (state<>'Cancelled' OR json_extract(settings,'$.teamSchedule.removed')=1)
    AND EXISTS (SELECT 1 FROM raid_team_schedules WHERE id=? AND revision=? AND kind=? AND instance IS ? AND timezone=? AND days=?)`)
    .bind(row.instance,JSON.stringify(occurrences),now.toISOString(),id,row.revision,row.kind,row.instance,row.timezone,row.days));
   statements.push(db.prepare(`UPDATE raid_signups SET group_no=NULL WHERE EXISTS (
    SELECT 1 FROM raids WHERE raids.id=raid_signups.raid_id AND starts_at>? AND state<>'Cancelled'
    AND json_extract(settings,'$.teamSchedule.id')=? AND raid_signups.group_no>raids.size/5
   ) AND EXISTS (SELECT 1 FROM raid_team_schedules WHERE id=? AND revision=? AND kind=? AND instance IS ? AND timezone=? AND days=?)`)
    .bind(now.toISOString(),id,id,row.revision,row.kind,row.instance,row.timezone,row.days));
  }
 }
 if(occurrences.length)statements.push(insertOccurrences(db,row,occurrences));
 try{
  const [result]=await db.batch(statements);
  return result.meta.changes?{id}:{error:'The schedule changed. Refresh the team before trying again.',status:409};
 }catch(error){
  if(String(error.message).includes('raid_team_schedule_definition'))return {error:'This team already has an identical schedule.',status:409};
  throw error;
 }
}
