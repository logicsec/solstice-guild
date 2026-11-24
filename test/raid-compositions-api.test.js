import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {raidCompositionsApi,ownedRaidComposition} from '../src/raid-compositions-api.js';

test('locked composition snapshots validate capacity, remain immutable and are private to their owner',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0025_raid_compositions.sql',import.meta.url),'utf8'));
  const db={prepare(sql){const statement=sqlite.prepare(sql);return{bind(...args){return{first:()=>statement.get(...args),all:()=>({results:statement.all(...args)}),run:()=>({meta:statement.run(...args)})}}}}};
  const url=new URL('https://solsticeguild.net/api/raid-compositions');
  const send=(input,owner='alice',origin=url.origin)=>raidCompositionsApi(new Request(url,input?{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)}:{}),{DB:db},url,owner?{discord_id:owner}:null);
  try{
    assert.equal((await send(null,null)).status,401);
    const plan={size:20,players:[{className:'Mage',spec:'Arcane',role:'Ranged DPS',group:1}]};
    assert.equal((await send({title:'Comp',plan},'alice','https://other.example')).status,403);
    assert.equal((await send({title:'Comp',plan:{...plan,players:[{...plan.players[0],group:null}]}})).status,400);
    assert.equal((await send({title:'Comp',plan:{...plan,players:Array(6).fill(plan.players[0])}})).status,400);
    assert.equal((await send({title:'Comp',plan:{...plan,players:[{...plan.players[0],spec:'Unknown'}]}})).status,400);
    const created=await send({title:'Caster comp',plan});assert.equal(created.status,201);
    const original=(await created.json()).composition;
    const character={key:'astra',name:'Astra Mortis'};
    const named={...plan.players[0],character};
    assert.equal((await send({title:'Duplicate',plan:{...plan,players:[named,named]}})).status,400);

    assert.equal((await (await send()).json()).compositions.length,1);
    assert.deepEqual((await (await send(null,'bob')).json()).compositions,[]);
    assert.equal(await ownedRaidComposition(db,'bob',original.id),null);
    const second=await send({id:original.id,title:'New version',plan:{...plan,players:[{...named,group:2}]}});
    assert.equal(second.status,201);
    const saved=(await second.json()).composition;
    assert.notEqual(saved.id,original.id);
    assert.deepEqual(saved.plan.players[0].character,character);
    assert.deepEqual(await ownedRaidComposition(db,'alice',original.id),original,'saving a new version cannot overwrite the locked snapshot');
  }finally{sqlite.close();}
});
