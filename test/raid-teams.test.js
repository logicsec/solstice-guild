import {matchesGuildRosterFilter} from '../src/guild-roster-filters.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {raidTeamsApi} from '../src/raid-teams-api.js';
import {raidTeamSummary} from '../src/raid-teams-client.js';
import {parseGuildRoster} from '../src/armory.js';

const roster={guild:{name:'Solstice'},members:[
  {character:{id:100,name:'Astra',surname:'Mortis',slug:'astra-mortis',level:60,playable_class:{id:8},playable_race:{id:1}},rank:0},
  {character:{id:101,name:'Lowbie',surname:'Warrior',slug:'lowbie-warrior',level:1,playable_class:{id:1},playable_race:{id:42}},rank:5},
]};
test('Forever roster retains unlinked low-level characters, full names, classes and GM rank',()=>{
  const result=parseGuildRoster(roster);assert.equal(result.characters.length,2);
  assert.deepEqual(result.characters[0],{key:'blizzard:100',name:'Astra Mortis',slug:'astra-mortis',className:'Mage',race:'Human',level:60,rank:0,spec:'',role:'',itemLevel:null});
  assert.equal(result.characters[1].level,1);
});
test('raid team summary distinguishes mains and alts, unknown roles and missing item levels',()=>{
  const members=[{className:'Mage',role:'Ranged DPS',isMain:true,itemLevel:50},{className:'Priest',role:'Healer',isMain:true,itemLevel:null},{className:'Warrior',role:'',isMain:false,itemLevel:0}];
  const mains=raidTeamSummary(members);assert.equal(mains.total,2);assert.equal(mains.roles['Healer'],1);assert.equal(mains.armor.find(row=>row.name==='Cloth').count,2);assert.equal(mains.itemLevels.average,50);assert.equal(mains.itemLevels.known,1);
  const all=raidTeamSummary(members,false);assert.equal(all.total,3);assert.equal(all.roles['Not set'],1);assert.equal(all.itemLevels.average,25);assert.equal(all.armor.find(row=>row.name==='Plate').count,1);
  assert.equal(raidTeamSummary([]).itemLevels.average,null);
});
test('guild teams support bulk assignment, edits, mains/alts and enforce leader-only writes',async t=>{
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort())sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const db={prepare(sql){const statement=sqlite.prepare(sql);return{bind(...args){return{first:()=>statement.get(...args),all:()=>({results:statement.all(...args)}),run:()=>({meta:statement.run(...args)})}}}},batch:async statements=>statements.map(statement=>statement.run())};
  const env={DB:db,BLIZZARD_CLIENT_ID:'team-test',BLIZZARD_CLIENT_SECRET:'test'};
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url==='https://oauth.battle.net/token')return Response.json({access_token:'team-token',expires_in:3600});
    if(url==='https://us.api.blizzard.com/data/wow/playable-race/index?namespace=static-forever-us&locale=en_US')return Response.json({races:[{id:1,name:'Human'},{id:42,name:'Skyborne'}]});
    if(url==='https://us.api.blizzard.com/data/wow/guild/solstice?namespace=profile-forever-us&locale=en_US')return Response.json({name:'Solstice',ruleset:{id:2}});
    assert.equal(url,'https://us.api.blizzard.com/data/wow/guild/solstice/roster?namespace=profile-forever-us&locale=en_US');
    assert.equal(options.headers.Authorization,'Bearer team-token');return Response.json(roster);
  });
  const send=(query='',input=null,user='leader',origin='https://solsticeguild.net')=>{
    const url=new URL('https://solsticeguild.net/api/raid-teams'+query);
    return raidTeamsApi(new Request(url,input?{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)}:{}),env,url,user?{discord_id:user}:null);
  };
  try{
    assert.equal((await send('',null,null)).status,401);
    const created=await send('',{action:'create',name:'Solstice',description:'Progression',size:20,accent:'#7b70ef'});assert.equal(created.status,201);const {id}=await created.json();const query='?team='+id;
    const listed=(await (await send('',null,'viewer')).json()).teams;assert.equal(listed.length,1);assert.equal(listed[0].canEdit,0);
    assert.equal((await (await send(query)).json()).roster.source,'unlinked');
    assert.equal((await send(query,{action:'linkGuild',guild:'Solstice'},'viewer')).status,403);
    assert.equal((await send(query,{action:'linkGuild',guild:'Solstice'})).status,200);
    const initial=await (await send(query)).json();assert.equal(initial.roster.source,'blizzard');assert.equal(initial.roster.characters.length,2);assert.equal(initial.members.length,0);assert.equal(initial.roster.characters[1].race,'Skyborne','race catalog resolves Forever-specific races');
    const selection={action:'assign',characters:['blizzard:100','blizzard:101']};
    assert.equal((await send(query,selection,'viewer')).status,403);
    assert.equal((await send(query,selection,'leader','https://evil.example')).status,403);
    assert.equal((await send(query,{action:'assign',characters:['unrecognized']})).status,400);
    assert.equal((await send(query,selection)).status,200);assert.equal((await send(query,selection)).status,200);
    let team=await (await send(query)).json();assert.equal(team.members.length,2,'repeated assignment cannot duplicate characters');
    const update={action:'update',character:'blizzard:100',spec:'Arcane',role:'Ranged DPS',isMain:false};
    assert.equal((await send(query,{...update,spec:'Holy'})).status,400);
    assert.equal((await send(query,update)).status,200);team=await (await send(query)).json();assert.equal(team.members.find(member=>member.key==='blizzard:100').isMain,false);
    assert.equal(team.members.find(member=>member.key==='blizzard:100').spec,'Arcane');
    assert.equal((await send(query,{action:'remove',character:'blizzard:100'},'viewer')).status,403);
    assert.equal((await send(query,{action:'remove',character:'blizzard:100'})).status,200);assert.equal((await (await send(query)).json()).members.length,1);
    assert.equal((await send(query,{action:'settings',name:'Renamed team',description:'',size:10,accent:'#112233'})).status,200);
    assert.equal((await (await send(query)).json()).team.name,'Renamed team');
  }finally{sqlite.close();}
});

