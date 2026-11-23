import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGearDatabase, refreshGearCatalog } from '../src/gear-catalog.js';
import { itemFitsSlot } from '../public/assets/gear-items.js';

test('catalog preserves source names and baseline stats and filters invalid items',()=>{
 const items=normalizeGearDatabase({items:[{id:1,name:'Hat',type:1,scalingOptions:{0:{ilvl:60,stats:{3:20}}},sources:[{drop:{zoneId:2,npcId:3}}]},{id:'bad',name:'Bad',type:1}],zones:[{id:2,name:'Dungeon'}],npcs:[{id:3,name:'Boss'}]});
 assert.equal(items.length,1);
 assert.equal(items[0].source,'Dungeon · Boss');
 assert.equal(items[0].stats[3],20);
 assert.equal(items[0].ilvl,60);
 assert.throws(()=>normalizeGearDatabase({items:[]}));
});
test('equipment picker respects ring, trinket and weapon hand slots',()=>{
 assert.equal(itemFitsSlot({type:11},'Finger 2'),true);
 assert.equal(itemFitsSlot({type:12},'Trinket 1'),true);
 assert.equal(itemFitsSlot({type:13,handType:4},'Main Hand'),true);
 assert.equal(itemFitsSlot({type:13,handType:4},'Off Hand'),false);
 assert.equal(itemFitsSlot({type:13,handType:3},'Main Hand'),false);
 assert.equal(itemFitsSlot({type:13,handType:3},'Off Hand'),true);
 assert.equal(itemFitsSlot({type:1},'Neck'),false);
});
test('load refresh revalidates upstream and retains the last valid catalog on failure',async t=>{
 let requests=0;
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  assert.equal(url,'https://www.wowsims.com/forever/assets/database/db.json');
  requests++;
  if(requests===1)return Response.json({items:[{id:10,name:'Fresh Hat',type:1}]},{headers:{ETag:'"catalog-1"'}});
  assert.equal(options.headers['If-None-Match'],'"catalog-1"');
  if(requests===2)return new Response(null,{status:304});
  throw Error('offline');
 });
 const first=await refreshGearCatalog();assert.equal(first.fresh,true);assert.equal(first.items[0].name,'Fresh Hat');
 const next=await refreshGearCatalog();assert.equal(next.fresh,true);assert.deepEqual(next.items,first.items);
 const offline=await refreshGearCatalog();assert.equal(offline.fresh,false);assert.deepEqual(offline.items,first.items);
 assert.equal(requests,3);
});
