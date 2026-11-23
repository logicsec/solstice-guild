import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

test('production server serves theme and Tabler assets without authentication', {timeout:15000}, async t=>{
  const directory=await mkdtemp(join(tmpdir(),'solstice-assets-'));
  const reservation=createServer();
  await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  const child=spawn(process.execPath,['src/server.js'],{
    cwd:new URL('..',import.meta.url),stdio:'ignore',
    env:{...process.env,PORT:String(port),SQLITE_PATH:join(directory,'test.sqlite'),PUBLIC_ORIGIN:'https://guild.example',DISCORD_CLIENT_ID:'1',DISCORD_CLIENT_SECRET:'test-only',DISCORD_GUILD_ID:'2'},
  });
  t.after(async()=>{
    child.kill('SIGKILL');
    await new Promise(resolve=>child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit',resolve));
    await rm(directory,{recursive:true,force:true});
  });
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
    try{ready=(await fetch(base+'/healthz',{signal:AbortSignal.timeout(300)})).ok;}catch{}
    if(ready)break;
    await delay(30);
  }
  assert.ok(ready,'server starts with the production adapter');
  for(const [asset,type,expected] of [
    ['theme.css','text/css','--theme-body-bg:#17181e'],
    ['icons.js','javascript','function tablerIcon'],
    ['tabler-icons.svg','image/svg+xml','id="layout-dashboard"'],
    ['tabler-LICENSE.txt','text/plain','MIT License'],
  ]){
    const response=await fetch(base+'/assets/'+asset+'?v=asset-check');
    assert.equal(response.status,200,asset);
    assert.ok(response.headers.get('content-type').includes(type),asset+' MIME type');
    assert.ok((await response.text()).includes(expected),asset+' body');
    assert.equal((await fetch(base+'/assets/'+asset,{method:'HEAD'})).status,200,asset+' HEAD');
  }
});
