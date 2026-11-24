import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesGuildRosterFilter as matches} from '../src/guild-roster-filters.js';
const mage={name:'Astra Mortis',race:'Human',class_name:'Mage',spec:'Arcane',role:'Ranged DPS',level:60,armorySlug:'astra-mortis'};
const unknown={name:'Lowbie Player',race:null,class_name:'Priest',spec:'',role:'',level:null,armorySlug:'lowbie-player'};
test('guild roster combines race, class, spec, level, search and profession filters',()=>{
  assert.equal(matches(mage,{}),true);
  assert.equal(matches(mage,{race:'Human',className:'Mage',spec:'Arcane',minLevel:'50',maxLevel:'60',query:'mortis'}),true);
  for(const filters of [{race:'Dwarf'},{className:'Warrior'},{spec:'Fire'},{maxLevel:'59'},{minLevel:'61'},{minLevel:'60',maxLevel:'50'},{query:'absent'}])assert.equal(matches(mage,filters),false,JSON.stringify(filters));
  assert.equal(matches(mage,{professionSlugs:new Set(['astra-mortis'])}),true);
  assert.equal(matches(mage,{professionSlugs:new Set(['other-player'])}),false);
  assert.equal(matches(mage,{query:'human'}),true);
});
test('missing race, spec and level stay explicitly unknown when filtering',()=>{
  assert.equal(matches(unknown,{race:'__unknown__',spec:'__unknown__'}),true);
  assert.equal(matches(unknown,{minLevel:'1'}),false);
  assert.equal(matches(unknown,{maxLevel:'60'}),false);
  assert.equal(matches(mage,{race:'__unknown__'}),false);
  assert.equal(matches(unknown,{className:'Priest'}),true);
});