class Element{
  constructor(tag='span',text=''){this.tagName=tag;this.textContent=text;this.children=[];this.dataset={};this.style={setProperty(){}};this.attributes={};this.listeners={};}
  append(...items){this.children.push(...items.map(item=>typeof item==='string'?new Element('text',item):item));}
  prepend(...items){this.children.unshift(...items);}
  replaceChildren(...items){this.children=[];this.append(...items);}
  add(option){this.append(option);}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,v){this.listeners[k]=v;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  focus(){}
  querySelector(){return null;}
  querySelectorAll(){return [];}
}
const all=root=>[root,...root.children.flatMap(all)];
const find=(root,predicate)=>all(root).find(predicate);

test('team workspace creates a team, assigns a guild character and updates the role summary',async()=>{
  const {renderRaidTeams}=await import('../src/raid-teams-client.js');
  const document={createElement:tag=>new Element(tag)};
  const location={href:'https://solsticeguild.net/?tool=raid&view=raiding',search:'?tool=raid&view=raiding'};
  const history={pushState(a,b,url){location.href=String(url);location.search=new URL(url).search;}};
  const specs={Mage:[['Arcane','Ranged DPS']],Warrior:[['Protection','Tank']]};
  const render=new Function('document','Option','location','history','tablerIcon','guildIcon','raidTeamSummary','matchesGuildRosterFilter','return ('+renderRaidTeams.toString()+')')(document,class extends Element{constructor(text,value){super('option',text);this.value=String(value);}},location,history,()=>new Element('svg'),()=>new Element('span'),raidTeamSummary,matchesGuildRosterFilter);
  const member={key:'blizzard:100',name:'Astra Mortis',slug:'astra-mortis',className:'Mage',race:'Human',spec:'Arcane',role:'Ranged DPS',level:60,itemLevel:null,rank:1};
  const team={id:'team-id',name:'Progression',size:20,accent:'#7b70ef',canEdit:true,description:''};
  let created=false;let members=[];
  const request=async(path='',input)=>{
    if(input?.action==='create'){created=true;return{id:team.id};}
    if(input?.action==='assign'){members=[{...member,isMain:true,inGuild:true}];return{ok:true};}
    if(path.startsWith('?team='))return{team,roster:{guild:'Solstice',characters:[member,{key:'blizzard:101',name:'Dwarf Warrior',className:'Warrior',race:'Dwarf',spec:'Protection',role:'Tank',level:20}],source:'blizzard'},members:structuredClone(members)};
    return{teams:created?[team]:[]};
  };
  const opened=[];const root=new Element('div');await render(root,{request,specs,openCharacter:(character,target)=>{opened.push(character);target.append(new Element('section','Character details'));}});
  find(root,e=>e.textContent==='+ New team').listeners.click();
  const dialog=find(root,e=>e.className==='team-edit-dialog');assert.equal(dialog.open,true);
  find(dialog,e=>e.attributes['aria-label']==='Team name').value='Progression';
  await find(dialog,e=>e.tagName==='form').listeners.submit({preventDefault(){}});
  assert.equal(dialog.open,false);assert.ok(find(root,e=>e.className==='team-setup'));
  find(root,e=>e.textContent==='Skip to my team').listeners.click();assert.ok(find(root,e=>e.className==='raid-card team-summary'));
  find(root,e=>e.tagName==='button'&&find(e,c=>c.textContent==='Guild Roster')).listeners.click();
  const checkbox=find(root,e=>e.attributes['aria-label']==='Select Astra Mortis');checkbox.checked=true;checkbox.listeners.change();
  await find(root,e=>e.textContent==='Assign to team').listeners.click();
  assert.equal(members.length,1);assert.ok(find(root,e=>e.textContent==='On team'));
  assert.ok(find(root,e=>e.className==='team-summary-label'&&find(e,c=>c.textContent==='1 mains')));
  find(root,e=>e.className==='team-filter-button').listeners.click();
  assert.equal(find(root,e=>e.className==='guild-roster-advanced team-filter-panel').hidden,false);
  const classFilter=find(root,e=>e.attributes['aria-label']==='Filter team roster by class');classFilter.value='Mage';classFilter.listeners.change();
  assert.ok(find(root,e=>e.textContent==='Showing 1 of 2 guild characters.'));
  const min=find(root,e=>e.attributes['aria-label']==='Minimum team character level');min.value='60';min.listeners.input();
  const max=find(root,e=>e.attributes['aria-label']==='Maximum team character level');max.value='60';max.listeners.input();
  const specFilter=find(root,e=>e.attributes['aria-label']==='Filter team roster by specialization');specFilter.value='Arcane';specFilter.listeners.change();
  assert.ok(find(root,e=>e.textContent==='Showing 1 of 2 guild characters.'));
  const raceFilter=find(root,e=>e.attributes['aria-label']==='Filter team roster by race');raceFilter.value='Dwarf';raceFilter.listeners.change();
  assert.ok(find(root,e=>e.textContent==='Showing 0 of 2 guild characters.'));
  find(root,e=>e.textContent==='Reset filters').listeners.click();
  assert.ok(find(root,e=>e.textContent==='Showing 2 of 2 guild characters.'));
  const workspace=find(root,e=>e.className==='team-workspace');
  const rows=find(root,e=>e.className==='team-table-scroll');rows.scrollTop=123;
  const before=location.href;
  find(root,e=>e.className==='team-character-link'&&e.textContent==='Astra Mortis').listeners.click();
  const characterDialog=find(root,e=>e.className==='team-character-dialog');
  assert.equal(characterDialog.open,true);
  assert.equal(opened[0].slug,'astra-mortis');
  assert.equal(location.href,before,'character inspection stays on the team URL');
  find(characterDialog,e=>e.textContent==='Back to team').listeners.click();
  assert.equal(characterDialog.open,false);
  assert.equal(find(root,e=>e.className==='team-workspace'),workspace,'team content is preserved rather than rebuilt');
  assert.equal(rows.scrollTop,123,'roster scroll position is preserved');

});

