import assert from 'node:assert/strict';
import test from 'node:test';
import {renderGuildEvents} from '../src/guild-events-client.js';

// Small DOM fixture exercises date rendering and interactions without a browser.
class Element {
  constructor(tag='span',text=''){this.tagName=tag;this.textContent=text;this.children=[];this.attributes={};this.listeners={};this.style={setProperty(){}};this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
  append(...items){this.children.push(...items.map(item=>typeof item==='string'?new Element('text',item):item));}
  replaceChildren(...items){this.children=[];this.append(...items);}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,callback){this.listeners[name]=callback;}
  focus(){}
  get elements(){return{eventType:{value:'Dungeon'}};}
  get childNodes(){return this.children;}
}
const all=root=>[root,...root.children.flatMap(all)];
const find=(root,condition)=>all(root).find(condition);

test('calendar renders one month grid, event previews and selectable days with month navigation',async()=>{
  const document={createElement:tag=>new Element(tag),createTextNode:text=>new Element('text',text),getElementById:()=>null};
  const picker=()=>({element:new Element('details'),reset(){},focus(){},hasDate:()=>false,value:()=>null});
  const render=new Function('document','Option','createSchedulePicker','tablerIcon','return ('+renderGuildEvents.toString()+')')(document,Element,picker,()=>new Element('svg'));
  const root=new Element('main');
  const now=new Date(Date.now()+86400000);
  const title='Guild dungeon night';
  render(root,{eventTypes:{Raid:'#236dc9',Dungeon:'#7b70ef'},raidInstances:{},request:async(path,data)=>data?.action==='signup'?{joined:true,signups:1}:({events:[{id:'event-1',organizer:1,title,type:'Dungeon',starts_at:now.toISOString(),ends_at:new Date(+now+3600000).toISOString(),created_by:'Astra'}]}),createRaid(){},openRaid(){}});
  await new Promise(resolve=>setImmediate(resolve));
  const calendar=find(root,e=>e.className==='raid-card guild-events-calendar');
  assert.equal(root.children[0].children[0],calendar,'month calendar is the primary panel');
  const days=find(calendar,e=>e.className==='raid-calendar-days');
  assert.equal(days.children.length,42);
  assert.ok(find(days,e=>e.className==='guild-calendar-preview'&&e.textContent===title),'month grid shows event names');
  const week=find(root,e=>e.className==='guild-agenda-week');
  assert.equal(week.children.length,7,'agenda has a compact week strip');
  assert.equal(find(root,e=>e.attributes['aria-label']==='View all upcoming events').textContent,'View all');
  const eventRow=find(root,e=>e.className==='guild-event-row');
  const main=find(eventRow,e=>e.className==='guild-event-main');
  assert.ok(find(main,e=>e.tagName==='strong'&&e.textContent===title),'event title belongs in the main line');
  assert.ok(find(main,e=>e.className==='guild-event-time'),'time range stays beside the event details');
  const footer=find(eventRow,e=>e.className==='guild-event-footer');
  const signup=find(footer,e=>e.tagName==='button'&&e.textContent==='Sign up');
  assert.ok(signup,'sign-up action is separated into the footer');
  assert.ok(find(footer,e=>e.tagName==='button'&&e.textContent==='Delete event'),'creator can delete from the Events page');
  await signup.listeners.click();
  assert.equal(find(footer,e=>e.className==='guild-event-count').textContent,'1 signed up');
  week.children[0].listeners.click();
  assert.equal(week.children[0].attributes['aria-pressed'],'true');

  find(root,e=>e.attributes['aria-label']==='View all upcoming events').listeners.click();
  assert.ok(find(root,e=>e.className==='guild-event-row'),'View all restores the upcoming list');
  const form=find(root,e=>e.id==='planGuildEvent');
  assert.equal(form.hidden,true,'event form is closed until requested');
  const current=days.children.find(e=>e.attributes['aria-current']==='date');
  current.listeners.click();
  assert.ok(days.children.some(e=>e.attributes['aria-pressed']==='true'),'choosing a date selects it');
  const heading=find(calendar,e=>e.className==='guild-calendar-month-title');
  const initial=heading.children.at(-1).textContent;
  find(calendar,e=>e.attributes['aria-label']==='Next month').listeners.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.notEqual(heading.children.at(-1).textContent,initial);
  find(calendar,e=>e.attributes['aria-label']==='Show current month').listeners.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(heading.children.at(-1).textContent,initial);
  form.hidden=false;find(form,e=>e.attributes['aria-label']==='Close event form').listeners.click();assert.equal(form.hidden,true);
});

