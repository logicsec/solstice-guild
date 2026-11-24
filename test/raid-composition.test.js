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
  showModal(){this.open=true;}
  close(){this.open=false;}
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
  const main=find(root,e=>e.className==='comp-main');
  const toolbar=main.children[0];
  assert.equal(toolbar.className,'comp-picker');
  assert.equal(main.children[1].className,'raid-card comp-groups-panel');
  assert.equal(toolbar.children.length,Object.keys(armorySpecs).length);
  assert.equal(find(root,e=>e.className==='comp-sidebar').children.some(e=>e===toolbar),false);
  assert.ok(find(toolbar,e=>e.attributes['aria-label']==='Add Feral (Bear) Druid to Unassigned'));
  assert.ok(find(toolbar,e=>e.attributes['aria-label']==='Add Feral (Cat) Druid to Unassigned'));
  find(root,e=>e.attributes['aria-label']==='Add Arcane Mage to Unassigned').listeners.click();
  assert.equal(ui.model.snapshot().players[0].group,null);
  const intellect=()=>find(root,e=>e.className==='comp-buff'&&e.dataset.buffName==='Arcane Intellect');
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
  find(root,e=>e.dataset.playerSelect==='1').listeners.click();
  find(root,e=>e.attributes['aria-label']==='Group 1, empty slot 1, place selected placeholder').listeners.click();
  find(root,e=>e.attributes['aria-label']==='Move Arcane Mage to Unassigned').listeners.click({stopPropagation(){}});
  assert.equal(ui.model.snapshot().players.length,1,'group X retains the placeholder');
  assert.equal(ui.model.snapshot().players[0].group,null,'group X returns it to Unassigned');
  assert.equal(intellect().dataset.state,'missing','group X updates buff coverage');
  assert.equal(JSON.parse(storage.get('test')).players[0].group,null,'return to Unassigned is saved');
  find(root,e=>e.attributes['aria-label']==='Remove Arcane Mage').listeners.click({stopPropagation(){}});
  assert.equal(ui.model.snapshot().players.length,0,'Unassigned X removes the placeholder');
  assert.equal(JSON.parse(storage.get('test')).players.length,0,'deletion is saved');

  intellectCategory().listeners.click();
  const spellRow=find(root,e=>e.className==='comp-buff comp-category-detail');
  assert.ok(find(spellRow,e=>e.className==='comp-spell-icon'),'expanded categories use spell artwork');
  assert.ok(find(spellRow,e=>e.className==='comp-scope'),'expanded categories show raid or group scope');
  find(root,e=>e.textContent==='Clear all').listeners.click();assert.equal(ui.model.snapshot().players.length,0);
});

test('auto-optimize evenly assigns every placeholder and preserves identity, roles and buff choices',()=>{
  for(const size of [10,20,40])for(const count of [0,1,3,Math.floor(size/2)+1,size]){
    const plan=createCompositionPlan(armorySpecs,{size});
    const picks=[['Warrior','Protection'],['Priest','Holy'],['Shaman','Restoration'],['Paladin','Holy'],['Warlock','Affliction'],['Mage','Arcane'],['Rogue','Combat']];
    for(let i=0;i<count;i++)plan.add(...picks[i%picks.length]);
    const before=plan.snapshot().players.map(({group,...p})=>p);
    plan.optimize();const snapshot=plan.snapshot();
    assert.ok(snapshot.players.every(p=>Number.isInteger(p.group)&&p.group>=1&&p.group<=size/5));
    const counts=Array.from({length:size/5},(_,i)=>snapshot.players.filter(p=>p.group===i+1).length);
    assert.ok(Math.max(...counts)<=5);assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
    assert.deepEqual(snapshot.players.map(({group,...p})=>p),before);
    plan.optimize();assert.deepEqual(plan.snapshot(),snapshot,'optimization is deterministic');
  }
  const plan=createCompositionPlan(armorySpecs);
  for(let i=0;i<4;i++)plan.add('Shaman','Restoration');
  plan.optimize();assert.equal(new Set(plan.snapshot().players.map(p=>p.group)).size,4,'party buff providers are spread across groups');
});

test('Lock In saves an immutable account copy, freezes placements, and allows a separate editable draft',async()=>{
  const document={createElement:tag=>new Element(tag),createTextNode:text=>new Element('text',text)};
  const storage=new Map();const localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
  const render=new Function('document','Option','localStorage','window','createCompositionPlan','compositionBuffs','guildIcon','tablerIcon','return ('+renderRaidComposition.toString()+')')(document,class extends Element{constructor(text,value){super('option',text);this.value=String(value);}},localStorage,{confirm:()=>true},createCompositionPlan,compositionBuffs,()=>new Element('span'),()=>new Element('svg'));
  let saved;
  const request=async data=>data?{composition:saved={id:'saved-1',title:data.title,plan:structuredClone(data.plan)}}:{compositions:[]};
  const root=new Element('main');const ui=render(root,{specs:armorySpecs,request,storageKey:'locked-test'});
  await Promise.resolve();
  find(root,e=>e.attributes['aria-label']==='Add Arcane Mage to Unassigned').listeners.click();
  find(root,e=>e.textContent==='Lock In').listeners.click();
  assert.match(find(root,e=>e.className==='comp-status').textContent,/Assign every/);
  find(root,e=>e.className==='comp-optimize').listeners.click();
  assert.equal(ui.model.snapshot().players[0].group,1);
  find(root,e=>e.textContent==='Lock In').listeners.click();
  const dialog=find(root,e=>e.className==='comp-lock-dialog');assert.equal(dialog.open,true);
  find(dialog,e=>e.tagName==='input').value='Hyjal caster comp';
  await find(dialog,e=>e.tagName==='form').listeners.submit({preventDefault(){}});
  assert.equal(dialog.open,false);assert.equal(saved.title,'Hyjal caster comp');
  assert.equal(find(root,e=>e.className==='comp-optimize').disabled,true);
  assert.ok(all(root).filter(e=>e.className==='comp-add-spec').every(button=>button.disabled));
  assert.equal(find(root,e=>e.className==='comp-player').draggable,false);
  assert.equal(find(root,e=>e.className==='comp-remove').disabled,true);
  find(root,e=>e.textContent==='Edit as draft').listeners.click();
  assert.equal(find(root,e=>e.className==='comp-optimize').disabled,false);
  find(root,e=>e.attributes['aria-label']==='Move Arcane Mage to Unassigned').listeners.click({stopPropagation(){}});
  assert.equal(ui.model.snapshot().players[0].group,null);
  assert.equal(saved.plan.players[0].group,1,'editing the draft cannot change the saved snapshot');
});
