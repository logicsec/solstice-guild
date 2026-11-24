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
 return {kind:input.kind,timezone:input.timezone,instance:instance?input.instance:null,days:input.days.map(({day,start,end})=>({day,start,end}))};
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
export async function ensureTeamRaidSchedule(db,teamId=null,now=new Date()){
 const query='SELECT s.*,t.name AS team_name,t.region,t.ruleset FROM raid_team_schedules s JOIN raid_teams t ON t.id=s.team_id'+(teamId?' WHERE s.team_id=?':'')+' LIMIT 1000';
 const schedules=(await db.prepare(query).bind(...(teamId?[teamId]:[])).all()).results;
 for(const row of schedules){if(row.kind==='Off night')continue;const instance=raidInstance(row.instance);if(!instance)continue;
  const schedule={...row,days:JSON.parse(row.days)},statements=[];
  const existing=new Set((await db.prepare("SELECT id FROM raids WHERE json_extract(settings,'$.teamSchedule.id')=? AND starts_at>?").bind(row.id,now.toISOString()).all()).results.map(raid=>raid.id));
  for(const date of scheduledTeamDates(schedule,now)){
   const id=await occurrenceId(row.id,date.date);if(existing.has(id))continue;
   const settings={team:{id:row.team_id,name:row.team_name,region:row.region,ruleset:row.ruleset},teamSchedule:{id:row.id,kind:row.kind,date:date.date,timezone:row.timezone},endsAt:date.endsAt,groupPlan:[],roles:null,review:false,waitlist:false,requirements:'',softReserve:''};
   statements.push(db.prepare('INSERT INTO raids(id,owner,title,starts_at,size,notes,settings,instance,creator_name) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,row.owner,row.team_name+' · '+row.kind+' · '+instance.name,date.startsAt,instance.size,'',JSON.stringify(settings),row.instance,row.creator_name));
  }
  if(statements.length)await db.batch(statements);
 }
}