test('primary sidebar switches working teams, remembers selection and replaces the second menu',async()=>{
  const {renderRaidTeams}=await import('../src/raid-teams-client.js');
  const document={createElement:tag=>new Element(tag)};
  const location={href:'https://solsticeguild.net/?tool=raid&view=raiding&team=team-a&section=report',search:'?tool=raid&view=raiding&team=team-a&section=report'};
  const history={pushState(a,b,url){location.href=String(url);location.search=new URL(url).search;}};
  const stored=new Map();const localStorage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)};
  const render=new Function('document','Option','location','history','localStorage','tablerIcon','guildIcon','raidTeamSummary','matchesGuildRosterFilter','return ('+renderRaidTeams.toString()+')')(document,class extends Element{constructor(text,value){super('option',text);this.value=String(value);}},location,history,localStorage,()=>new Element('svg'),()=>new Element('span'),raidTeamSummary,matchesGuildRosterFilter);
  const teams=[{id:'team-a',name:'Team A',size:20,accent:'#7b70ef',canEdit:true},{id:'team-b',name:'Team B',size:20,accent:'#dba349',canEdit:true}];
  const request=async(path='')=>{
    const team=new URLSearchParams(path.slice(1)).get('team');
    return team?{team:teams.find(item=>item.id===team),roster:{characters:[],source:'blizzard'},members:[]}:{teams};
  };
  const root=new Element('main'),sidebar=new Element('div');let planned;
  const options={request,specs:{Mage:[['Arcane','Ranged DPS']]},navigationRoot:sidebar,renderPlanner:(target,id)=>{planned=id;}};
  await render(root,options);
  assert.equal(find(sidebar,e=>e.attributes['aria-label']==='Working raid team').value,'team-a');
  assert.equal(find(root,e=>e.className==='team-workspace').children.length,1,'main workspace contains only content');
  assert.equal(find(root,e=>e.className==='team-navigation'),undefined,'second navigation column is removed');
  assert.equal(find(sidebar,e=>e.textContent==='Guild Calendar'),undefined,'raid menu has no duplicate calendar');
  assert.equal(find(sidebar,e=>e.textContent==='Roster Report'),undefined);
  assert.equal(find(root,e=>e.textContent==='View full roster report'),undefined);
  assert.equal(new URLSearchParams(location.search).get('section'),'roster','old report links open the roster');
  assert.equal(find(sidebar,e=>e.tagName==='button'&&find(e,c=>c.textContent==='Roster')).attributes['aria-current'],'true');
  const select=find(sidebar,e=>e.attributes['aria-label']==='Working raid team');select.value='team-b';select.listeners.change();
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(find(root,e=>e.tagName==='h2'&&e.textContent==='Team B'));
  assert.equal(new URLSearchParams(location.search).get('section'),'roster','team switch starts at that team roster');
  assert.equal(stored.get('solstice-working-raid-team'),'team-b');
  find(sidebar,e=>e.tagName==='button'&&find(e,c=>c.textContent==='Group Planner')).listeners.click();
  assert.equal(planned,'team-b','planner receives the selected team');
  location.href='https://solsticeguild.net/?tool=raid&view=raiding';location.search='?tool=raid&view=raiding';
  await render(root,options);
  assert.equal(find(sidebar,e=>e.attributes['aria-label']==='Working raid team').value,'team-b','returning to Raiding restores the last working team');
  find(sidebar,e=>e.tagName==='button'&&find(e,c=>c.textContent==='All raid teams')).listeners.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(find(root,e=>e.tagName==='h2'&&e.textContent==='Raid Teams'));
  assert.equal(find(sidebar,e=>e.className==='team-menu-item'),undefined,'team tools are hidden without a selected team');
  await render(root,options);
  assert.ok(find(root,e=>e.tagName==='h2'&&e.textContent==='Raid Teams'),'explicit All raid teams route stays on team list after reload');
});

