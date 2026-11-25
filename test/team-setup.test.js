import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {raidTeamsApi} from '../src/raid-teams-api.js';
import {scheduledTeamDates,teamLocalInstant,validateTeamSchedule,ensureTeamRaidSchedule} from '../src/team-schedules.js';

test('weekly schedules preserve local hours across DST and reject invalid or duplicate nights',()=>{
 const input={kind:'Progress',instance:'hyjal-summit',timezone:'America/New_York',days:[{day:0,start:'20:00',end:'23:00'}]};
 assert.ok(validateTeamSchedule(input));
 assert.equal(validateTeamSchedule({...input,days:[input.days[0],input.days[0]]}),null);
 assert.equal(validateTeamSchedule({...input,timezone:'Not/AZone'}),null);
 assert.equal(validateTeamSchedule({...input,days:[{day:1,start:'25:00',end:'23:00'}]}),null);
 const dates=scheduledTeamDates(input,new Date('2027-03-01T12:00:00Z'));
 assert.equal(dates.length,8);
 assert.equal(dates[0].startsAt,'2027-03-08T01:00:00.000Z');
 assert.equal(dates[1].startsAt,'2027-03-15T00:00:00.000Z');
 assert.equal(teamLocalInstant('2027-03-14','02:30','America/New_York'),null,'nonexistent spring-forward times are not silently shifted');
 const overnight=scheduledTeamDates({...input,days:[{day:0,start:'23:00',end:'01:00'}]},new Date('2027-03-01T12:00:00Z'));
 assert.ok(overnight.every(date=>Date.parse(date.endsAt)>Date.parse(date.startsAt)));
});

