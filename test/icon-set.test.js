import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {armorySpecs} from '../src/armory.js';

test('identity sprite covers every supported class, specialization, profession and role',()=>{
  const sprite=readFileSync(new URL('../public/assets/tabler-icons.svg',import.meta.url),'utf8');
  const symbols=[...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(symbols).size,symbols.length,'symbol IDs are unique');
  const groups={class:Object.keys(armorySpecs),spec:Object.values(armorySpecs).flatMap(specs=>specs.map(([name])=>name)),
    profession:['Alchemy','Blacksmithing','Cooking','Enchanting','Engineering','First Aid','Fishing','Herbalism','Leatherworking','Mining','Skinning','Tailoring'],
    role:['Tank','Healer','Melee DPS','Ranged DPS']};
  for(const [kind,names] of Object.entries(groups))for(const name of names){
    const id='solstice-'+kind+'-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    assert.ok(symbols.includes(id),'missing identity symbol: '+id);
  }
  const custom=sprite.slice(sprite.indexOf('<!-- Original Solstice'));
  assert.doesNotMatch(custom,/<image\b|https?:\/\//,'identity artwork uses local vector paths');
});
