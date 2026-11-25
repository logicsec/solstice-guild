import assert from 'node:assert/strict';
import test from 'node:test';
import {showSolsticeDialog} from '../public/assets/solstice-dialog.js';

class Element {
  constructor(tag) {
    this.tag=tag;
    this.children=[];
    this.handlers={};
    this.classList={add(){}};
  }
  append(...children){this.children.push(...children);}
  setAttribute(){}
  addEventListener(event,handler){this.handlers[event]=handler;}
  showModal(){this.open=true;}
  close(){this.open=false;this.handlers.close();}
  focus(){this.focused=true;}
  remove(){this.removed=true;}
}
const find=(node,predicate)=>predicate(node)?node:node.children.map(child=>find(child,predicate)).find(Boolean);

test('shared modal waits for a decision, defaults destructive prompts to Cancel, and cleans up on close',async()=>{
  let dialog;
  const document={createElement:tag=>new Element(tag),querySelector:()=>dialog&&!dialog.removed?dialog:null,body:{append:node=>{dialog=node;}}};
  const show=new Function('document','return ('+showSolsticeDialog.toString()+')')(document);
  const options={title:'Delete schedule?',confirmLabel:'Delete schedule',danger:true};
  const cancelled=show(options);
  assert.equal(dialog.open,true);
  assert.equal(find(dialog,node=>node.textContent==='Cancel').autofocus,true);
  assert.equal(await show(options),null,'a second request cannot replace the active prompt');
  dialog.close();
  assert.equal(await cancelled,null);
  assert.equal(dialog.removed,true);
  const confirmed=show(options);
  find(dialog,node=>node.tag==='form').handlers.submit({preventDefault(){}});
  assert.deepEqual(await confirmed,{});
});

test('the shared input modal keeps invalid values in the dialog and returns confirmed values',async()=>{
  let dialog;
  const document={createElement:tag=>new Element(tag),querySelector:()=>null,body:{append:node=>{dialog=node;}}};
  const show=new Function('document','return ('+showSolsticeDialog.toString()+')')(document);
  const result=show({
    title:'Insert image',confirmLabel:'Insert image',fields:[{name:'url',label:'Image URL'}],
    validate:({url})=>url.startsWith('https://')?'':'Enter an HTTPS URL.',
  });
  const input=find(dialog,node=>node.tag==='input');
  const form=find(dialog,node=>node.tag==='form');
  input.value='http://example.test';
  form.handlers.submit({preventDefault(){}});
  assert.equal(dialog.open,true);
  assert.equal(input.focused,true);
  assert.equal(find(dialog,node=>node.className==='solstice-dialog-error').textContent,'Enter an HTTPS URL.');
  input.value='https://example.test';
  form.handlers.submit({preventDefault(){}});
  assert.deepEqual(await result,{url:'https://example.test'});
});
