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
  const specs={Mage:[['Arcane','Ranged DPS']]};
  const render=new Function('document','Option','location','history','tablerIcon','guildIcon','raidTeamSummary','return ('+renderRaidTeams.toString()+')')(document,class extends Element{constructor(text,value){super('option',text);this.value=String(value);}},location,history,()=>new Element('svg'),()=>new Element('span'),raidTeamSummary);
  const member={key:'blizzard:100',name:'Astra Mortis',slug:'astra-mortis',className:'Mage',spec:'Arcane',role:'Ranged DPS',level:60,itemLevel:null,rank:1};
  const team={id:'team-id',name:'Progression',size:20,accent:'#7b70ef',canEdit:true,description:''};
  let created=false;let members=[];
  const request=async(path='',input)=>{
    if(input?.action==='create'){created=true;return{id:team.id};}
    if(input?.action==='assign'){members=[{...member,isMain:true,inGuild:true}];return{ok:true};}
    if(path.startsWith('?team='))return{team,roster:{guild:'Solstice',characters:[member],source:'blizzard'},members:structuredClone(members)};
    return{teams:created?[team]:[]};
  };
  const root=new Element('div');await render(root,{request,specs});
  find(root,e=>e.textContent==='+ New team').listeners.click();
  const dialog=find(root,e=>e.className==='team-edit-dialog');assert.equal(dialog.open,true);
  find(dialog,e=>e.attributes['aria-label']==='Team name').value='Progression';
  await find(dialog,e=>e.tagName==='form').listeners.submit({preventDefault(){}});
  assert.equal(dialog.open,false);assert.ok(find(root,e=>e.className==='raid-card team-summary'));
  find(root,e=>e.tagName==='button'&&find(e,c=>c.textContent==='Guild Roster')).listeners.click();
  const checkbox=find(root,e=>e.attributes['aria-label']==='Select Astra Mortis');checkbox.checked=true;checkbox.listeners.change();
  await find(root,e=>e.textContent==='Assign to team').listeners.click();
  assert.equal(members.length,1);assert.ok(find(root,e=>e.textContent==='On team'));
  assert.ok(find(root,e=>e.className==='team-summary-label'&&find(e,c=>c.textContent==='1 mains')));
});