test('team setup isolates regional guilds, verifies rulesets, enforces roles and creates repeat raids once',async t=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort())sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 const db={prepare(sql){const s=sqlite.prepare(sql);return{bind(...args){return{first:async()=>s.get(...args),all:async()=>({results:s.all(...args)}),run:async()=>({meta:s.run(...args)})}}}},batch:async statements=>Promise.all(statements.map(s=>s.run()))};
 const env={DB:db,BLIZZARD_CLIENT_ID:'setup-tests',BLIZZARD_CLIENT_SECRET:'test'};let guildRuleset=2;
 t.mock.method(globalThis,'fetch',async url=>{
  if(url==='https://oauth.battle.net/token')return Response.json({access_token:'token',expires_in:3600});
  const parsed=new URL(url);assert.equal(parsed.hostname,'eu.api.blizzard.com','team guild requests use the selected region');
  if(parsed.pathname==='/data/wow/guild/solstice')return Response.json({name:'Solstice',ruleset:{id:guildRuleset}});
  if(parsed.pathname==='/data/wow/guild/solstice/roster')return Response.json({guild:{name:'Solstice'},members:[{character:{id:999,name:'Europe',surname:'Mage',slug:'europe-mage',level:60,playable_class:{id:8}},rank:1}]});
  if(parsed.pathname==='/data/wow/playable-race/index')return Response.json({races:[]});
  return new Response(null,{status:404});
 });
 const send=(id,input,user='leader')=>{const url=new URL('https://solsticeguild.net/api/raid-teams'+(id?'?team='+id:''));return raidTeamsApi(new Request(url,input?{method:'POST',headers:{Origin:url.origin,'Content-Type':'application/json'},body:JSON.stringify(input)}:{}),env,url,{discord_id:user,display_name:'Leader'});};
 try{
  const draft={action:'create',name:'EU PvP',description:'',size:20,accent:'#56789a',region:'eu',ruleset:1};
  assert.equal((await send(null,{...draft,region:'kr',ruleset:15})).status,400);
  const created=await send(null,draft);assert.equal(created.status,201);const {id}=await created.json();
  let data=await (await send(id)).json();assert.equal(data.team.region,'eu');assert.equal(data.team.ruleset,1);assert.equal(data.roster.source,'unlinked');assert.equal(data.roster.characters.length,0);
  assert.equal((await send(id,{action:'linkGuild',guild:'Solstice'})).status,400,'a different ruleset cannot be linked');
  guildRuleset=1;assert.equal((await send(id,{action:'linkGuild',guild:'Solstice'})).status,200);
  data=await (await send(id)).json();assert.equal(data.team.guildName,'Solstice');assert.equal(data.roster.characters[0].name,'Europe Mage');
  assert.ok(sqlite.prepare('SELECT payload FROM guild_roster_snapshots WHERE guild_slug=?').get('eu:solstice'));
  assert.equal((await send(id,{action:'join'},'raider')).status,200);
  assert.equal((await send(id,{action:'assign',characters:['blizzard:999']},'raider')).status,403);
  assert.equal((await send(id,{action:'permissions',defaultRole:'Editor'})).status,200);
  assert.equal((await send(id,{action:'join'},'editor')).status,200);
  assert.equal((await send(id,{action:'assign',characters:['blizzard:999']},'editor')).status,200);
  assert.equal((await send(id,{action:'permissions',defaultRole:'Officer'},'editor')).status,403);
  assert.equal((await send(id,{action:'linkGuild',guild:'Solstice'},'editor')).status,403);
  const schedule={kind:'Progress',instance:'hyjal-summit',timezone:'America/New_York',days:[{day:2,start:'20:00',end:'23:00'},{day:4,start:'19:00',end:'22:00'}]};
  const preview=await send(id,{action:'previewSchedule',...schedule},'editor');assert.equal(preview.status,200);const dates=(await preview.json()).dates;assert.ok(dates.length>=15&&dates.length<=16);
  assert.equal((await send(id,{action:'schedule',...schedule},'raider')).status,403);
  assert.equal((await send(id,{action:'schedule',...schedule},'editor')).status,200);
  const count=sqlite.prepare('SELECT COUNT(*) AS n FROM raids').get().n;assert.equal(count,dates.length);
  await ensureTeamRaidSchedule(db,id);await ensureTeamRaidSchedule(db,id);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM raids').get().n,count,'calendar refresh cannot duplicate generated raids');
  const settings=JSON.parse(sqlite.prepare('SELECT settings FROM raids LIMIT 1').get().settings);assert.equal(settings.team.id,id);assert.equal(settings.team.region,'eu');assert.equal(settings.teamSchedule.kind,'Progress');assert.ok(settings.endsAt);
  assert.equal((await send(id,{action:'schedule',...schedule},'editor')).status,409);
  assert.equal((await send(id,{action:'schedule',...schedule,kind:'Off night'},'editor')).status,200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM raids').get().n,count,'off nights do not create raid events');
  const extra={...schedule,days:[{day:6,start:'19:00',end:'22:00'}]};
  const added=await send(id,{action:'schedule',...extra},'editor');
  assert.equal(added.status,200,'multiple Progress schedules are supported');
  const {id:extraId}=await added.json();
  const upcoming=()=>sqlite.prepare("SELECT * FROM raids WHERE json_extract(settings,'$.teamSchedule.id')=? AND state<>'Cancelled' ORDER BY starts_at").all(extraId);
  const [original,past]=upcoming();
  sqlite.prepare("INSERT INTO raid_signups(raid_id,member,character,class_name,role,status) VALUES (?, 'raider', 'Europe Mage', 'Mage', 'Ranged DPS', 'Going')").run(original.id);
  sqlite.prepare('UPDATE raids SET starts_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',past.id);
  const revised={...extra,days:[{day:6,start:'20:00',end:'23:00'}],scheduleId:extraId,revision:0};
  assert.equal((await send(id,{action:'editSchedule',...revised},'raider')).status,403);
  assert.equal((await send(id,{action:'editSchedule',...revised},'editor')).status,200);
  const changed=sqlite.prepare('SELECT * FROM raids WHERE id=?').get(original.id);
  assert.equal(Date.parse(changed.starts_at)-Date.parse(original.starts_at),3600000);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM raid_signups WHERE raid_id=?').get(original.id).n,1);
  assert.equal((await send(id,{action:'deleteSchedule',scheduleId:extraId,revision:0},'editor')).status,409);
  assert.equal((await send(id,{action:'deleteSchedule',scheduleId:extraId,revision:1},'raider')).status,403);
  assert.equal((await send(id,{action:'deleteSchedule',scheduleId:extraId,revision:1},'editor')).status,200);
  await ensureTeamRaidSchedule(db,id);
  assert.deepEqual(upcoming().map(event=>event.id),[past.id],'deleted schedules do not refill and past dates stay visible');
  assert.equal(sqlite.prepare('SELECT state FROM raids WHERE id=?').get(original.id).state,'Cancelled');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM raid_signups WHERE raid_id=?').get(original.id).n,1);
  const totalBeforeTeamDeletion=sqlite.prepare('SELECT COUNT(*) AS n FROM raids').get().n;

  assert.equal((await send(id,{action:'permissions',defaultRole:'Officer'})).status,200);
  assert.equal((await send(id,{action:'join'},'officer')).status,200);
  assert.equal((await send(id,{action:'settings',name:'Updated by officer',description:'',size:20,accent:'#56789a'},'officer')).status,200);

  data=await (await send(id,null,'editor')).json();assert.equal(data.team.canEdit,true);assert.equal(data.team.canManage,false);assert.equal(data.setup.joined,true);assert.equal(data.setup.permissionConfirmed,true);assert.equal(data.setup.schedules.length,2);
  assert.equal(data.team.isOwner,false);
  assert.equal((await send(id,{action:'delete',confirmName:'Updated by officer'},'officer')).status,403,'officers cannot delete a team');
  assert.equal((await send(id,{action:'delete',confirmName:'Updated by officer'},'raider')).status,403);
  assert.equal((await send(id,{action:'delete',confirmName:'Old name'})).status,409,'a stale confirmation cannot delete a renamed team');
  assert.equal((await send(id,{action:'delete',confirmName:'Updated by officer'})).status,200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM raid_teams WHERE id=?').get(id).n,0);
  for(const table of ['raid_team_members','raid_team_people','raid_team_schedules'])assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM '+table+' WHERE team_id=?').get(id).n,0,'deletion cascades to '+table);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM raids').get().n,totalBeforeTeamDeletion,'existing raid events are preserved');
  assert.equal((await send(id)).status,404);

 }finally{sqlite.close();}
});
