import {setTimeout as delay} from 'node:timers/promises';

const {KOMODO_API_KEY: key,KOMODO_API_SECRET: secret}=process.env;
if(!key||!secret)throw new Error('Komodo deployment credentials are required.');
const endpoint='https://mgmt.aleyasoftware.com';
function safe(text){
  let value=String(text??'');
  for(const credential of [key,secret])value=value.split(credential).join('[redacted]');
  return value.replace(/((?:access_token|refresh_token|client_secret|authorization)\s*[:=]\s*)[^\s,}]+/gi,'$1[redacted]');
}
async function api(group,type,input){
  const response=await fetch(endpoint+'/'+group+'/'+type,{
    method:'POST',headers:{'X-Api-Key':key,'X-Api-Secret':secret,'Content-Type':'application/json'},
    body:JSON.stringify(input),signal:AbortSignal.timeout(30000),
  });
  if(!response.ok)throw new Error(type+' returned HTTP '+response.status);
  return response.json();
}
function report(update){
  console.log(JSON.stringify({operation:update.operation,status:update.status,success:update.success,commit:update.commit_hash}));
  for(const stage of update.logs??[]){
    if(stage.success===false){
      console.log('Failed deployment stage: '+safe(stage.stage??stage.name??stage.command??'unknown'));
      console.log(safe(stage.stderr||stage.stdout||'No stage output.').slice(-8000));
    }
  }
}
async function logs(){
  try{
    const result=await api('read','GetStackLog',{stack:'solstice',services:['solstice'],tail:60,timestamps:true});
    console.log('Solstice container log tail:\n'+safe((result.stdout??'')+'\n'+(result.stderr??'')).slice(-10000));
  }catch(error){console.log('Container log unavailable: '+error.message);}
}
if(process.env.KOMODO_DIAGNOSTIC_UPDATE){
  try{report(await api('read','GetUpdate',{id:process.env.KOMODO_DIAGNOSTIC_UPDATE}));}
  catch(error){console.log('Previous deployment details unavailable: '+error.message);}
  await logs();
}
const receipt=await api('execute','DeployStack',{stack:'solstice'});
const id=receipt._id?.$oid??receipt.id;
if(!id)throw new Error('Deployment returned no update ID.');
console.log('Waiting for Komodo deployment '+id);
let complete=false;
for(let attempt=0;attempt<60;attempt++){
  const update=await api('read','GetUpdate',{id});
  if(update.status==='Complete'){
    report(update);
    if(!update.success){await logs();throw new Error('Komodo deployment failed.');}
    complete=true;break;
  }
  if(attempt%6===0)console.log('Deployment status: '+update.status);
  await delay(5000);
}
if(!complete){await logs();throw new Error('Timed out waiting for Komodo deployment.');}
for(let attempt=0;attempt<20;attempt++){
  try{
    const response=await fetch('https://solsticeguild.net/healthz',{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(10000)});
    if(response.ok&&(await response.text()).trim()==='ok'){
      const stylesheet=await fetch('https://solsticeguild.net/assets/theme.css?healthcheck='+Date.now(),{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(10000)});
      if(stylesheet.ok&&stylesheet.headers.get('content-type')?.includes('text/css')&&(await stylesheet.text()).includes('--theme-body-bg:')){
        console.log('Production health check passed.');process.exit(0);
      }
      console.log('Production stylesheet check failed: HTTP '+stylesheet.status);
    }
    console.log('Production health check: HTTP '+response.status);
  }catch(error){console.log('Production health check: '+error.message);}
  await delay(3000);
}
await logs();throw new Error('Production is not healthy after deployment.');
