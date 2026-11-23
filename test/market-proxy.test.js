import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';
const env={DISCORD_CLIENT_ID:'1',DISCORD_CLIENT_SECRET:'test',DISCORD_GUILD_ID:'2',DB:{prepare(){return{bind(){return{first:async()=>({discord_id:'test',display_name:'Tester'})}}}}}};
const request=()=>new Request('https://guild.example/prices',{headers:{Cookie:'__Host-solstice-session='+'a'.repeat(64)}});

test('market proxy handles an upstream timeout after headers without exposing a failing stream',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(controller){
  controller.enqueue(new TextEncoder().encode('{"items":['));
  queueMicrotask(()=>controller.error(new DOMException('upstream timed out','TimeoutError')));
 }}),{headers:{'Content-Type':'application/json'}}));
 const response=await worker.fetch(request(),env);
 await response.text().catch(()=>{});
 assert.equal(response.status,502,'partial upstream data must not escape as a successful streaming response');
 assert.equal(response.headers.get('Cache-Control'),'no-store','failed upstream responses must not remain cached');
 const health=await worker.fetch(new Request('https://guild.example/api/session',{headers:request().headers}),env);
 assert.equal(health.status,200,'subsequent requests remain available');
});

test('market proxy preserves complete upstream data and content type',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('{"items":[]}',{headers:{'Content-Type':'application/json'}}));
 const response=await worker.fetch(request(),env);
 assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/json');
 assert.deepEqual(await response.json(),{items:[]});
});
