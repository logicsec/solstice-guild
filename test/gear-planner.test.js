import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { gearPlannerApi } from '../src/gear-planner.js';

function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE armory_links(member TEXT,name TEXT);
 CREATE TABLE raid_characters(member TEXT,name TEXT,class_name TEXT);
 CREATE TABLE raids(id TEXT,owner TEXT,instance TEXT);
 CREATE TABLE raid_signups(raid_id TEXT,member TEXT,character TEXT,status TEXT);
 CREATE TABLE raid_loot_tables(owner TEXT,instance TEXT,items TEXT);`);
 sqlite.exec(readFileSync(new URL('../migrations/0023_gear_planner.sql',import.meta.url),'utf8'));
 const db={prepare(sql){const statement=sqlite.prepare(sql);return {bind(...args){return {first:()=>statement.get(...args),all:()=>({results:statement.all(...args)}),run:()=>({meta:statement.run(...args)})}}}}};
 sqlite.prepare('INSERT INTO raid_characters(member,name,class_name) VALUES(?,?,?)').run('alice','Magey','Mage');
 return {sqlite,db};
}
test('gear builds are private to their owner',async()=>{
 const {sqlite,db}=fixture();
 try{
 const session={discord_id:'alice'};
 const url=new URL('https://solsticeguild.net/api/gear-planner?character=Magey');
 const response=await gearPlannerApi(new Request(url),{DB:db},url,session);
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).builds,[]);
 const other=await gearPlannerApi(new Request(url),{DB:db},url,{discord_id:'bob'});
 assert.equal(other.status,403);
 }finally{sqlite.close()}
});
test('item search escapes SQL wildcards and returns empty catalog',async()=>{
 const {sqlite,db}=fixture();
 try{
 const url=new URL('https://solsticeguild.net/api/gear-planner?search=foo%25');
 const response=await gearPlannerApi(new Request(url),{DB:db},url,{discord_id:'alice'});
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).items,[]);
 }finally{sqlite.close()}
});
