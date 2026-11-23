import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import test from 'node:test';
const run=promisify(execFile);
const fixture=success=>`globalThis.fetch=async(url,options)=>{
 if(url.endsWith('/execute/DeployStack'))return Response.json({_id:{$oid:'update-1'},success:true,status:'InProgress'});
 if(url.endsWith('/read/GetUpdate'))return Response.json({status:'Complete',success:${success},logs:${success?'[]':"[{success:false,stage:'start container',stderr:'startup failed: test-api-secret'}]"}});
 if(url.endsWith('/read/GetStackLog'))return Response.json({stderr:'container startup failed',stdout:''});
 if(url==='https://solsticeguild.net/healthz')return new Response('ok');
 if(url.includes('/assets/theme.css?healthcheck='))return new Response(':root{--theme-body-bg:#17181e}',{headers:{'Content-Type':'text/css'}});
 throw new Error('Unexpected network request');
};`;
async function deploy(success){
 return run(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(fixture(success)),'scripts/deploy-komodo.mjs'],{
  cwd:new URL('..',import.meta.url),env:{...process.env,KOMODO_API_KEY:'test-api-key',KOMODO_API_SECRET:'test-api-secret',KOMODO_DIAGNOSTIC_UPDATE:''},
 });
}
test('deployment waits for completion and checks production health',async()=>{
 const {stdout}=await deploy(true);assert.match(stdout,/Production health check passed/);
});
test('accepted deployment receipt does not hide a failed rollout',async()=>{
 await assert.rejects(deploy(false),error=>{
  assert.equal(error.code,1);assert.match(error.stdout,/Failed deployment stage: start container/);
  assert.match(error.stderr,/Komodo deployment failed/);assert.doesNotMatch(error.stdout,/test-api-secret/);
  assert.doesNotMatch(error.stdout,/Production health check passed/);return true;
 });
});