test('dashboard uses the same agenda renderer, limits events and opens the full calendar',async()=>{
  const document={createElement:tag=>new Element(tag),createTextNode:text=>new Element('text',text),getElementById:()=>null};
  const picker=()=>({element:new Element('details'),reset(){},focus(){},hasDate:()=>false,value:()=>null});
  const render=new Function('document','Option','createSchedulePicker','tablerIcon','return ('+renderGuildEvents.toString()+')')(document,Element,picker,()=>new Element('svg'));
  const events=Array.from({length:7},(_,i)=>({id:String(i),title:'Event '+i,type:'Dungeon',starts_at:new Date(Date.now()+(i+1)*3600000).toISOString()})).reverse();
  const root=new Element('div');let opened=0;
  render(root,{eventTypes:{Dungeon:'#7b70ef'},raidInstances:{},request:async()=>({events:events.map(event=>({...event,organizer:1}))}),createRaid(){},openRaid(){},agendaOnly:true,limit:5,onViewAll:()=>opened++});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(root.children[0].className,'raid-card guild-events-agenda');
  assert.equal(find(root,e=>e.className==='guild-agenda-week').children.length,7);
  assert.equal(all(root).filter(e=>e.className==='guild-event-row').length,5);
  assert.ok(find(root,e=>e.tagName==='strong'&&e.textContent==='Event 0'),'earliest events are kept');
  assert.equal(find(root,e=>e.tagName==='strong'&&e.textContent==='Event 6'),undefined);
  assert.equal(find(root,e=>e.className==='raid-calendar-days'),undefined,'dashboard contains only the shared agenda');
  assert.equal(find(root,e=>e.id==='planGuildEvent'),undefined);
  assert.equal(find(root,e=>e.tagName==='button'&&e.textContent==='Delete event'),undefined,'dashboard hides deletion even for event creators');
  find(root,e=>e.attributes['aria-label']==='View all upcoming events').listeners.click();
  assert.equal(opened,1);
});

test('raid events load team choices, send the chosen team and hide it for non-raid events',async()=>{
  let type='Dungeon', loads=0, created;
  const document={createElement:tag=>new Element(tag),createTextNode:text=>new Element('text',text),getElementById:()=>null};
  const first=new Date(Date.now()+86400000);
  let pickers=0;
  const picker=()=>{const start=pickers++===0;return{element:new Element('details'),reset(){},focus(){},hasDate:()=>start,value:()=>start?first:null};};
  const Option=class extends Element{constructor(text,value){super('option',text);this.value=value;}};
  const render=new Function('document','Option','createSchedulePicker','tablerIcon','return ('+renderGuildEvents.toString()+')')(document,Option,picker,()=>new Element('svg'));
  const root=new Element('main');
  render(root,{eventTypes:{Raid:'#236dc9',Dungeon:'#7b70ef'},raidInstances:{test:{name:'Test raid',size:20}},request:async()=>({events:[]}),loadTeams:async()=>{loads++;return{teams:[{id:'team-a',name:'Team A'}]};},createRaid:async input=>{created=input;return{count:1};},openRaid(){}});
  const form=find(root,e=>e.id==='planGuildEvent');
  Object.defineProperty(form,'elements',{get:()=>({eventType:{value:type}})});
  const team=find(form,e=>e.attributes['aria-label']==='Raid team');
  const teamField=find(form,e=>e.tagName==='label'&&e.textContent==='Raid team');
  assert.equal(teamField.hidden,true);
  assert.equal(loads,0,'teams are not fetched for dungeon events');
  const radios=all(form).filter(e=>e.name==='eventType');
  type='Raid';await radios.find(e=>e.value==='Raid').listeners.change();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(teamField.hidden,false);
  assert.equal(team.children[1].textContent,'Team A');
  assert.equal(team.disabled,false);
  team.value='team-a';
  find(form,e=>e.tagName==='select'&&e.children.some(c=>c.textContent==='Test raid')).value='test';
  find(form,e=>e.tagName==='select'&&e.children.some(c=>c.textContent==='Does not repeat')).value='1';
  find(form,e=>e.tagName==='textarea').value='';
  find(form,e=>e.placeholder==='Defaults to the raid name').value='';
  form.reset=()=>{type='Dungeon';team.value='';};
  await form.listeners.submit({preventDefault(){}});
  assert.equal(created.teamId,'team-a');
  assert.equal(created.instance,'test');
  assert.equal(teamField.hidden,true,'successful submission resets to the default event type');
  type='Raid';radios.find(e=>e.value==='Raid').listeners.change();
  assert.equal(loads,1,'loaded team choices are reused');
  type='Dungeon';radios.find(e=>e.value==='Dungeon').listeners.change();
  assert.equal(teamField.hidden,true);
  assert.equal(team.disabled,true);
});