test('creation wizard selects region and ruleset, links a guild and previews and saves raid nights',async()=>{
 const {renderRaidTeams}=await import('../src/raid-teams-client.js');
 const document={createElement:tag=>new Element(tag)},location={href:'https://solsticeguild.net/?tool=raid&view=raiding',search:'?tool=raid&view=raiding'};
 const history={pushState(a,b,url){location.href=String(url);location.search=new URL(url).search;}};
 const render=new Function('document','Option','location','history','tablerIcon','guildIcon','raidTeamSummary','matchesGuildRosterFilter','return ('+renderRaidTeams.toString()+')')(document,class extends Element{constructor(text,value){super('option',text);this.value=String(value);}},location,history,()=>new Element('svg'),()=>new Element('span'),raidTeamSummary,matchesGuildRosterFilter);
 const team={id:'new-team',name:'RP team',size:20,accent:'#56789a',region:'eu',ruleset:15,guildSlug:null,guildName:null,canEdit:true,canManage:true,defaultRole:'Raider'};
 const setup={joined:false,permissionConfirmed:false,schedules:[]};let created=false,savedSchedule;
 const request=async(path='',input)=>{
  if(input?.action==='create'){assert.equal(input.region,'eu');assert.equal(input.ruleset,15);created=true;return{id:team.id};}
  if(input?.action==='linkGuild'){assert.equal(input.guild,'Solstice RP');team.guildSlug='solstice-rp';team.guildName='Solstice RP';return{ok:true};}
  if(input?.action==='join'){setup.joined=true;return{ok:true};}
  if(input?.action==='previewSchedule')return{dates:[{startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString()}]};
  if(input?.action==='schedule'){savedSchedule=input;setup.schedules=[{...input,id:'schedule'}];return{ok:true};}
  if(input?.action==='permissions'){team.defaultRole=input.defaultRole;setup.permissionConfirmed=true;return{ok:true};}
  if(path.startsWith('?team='))return{team,setup,roster:{guild:team.guildName,characters:[],source:team.guildSlug?'blizzard':'unlinked'},members:[]};
  return{teams:created?[team]:[]};
 };
 const root=new Element('main');await render(root,{request,specs:{Mage:[['Arcane','Ranged DPS']]},raidInstances:{'hyjal-summit':{name:'Hyjal Summit',size:20}}});
 find(root,e=>e.textContent==='+ New team').listeners.click();const create=find(root,e=>e.className==='team-edit-dialog');
 const region=find(create,e=>e.attributes['aria-label']==='Team region');region.value='kr';region.listeners.change();assert.equal(find(create,e=>e.attributes['aria-label']==='Team ruleset').children.length,2);
 region.value='eu';region.listeners.change();const ruleset=find(create,e=>e.attributes['aria-label']==='Team ruleset');ruleset.value='15';find(create,e=>e.attributes['aria-label']==='Team name').value='RP team';
 await find(create,e=>e.tagName==='form').listeners.submit({preventDefault(){}});
 assert.ok(find(root,e=>e.className==='team-setup'));assert.ok(find(root,e=>e.textContent==='EU · RP-PvP'));
 find(root,e=>e.attributes['aria-label']==='Guild name').value='Solstice RP';find(root,e=>e.className==='team-link-guild').listeners.submit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.ok(find(root,e=>e.textContent==='Solstice RP linked · 0 guild characters'));
 await find(root,e=>e.textContent==='Join this team').listeners.click();assert.ok(find(root,e=>e.textContent==='You are on this team.'));
 find(root,e=>e.textContent==='Set raid times').listeners.click();const dialog=find(root,e=>e.className==='team-schedule-dialog');assert.equal(dialog.open,true);
 const days=find(dialog,e=>e.className==='team-schedule-days');days.children[2].listeners.click();days.children[4].listeners.click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(find(dialog,e=>e.textContent==='Start raiding').disabled,false);
 await find(dialog,e=>e.tagName==='form').listeners.submit({preventDefault(){}});
 assert.equal(dialog.open,false);assert.deepEqual(savedSchedule.days.map(day=>day.day),[2,4]);assert.equal(savedSchedule.instance,'hyjal-summit');
 const permission=find(root,e=>e.attributes['aria-label']==='Default team member role');permission.value='Editor';await find(root,e=>e.textContent==='Save permissions').listeners.click();assert.equal(team.defaultRole,'Editor');assert.equal(setup.permissionConfirmed,true);
});

