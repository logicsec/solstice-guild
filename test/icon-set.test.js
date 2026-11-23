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

test('forever artwork covers each class and class-specific specialization without collisions',async()=>{
  const {guildIcon}=await import('../public/assets/icons.js');
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/forever-icons-manifest.json',import.meta.url),'utf8'));
  const original=globalThis.document;
  globalThis.document={createElement:()=>({dataset:{},style:{},setAttribute(){}})};
  try {
    const positions=new Set();
    for(const [className,specs] of Object.entries(armorySpecs)){
      for(const [kind,name] of [['class',className],...specs.map(([name])=>['spec',name])]){
        const icon=guildIcon(kind,name,'',className);
        assert.match(icon.className,/forever-icon/);
        const key=kind==='class'?name:className+':'+name;
        const index=manifest.icons[kind][key];
        assert.equal(icon.style.backgroundPosition,(index%6*20)+'% '+(Math.floor(index/6)*20)+'%');
        assert.ok(!positions.has(icon.style.backgroundPosition),key+' has distinct artwork');
        positions.add(icon.style.backgroundPosition);
      }
    }
    assert.equal(positions.size,36);
    const atlas=readFileSync(new URL('../public/assets/forever-identities.webp',import.meta.url));
    assert.equal(atlas.toString('ascii',8,12),'WEBP');
  }finally{globalThis.document=original;}
});
