import test from 'node:test';
import assert from 'node:assert/strict';
import {reportCode,summarizeFight,raidLogs} from '../src/raid-logs.js';

test('report URLs cannot redirect credentials or inject GraphQL',()=>{
  assert.equal(reportCode('https://forever.warcraftlogs.com/reports/AbCdEfGh12345678#fight=2'),'AbCdEfGh12345678');
  for(const value of ['https://evil.example/reports/AbCdEfGh12345678','https://forever.warcraftlogs.com.evil/reports/AbCdEfGh12345678','http://warcraftlogs.com/reports/AbCdEfGh12345678','https://user:pass@warcraftlogs.com/reports/AbCdEfGh12345678','x" ){evil}']) assert.equal(reportCode(value),null);
});
test('analytics calculate full-pull rates, preserve unavailable metrics, and keep deaths chronological',()=>{
  const table=entries=>({data:{entries}});
  const result=summarizeFight({startTime:10000,endTime:70000},{damage:table([{id:1,name:'Astra',type:'Mage',total:'6000'},{id:2,name:'Tank',type:'Warrior',total:1200}]),healing:table([{id:3,name:'Healer',type:'Priest',total:3000}]),interrupts:table([{id:1,name:'Astra',total:2}]),deaths:{data:[{type:'death',targetID:1,timestamp:40000},{type:'death',targetID:2,timestamp:20000}],nextPageTimestamp:50000}});
  assert.equal(result.players[0].dps,100);
  assert.equal(result.totals.damage,7200);
  assert.equal(result.tables.taken,false);
  assert.equal(result.tables.healing,true);
  assert.deepEqual(result.deaths.map(d=>[d.name,d.time]),[['Tank',10],['Astra',30]]);
  assert.equal(result.deathsComplete,false);
  assert.equal(summarizeFight({startTime:1,endTime:1},{damage:table([{id:1,total:10}])}).players[0].dps,null);
});
test('only organizers can attach a report and unconfigured integration gives an explicit setup state',async()=>{
  let writes=0;
  const env={DB:{prepare(){return {bind(){return {run(){writes++;},first(){return {report_code:'AbCdEfGh12345678'};}};}};}}};
  const reply=(body,status=200)=>({body,status});
  const url=new URL('https://solsticeguild.net/api/raids/id?logs=1');
  assert.equal((await raidLogs(env,{id:'id'},url,{action:'logs-link',report:'AbCdEfGh12345678'},false,reply)).status,403);
  assert.equal(writes,0);
  const setup=await raidLogs(env,{id:'id'},url,{},false,reply);
  assert.equal(setup.body.setupRequired,true);
  assert.equal(setup.body.configured,false);
});
test('public report integration authenticates server-side, caches results, and scopes pull queries',async t=>{
  const cache=new Map();let calls=0;
  const env={WCL_CLIENT_ID:'test-client',WCL_CLIENT_SECRET:'test-secret',DB:{prepare(sql){return {bind(...args){return {first(){return sql.includes('raid_log_links')?{report_code:'AbCdEfGh12345678'}:cache.get(args[0]);},run(){cache.set(args[0],{payload:args[1],expires_at:args[2]});}};}};}}};
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls++;
    if(url.endsWith('/oauth/token'))return Response.json({access_token:'test-token',expires_in:3600});
    assert.equal(url,'https://www.warcraftlogs.com/api/v2/client');
    assert.equal(options.headers.Authorization,'Bearer test-token');
    const body=JSON.parse(options.body);
    assert.equal(body.variables.code,'AbCdEfGh12345678');
    if(body.variables.ids){assert.deepEqual(body.variables.ids,[1]);return Response.json({data:{reportData:{report:{damage:{data:{entries:[{id:1,name:'Astra',total:1000}]}},deaths:{data:[],nextPageTimestamp:null}}}}});}
    return Response.json({data:{reportData:{report:{code:'AbCdEfGh12345678',title:'Raid',fights:[{id:1,name:'Boss',encounterID:100,startTime:0,endTime:10000,kill:true}]}}}});
  });
  const reply=(body,status=200)=>({body,status});
  const url=new URL('https://solsticeguild.net/api/raids/id?logs=1&fight=1');
  const result=await raidLogs(env,{id:'id'},url,{},true,reply);
  assert.equal(result.status,200);assert.equal(result.body.analytics.players[0].dps,100);
  assert.equal(JSON.stringify(result.body).includes('test-secret'),false);
  await raidLogs(env,{id:'id'},url,{},true,reply);assert.equal(calls,3);
  url.searchParams.set('fight','99');assert.equal((await raidLogs(env,{id:'id'},url,{},true,reply)).status,400);
});