test('only creators see team deletion and confirmed deletion returns to the team list',async()=>{
 const {renderRaidTeams}=await import('../src/raid-teams-client.js');
 const document={createElement:tag=>new Element(tag)},location={href:'https://solsticeguild.net/?tool=raid&view=raiding&team=team-a&section=settings',search:'?tool=raid&view=raiding&team=team-a&section=settings'};
 const history={pushState(a,b,url){location.href=String(url);location.search=new URL(url).search;}};
 const stored=new Map([['solstice-working-raid-team','team-a']]);const localStorage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
 let approved=false,deleted=false,deletions=0;
 const window={confirm:message=>{assert.match(message,/Existing raid events will remain/);return approved;}};
 const render=new Function('document','Option','location','history','localStorage','window','tablerIcon','guildIcon','raidTeamSummary','matchesGuildRosterFilter','return ('+renderRaidTeams.toString()+')')(document,class extends Element{constructor(text,value){super('option',text);this.value=String(value);}},location,history,localStorage,window,()=>new Element('svg'),()=>new Element('span'),raidTeamSummary,matchesGuildRosterFilter);
 const team={id:'team-a',name:'Team A',description:'',size:20,accent:'#56789a',canEdit:true,canManage:true,isOwner:false};
 const request=async(path='',input)=>{if(input?.action==='delete'){assert.equal(input.confirmName,'Team A');deleted=true;deletions++;return{ok:true};}return path.startsWith('?team=')?{team,roster:{characters:[]},members:[]}:{teams:deleted?[]:[team]};};
 const root=new Element('main');await render(root,{request,specs:{}});
 assert.equal(find(root,e=>e.tagName==='button'&&e.textContent==='Delete team'),undefined,'an officer cannot see Delete team');
 team.isOwner=true;await render(root,{request,specs:{}});
 await find(root,e=>e.tagName==='button'&&e.textContent==='Delete team').listeners.click();assert.equal(deletions,0,'cancelling keeps the team');
 approved=true;await find(root,e=>e.tagName==='button'&&e.textContent==='Delete team').listeners.click();assert.equal(deletions,1);
 assert.ok(find(root,e=>e.tagName==='h2'&&e.textContent==='Raid Teams'));
 assert.equal(stored.has('solstice-working-raid-team'),false);assert.equal(new URLSearchParams(location.search).has('team'),false);
});
