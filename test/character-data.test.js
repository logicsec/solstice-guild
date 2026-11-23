import assert from 'node:assert/strict';
import test from 'node:test';
import { deduplicateAchievements, achievementProgress, characterAchievements, characterStatGroups, flattenLifetime } from '../src/character-data.js';

test('stat groups preserve real zero values and distinguish missing data',()=>{
 const groups=characterStatGroups({health:1917,power:4095,power_type:{id:0},intellect:{effective:214},melee_crit:{value:3},main_hand_damage_min:97.88,main_hand_damage_max:145.88,ranged_attack_power:0});
 assert.equal(groups[0].rows.find(row=>row.label==='Mana').value,4095);
 assert.equal(groups.find(group=>group.name==='Ranged').rows[0].value,0);
 assert.equal(groups.find(group=>group.name==='Defense').rows[0].value,null);
 assert.deepEqual(groups.find(group=>group.name==='Melee').rows[1].value,[97.88,145.88]);
 assert.equal(groups.find(group=>group.name==='Melee').rows.find(row=>row.label==='Melee Crit').format,'percent');
});
test('achievement progress uses completed exploration criteria and numeric skill targets',()=>{
 const definition={id:1,child_criteria:[{id:2,amount:1},{id:3,amount:1},{id:4,amount:1}]};
 assert.deepEqual(achievementProgress({id:1,child_criteria:[{id:2,is_completed:true},{id:3,amount:1,is_completed:false}]},definition),{current:1,total:3});
 assert.deepEqual(achievementProgress({id:1,child_criteria:[{id:2,amount:75}]},{id:1,child_criteria:[{id:2,amount:150}]}),{current:75,total:150});
 assert.deepEqual(achievementProgress(null,definition,true),{current:3,total:3});
});
test('lifetime statistics retain nested categories and explicit zero counters',()=>{
 assert.equal(flattenLifetime(null),null);
 const rows=flattenLifetime({categories:[{name:'Character',statistics:[{id:1,name:'Times camped',quantity:0}],sub_categories:[{name:'Consumables',statistics:[{id:2,name:'Food eaten',quantity:12}]}]}]});
 assert.equal(rows[0].value,0);assert.equal(rows[1].group,'Character / Consumables');assert.equal(rows[1].value,12);
});
test('achievement catalog joins real definitions, categories, media, progress and dates',async t=>{
 const documents={
  'achievement-category/index':{categories:[{id:100},{id:101},{id:102},{id:103},{id:104}]},
  'achievement-category/100':{id:100,name:'Classes',subcategories:[{id:101},{id:102}]},
  'achievement-category/101':{id:101,name:'Mage',parent_category:{id:100},achievements:[{id:501}]},
  'achievement-category/102':{id:102,name:'Priest',parent_category:{id:100},achievements:[{id:502}]},
  'achievement-category/103':{id:103,name:'Adventure'},
  'achievement-category/104':{id:104,name:'Kalimdor',parent_category:{id:103},achievements:[{id:503}]},
  'achievement/501':{id:501,name:'Novice Mage',description:'Reach level 10.',category:{id:101,name:'Mage'},criteria:{id:1,amount:10}},
  'achievement/503':{id:503,name:'Explore Felwood',description:'Reveal Felwood.',category:{id:104,name:'Kalimdor'},criteria:{id:2,child_criteria:[{id:3,amount:1},{id:4,amount:1}]}},
  'media/achievement/501':{assets:[{key:'icon',value:'https://render.worldofwarcraft.com/us/icons/56/test.jpg'}]},
  'media/achievement/503':{assets:[{key:'icon',value:'https://render.worldofwarcraft.com/us/icons/56/forest.jpg'}]},
 };
 t.mock.method(globalThis,'fetch',async url=>{const key=new URL(url).pathname.replace('/data/wow/','');assert.ok(documents[key],key);return Response.json(documents[key]);});
 const result=await characterAchievements('test',{character_class:{name:'Mage'}},{achievements:[{id:501,completed_timestamp:1794000000000,criteria:{is_completed:true}},{id:503,criteria:{id:2,child_criteria:[{id:3,is_completed:true}]}}]});
 assert.equal(result.items.length,2);assert.equal(result.partial,false);
 const mage=result.items.find(item=>item.id===501);assert.equal(mage.category,'Classes');assert.equal(mage.earned,true);assert.equal(mage.completedAt,1794000000000);
 const forest=result.items.find(item=>item.id===503);assert.equal(forest.icon,'https://render.worldofwarcraft.com/us/icons/56/forest.jpg');assert.equal(forest.current,1);assert.equal(forest.total,2);
});


test('equivalent achievement variants appear once and retain earned progress',()=>{
 const base={name:'Journeyman Alchemist',category:'Tradeskills',group:'Alchemy',total:150};
 const result=deduplicateAchievements([{...base,id:1,current:0,earned:false},{...base,id:2,current:150,earned:true,completedAt:123},{...base,id:3,total:225,current:20,earned:false}]);
 assert.equal(result.length,2);
 assert.equal(result[0].id,2);
 assert.equal(result[0].completedAt,123);
});
