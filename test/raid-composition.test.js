import assert from 'node:assert/strict';
import test from 'node:test';
import {createCompositionPlan,compositionBuffs,renderRaidComposition} from '../src/raid-composition.js';
import {armorySpecs} from '../src/armory.js';

test('composition placeholders start unassigned, enforce capacity, resize and restore safely',()=>{
  const plan=createCompositionPlan(armorySpecs);
  const ids=Array.from({length:6},()=>plan.add('Mage','Arcane'));
  assert.equal(plan.snapshot().players.filter(p=>p.group===null).length,6);
  for(const id of ids.slice(0,5))plan.move(id,1);
  assert.throws(()=>plan.move(ids[5],1),/full/);
  assert.equal(plan.snapshot().players.find(p=>p.id===ids[5]).group,null);
  plan.move(ids[0],null);plan.move(ids[5],1);
  plan.move(ids[0],4);plan.resize(10);
  assert.equal(plan.snapshot().players.find(p=>p.id===ids[0]).group,null);
  const restored=createCompositionPlan(armorySpecs,plan.snapshot());
  assert.deepEqual(restored.snapshot().players.map(({id,...p})=>p),plan.snapshot().players.map(({id,...p})=>p));
  assert.throws(()=>plan.add('__proto__','Arcane'),/valid class/);
  const sanitized=createCompositionPlan(armorySpecs,{size:20,players:[...plan.snapshot().players,{className:'Unknown',spec:'Unknown'},...Array.from({length:8},()=>({className:'Mage',spec:'Fire',group:1}))]});
  assert.equal(sanitized.snapshot().players.filter(p=>p.group===1).length,5);
  assert.ok(sanitized.snapshot().players.every(p=>p.className!=='Unknown'));
});

test('coverage ignores unassigned players, follows group movement and distinguishes spec buffs and exclusive choices',()=>{
  const plan=createCompositionPlan(armorySpecs);
  const buff=name=>compositionBuffs(plan.snapshot()).find(b=>b.name===name);
  const mage=plan.add('Mage','Arcane');assert.equal(buff('Arcane Intellect').covered,false);
  plan.move(mage,1);assert.equal(buff('Arcane Intellect').complete,true);
  const shaman=plan.add('Shaman','Restoration');plan.move(shaman,2);
  assert.deepEqual(buff('Mana Spring Totem').groups,[2]);assert.equal(buff('Mana Spring Totem').complete,false);
  assert.equal(buff('Windfury Totem').complete,true);assert.equal(buff('Grace of Air Totem').covered,false);
  plan.move(shaman,1);assert.deepEqual(buff('Mana Spring Totem').groups,[1]);assert.equal(buff('Mana Spring Totem').complete,true);
  plan.update(shaman,{air:'Grace of Air'});assert.equal(buff('Windfury Totem').covered,false);assert.equal(buff('Grace of Air Totem').complete,true);
  const paladin=plan.add('Paladin','Holy');plan.move(paladin,1);
  assert.equal(buff('Blessing of Kings').covered,true);assert.equal(buff('Blessing of Might').covered,false);
  plan.update(paladin,{blessing:'Might'});assert.equal(buff('Blessing of Kings').covered,false);assert.equal(buff('Blessing of Might').covered,true);
  const druid=plan.add('Druid','Restoration');plan.move(druid,1);assert.equal(buff('Mark of the Wild').covered,true);assert.equal(buff('Moonkin Aura').covered,false);
  const balance=plan.add('Druid','Balance');plan.move(balance,1);assert.equal(buff('Moonkin Aura').covered,true);
  plan.remove(balance);assert.equal(buff('Moonkin Aura').covered,false);
});

class Element {
  constructor(tag='span',text=''){this.tagName=tag;this.textContent=text;this.children=[];this.dataset={};this.style={};this.attributes={};this.listeners={};this.classList={add(){},remove(){}};}
  append(...items){this.children.push(...items.map(item=>typeof item==='string'?new Element('text',item):item));}
  replaceChildren(...items){this.children=[];this.append(...items);}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,v){this.listeners[k]=v;}
  add(option){this.append(option);}
  focus(){}
  querySelector(){return null;}
  querySelectorAll(){return [];}
  get lastElementChild(){return this.children.at(-1);}
}
const all=root=>[root,...root.children.flatMap(all)];
const find=(root,fn)=>all(root).find(fn);

test('picker, click placement, drag/drop, full groups and reload all update the rendered draft',()=>{
  const document={createElement:tag=>new Element(tag),createTextNode:text=>new Element('text',text)};
  const storage=new Map();
  const localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
  const render=new Function('document','Option','localStorage','window','createCompositionPlan','compositionBuffs','guildIcon','tablerIcon','return ('+renderRaidComposition.toString()+')')(document,class extends Element{constructor(text,value){super('option',text);this.value=String(value);}},localStorage,{confirm:()=>true},createCompositionPlan,compositionBuffs,()=>new Element('span'),()=>new Element('svg'));
  const root=new Element('main');const ui=render(root,{specs:armorySpecs,storageKey:'test'});
  find(root,e=>e.dataset.class==='Mage').listeners.click();
  find(root,e=>e.attributes['aria-label']==='Add Arcane Mage to Unassigned').listeners.click();
  assert.equal(ui.model.snapshot().players[0].group,null);
  const intellect=()=>find(root,e=>e.className==='comp-buff'&&find(e,n=>n.textContent==='Arcane Intellect'));
  assert.equal(intellect().dataset.state,'missing','unassigned Mage does not cover raid intellect');
  const intellectCategory=()=>find(root,e=>e.className==='comp-category-toggle'&&find(e,n=>n.textContent==='Intellect'));
  assert.equal(intellectCategory().dataset.coverage,'missing','missing category uses red status');
  find(root,e=>e.dataset.playerSelect==='1').listeners.click();
  find(root,e=>e.attributes['aria-label']==='Group 1, empty slot 1, place selected placeholder').listeners.click();
  assert.equal(ui.model.snapshot().players[0].group,1);
  assert.equal(intellect().dataset.state,'covered','placing a Mage updates the bottom buff panel');
  assert.equal(intellectCategory().dataset.coverage,'covered','covered category uses green status');
  let group=all(root).filter(e=>e.className==='comp-group')[1];
  group.listeners.drop({preventDefault(){},stopPropagation(){},dataTransfer:{getData:()=> '1'}});
  assert.equal(ui.model.snapshot().players[0].group,2);
  const pool=find(root,e=>e.className==='comp-pool');pool.listeners.drop({preventDefault(){},stopPropagation(){},dataTransfer:{getData:()=> '1'}});
  assert.equal(ui.model.snapshot().players[0].group,null);
  assert.equal(intellect().dataset.state,'missing','moving back to Unassigned removes raid coverage');
  const restored=render(new Element('main'),{specs:armorySpecs,storageKey:'test'});
  assert.deepEqual(restored.model.snapshot(),ui.model.snapshot());
  intellectCategory().listeners.click();
  const spellRow=find(root,e=>e.className==='comp-buff comp-category-detail');
  assert.ok(find(spellRow,e=>e.className==='comp-spell-icon'),'expanded categories use spell artwork');
  assert.ok(find(spellRow,e=>e.className==='comp-scope'),'expanded categories show raid or group scope');
  find(root,e=>e.textContent==='Clear all').listeners.click();assert.equal(ui.model.snapshot().players.length,0);
});
