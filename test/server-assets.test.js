import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';

test('production server serves theme and Tabler assets without authentication', {timeout:15000}, async t=>{
  const directory=await mkdtemp(join(tmpdir(),'solstice-assets-'));
  const reservation=createServer();
  await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  const preload = `globalThis.fetch=async(url)=>{
    if(String(url).includes('/v1/pricetable/'))return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"items":['));setTimeout(()=>controller.error(new DOMException('upstream timed out','TimeoutError')),10)}}),{headers:{'Content-Type':'application/json'}});
    return new Response('<rss></rss>');
  };`;
  const child=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(preload),'src/server.js'],{
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
  const sqlite=new DatabaseSync(join(directory,'test.sqlite'));
  const token='a'.repeat(64);
  sqlite.prepare('INSERT INTO discord_sessions(token_hash,discord_id,display_name,expires_at) VALUES(?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),'test','Tester',Date.now()+60000);
  sqlite.close();
  const failedFeed=await fetch(base+'/prices',{headers:{Cookie:'__Host-solstice-session='+token}});
  assert.equal(failedFeed.status,502,'upstream body timeout becomes a controlled error response');
  assert.match(await failedFeed.text(),/AHledger did not respond/);
  assert.equal((await fetch(base+'/healthz')).status,200,'upstream timeout does not terminate the actual Node server');

  const betaGuest=await fetch(base+'/beta',{redirect:'manual'});
  assert.equal(betaGuest.status,303);
  assert.match(betaGuest.headers.get('location'),/auth\/discord\?next=%2Fbeta/);
  const preview=await fetch(base+'/beta',{headers:{Cookie:'__Host-solstice-session='+token}});
  assert.equal(preview.status,200);
  assert.equal(preview.headers.get('cache-control'),'private, no-store');
  const previewHtml=await preview.text();
  assert.match(previewHtml,/class="guild-app beta-workspace"/);
  assert.match(previewHtml,/assets\/beta.css/);
  assert.match(previewHtml,/bootBetaWorkspace\(\);\s*route\(\);/);
  for(const match of previewHtml.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g))new Function(match[1]);
  const production=await fetch(base+'/?tool=raid',{headers:{Cookie:'__Host-solstice-session='+token}});
  const productionHtml=await production.text();
  assert.doesNotMatch(productionHtml,/class="guild-app beta-workspace"|href="\/assets\/beta.css/);
  const betaStyles=await fetch(base+'/assets/beta.css');assert.equal(betaStyles.status,200);assert.match(await betaStyles.text(),/Google Sans/);
  const effects=await fetch(base+'/assets/planner-effects.webp');assert.equal(effects.status,200);assert.equal(Buffer.from(await effects.arrayBuffer()).toString('ascii',8,12),'WEBP');

  const spellAtlas=await fetch(base+'/assets/forever-buffs.webp');
  assert.equal(spellAtlas.status,200);
  assert.equal(spellAtlas.headers.get('content-type'),'image/webp');
  assert.equal(Buffer.from(await spellAtlas.arrayBuffer()).toString('ascii',8,12),'WEBP');
  const atlas=await fetch(base+'/assets/forever-identities.webp');
  assert.equal(atlas.status,200);
  assert.equal(atlas.headers.get('content-type'),'image/webp');
  assert.equal(Buffer.from(await atlas.arrayBuffer()).toString('ascii',8,12),'WEBP');

  for(const [asset,type,expected] of [
    ['theme.css','text/css','--theme-body-bg:#17181e'],
    ['icons.js','javascript','function tablerIcon'],
    ['forever-icons-CREDITS.txt','text/plain','hastecraft/forever-icons'],
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
