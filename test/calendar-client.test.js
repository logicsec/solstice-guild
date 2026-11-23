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
  const now=new Date();now.setHours(18,0,0,0);
  const title='Guild dungeon night';
  render(root,{eventTypes:{Raid:'#236dc9',Dungeon:'#7b70ef'},raidInstances:{},request:async()=>({events:[{id:'event-1',title,type:'Dungeon',starts_at:now.toISOString()}]}),createRaid(){},openRaid(){}});
  await new Promise(resolve=>setImmediate(resolve));
  const calendar=find(root,e=>e.className==='raid-card guild-events-calendar');
  assert.equal(root.children[0].children[0],calendar,'month calendar is the primary panel');
  const days=find(calendar,e=>e.className==='raid-calendar-days');
  assert.equal(days.children.length,42);
  assert.ok(find(days,e=>e.className==='guild-calendar-preview'&&e.textContent===title),'month grid shows event names');
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
