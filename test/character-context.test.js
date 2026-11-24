import test from 'node:test';
import assert from 'node:assert/strict';
import {openCharacterSheet} from '../src/armory-client.js';

class Element {
  constructor(tag,text,cls){this.tagName=tag;this.textContent=text;this.className=cls;this.children=[];this.listeners={};this.attributes={};this.classList={add(){}};}
  append(...nodes){this.children.push(...nodes);}
  prepend(...nodes){this.children.unshift(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(name,callback){this.listeners[name]=callback;}
  querySelector(){return null;}
  remove(){this.removed=true;}
}
const all=root=>[root,...root.children.filter(child=>typeof child==='object').flatMap(all)];

test('embedded character sheet leaves the team page and navigation in place',()=>{
  const location={pathname:'/',href:'https://solsticeguild.net/?tool=raid&view=raiding&team=team-a'};
  const document={querySelector(){throw Error('Embedded sheet must not replace the page shell');},createTextNode:text=>new Element('text',text)};
  const make=(tag,text,cls)=>new Element(tag,text,cls);
  const open=new Function('document','location','raidElement','tablerIcon','return ('+openCharacterSheet.toString()+')')(document,location,make,()=>make('svg'));
  const target=make('div');let closed=0;
  open({character:'Manual Warrior',class_name:'Warrior'},null,false,{target,onClose:()=>closed++});
  assert.equal(target.children[0].className,'character-page-root');
  assert.equal(location.href,'https://solsticeguild.net/?tool=raid&view=raiding&team=team-a');
  assert.ok(all(target).some(node=>node.textContent==='This character was added manually and has no linked Armory profile.'));
  const first=target.children[0];
  all(target).find(node=>node.className==='character-refresh').listeners.click();
  assert.notEqual(target.children[0],first,'refresh rerenders only the embedded sheet');
  target.children[0].close();
  assert.equal(closed,1);
  assert.equal(target.children[0].removed,true);
});
