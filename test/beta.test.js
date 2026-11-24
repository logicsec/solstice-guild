import assert from 'node:assert/strict';
import test from 'node:test';
import {compositionCapabilities,compositionBuffs,createCompositionPlan,renderRaidComposition} from '../src/raid-composition.js';
import {armorySpecs} from '../src/armory.js';
import {renderBetaGuildHub} from '../src/beta.js';

class Element {
  constructor(tag='span',text=''){this.tagName=tag;this.textContent=text;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.style={setProperty(){}};this.classList={add(){}};this.value='';}
  append(...items){this.children.push(...items.map(n=>typeof n==='string'?new Element('text',n):n));}
  prepend(...items){this.children.unshift(...items);}
  replaceChildren(...items){this.children=[];this.append(...items);}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,v){this.listeners[k]=v;}
  add(option){this.append(option);}
  querySelector(){return null;}
  querySelectorAll(){return [];}
  focus(){}
  showModal(){this.open=true;}
  close(){this.open=false;this.listeners.close?.();}
  remove(){}
  get lastElementChild(){return this.children.at(-1);}
  get firstElementChild(){return this.children[0];}
}
const all=n=>[n,...n.children.flatMap(all)];
const find=(n,p)=>all(n).find(p);
const document={createElement:tag=>new Element(tag),createTextNode:text=>new Element('text',text)};
class Option extends Element{constructor(text,value){super('option',text);this.value=String(value);}}
const icon=()=>new Element('span');

test('beta capability counts follow assigned providers and distinguish talent-specific utility',()=>{
  const model=createCompositionPlan(armorySpecs);
  const mage=model.add('Mage','Arcane');
  const count=name=>{const c=compositionCapabilities(model.snapshot());return [...c.utility,...c.single,...c.cooldowns].find(e=>e.name===name).count;};
  assert.equal(count('Interrupts'),0);
  model.move(mage,1);
  assert.equal(count('Interrupts'),1);assert.equal(count('Curse removal'),1);assert.equal(count('Defensives'),1);
  assert.deepEqual(compositionCapabilities(model.snapshot()).debuffs,[]);
  const holy=model.add('Priest','Holy');model.move(holy,1);
  assert.equal(count('Fear Ward'),1);assert.equal(count('Power Infusion'),0);assert.equal(count('Magic dispels'),1);
  const disc=model.add('Priest','Discipline');model.move(disc,2);
  assert.equal(count('Power Infusion'),1);assert.equal(count('Magic dispels'),2);
  const warrior=model.add('Warrior','Protection');model.move(warrior,2);
  assert.ok(compositionCapabilities(model.snapshot()).debuffs.some(e=>e.name==='Major armor reduction'));
  model.move(warrior,null);
  assert.equal(compositionCapabilities(model.snapshot()).debuffs.length,0);
  model.move(mage,null);assert.equal(count('Interrupts'),0);assert.equal(count('Curse removal'),0);
});

test('beta planner uses three columns and its live icon panel without replacing production analysis',()=>{
  const storage=new Map();const localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
  const render=new Function('document','Option','localStorage','window','createCompositionPlan','compositionBuffs','compositionCapabilities','guildIcon','tablerIcon','return ('+renderRaidComposition.toString()+')')(document,Option,localStorage,{confirm:()=>true},createCompositionPlan,compositionBuffs,compositionCapabilities,icon,icon);
  const root=new Element('main');const ui=render(root,{specs:armorySpecs,beta:true,storageKey:'beta-test'});
  const layout=find(root,e=>e.className==='comp-layout');assert.equal(layout.children.length,3);
  assert.equal(layout.children[0].className,'raid-card comp-issues');assert.equal(layout.children[1].className,'comp-main');assert.equal(layout.children[2].className,'comp-sidebar');
  assert.equal(find(root,e=>e.className==='comp-analysis'),undefined);
  const has=find(root,e=>e.className==='raid-card comp-raid-has');assert.ok(has);
  const state=()=>find(has,e=>e.dataset.buffName==='Arcane Intellect').dataset.state;
  assert.equal(state(),'missing');
  find(root,e=>e.className==='beta-spec-add'&&e.attributes['aria-label']==='Add Arcane Mage to Unassigned').listeners.click();
  assert.equal(state(),'missing');assert.equal(ui.model.snapshot().players.length,1);
  ui.model.move('1',1);ui.draw();assert.equal(state(),'covered');
  const interrupts=find(has,e=>e.dataset.capability==='Interrupts');assert.equal(interrupts.lastElementChild.textContent,'1');
  ui.model.move('1',null);ui.draw();assert.equal(state(),'missing');assert.equal(find(has,e=>e.dataset.capability==='Interrupts').lastElementChild.textContent,'0');
  const original=new Element('main');render(original,{specs:armorySpecs,storageKey:'production-test'});assert.ok(find(original,e=>e.className==='comp-analysis'));assert.equal(find(original,e=>e.className==='raid-card comp-raid-has'),undefined);
});

test('beta guild overview uses actual teams, roster filters and character inspection in place',async()=>{
  const location={href:'https://guild.example/beta?tool=raid&view=guildDashboard'};const history={pushState:(_,__,url)=>{location.href=String(new URL(url,location.href));}};
  const render=new Function('document','Option','location','history','guildIcon','tablerIcon','renderBetaGuildHub','return ('+renderBetaGuildHub.toString()+')')(document,Option,location,history,icon,icon,renderBetaGuildHub);
  const root=new Element('main');const opened=[],navigation=[];
  const chars=[{name:'Astra Mortis',class_name:'Mage',spec:'Arcane',role:'Ranged DPS',level:60,race:'Human',armorySlug:'astra-mortis'},{name:'Lowbie',class_name:'Warrior',spec:'Arms',role:'Melee DPS',level:12,race:'Dwarf',armorySlug:'lowbie'}];
  const request=async path=>path==='/api/raid-teams'?{teams:[{id:'team-a',name:'Dawnwatch',size:20,mains:1,characters:2,region:'us',ruleset:1}]}:path.includes('guild-events')?{events:[]}:{characters:chars};
  await render(root,{request,specs:armorySpecs,navigate:(...a)=>navigation.push(a),openCharacter:(...a)=>opened.push(a)});
  assert.ok(find(root,e=>e.textContent==='Dawnwatch'));
  const search=find(root,e=>e.attributes['aria-label']==='Search guild characters');search.value='Astra';search.listeners.input();
  assert.equal(find(root,e=>e.className==='beta-result-count').textContent,'1 of 2 characters');
  find(root,e=>e.className==='beta-character-link').listeners.click();assert.equal(opened[0][0].name,'Astra Mortis');
  assert.ok(find(root,e=>e.className==='team-character-dialog').open);assert.equal(navigation.length,0,'inspection keeps guild workspace active');
  search.value='';search.listeners.input();const min=find(root,e=>e.attributes['aria-label']==='Min level');min.value='50';min.listeners.input();assert.equal(find(root,e=>e.className==='beta-result-count').textContent,'1 of 2 characters');
  find(root,e=>e.className==='beta-team-card').listeners.click();assert.match(location.href,/\/beta\?/);assert.match(location.href,/team=team-a/);assert.deepEqual(navigation.at(-1),['raiding',false]);
});
