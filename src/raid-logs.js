const tokens = new Map();
const pending = new Map();
export function reportCode(value) {
  if (typeof value !== 'string') return null;
  value = value.trim();
  if (/^[A-Za-z0-9]{16}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['forever.warcraftlogs.com','www.warcraftlogs.com','warcraftlogs.com'].includes(url.hostname) || url.username || url.password) return null;
    return /^\/reports\/([A-Za-z0-9]{16})\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch { return null; }
}
async function query(env, query, variables) {
  if (!env.WCL_CLIENT_ID || !env.WCL_CLIENT_SECRET) throw new Error('Warcraft Logs is not connected. Configure WCL_CLIENT_ID and WCL_CLIENT_SECRET on the server.');
  const key = env.WCL_CLIENT_ID;
  let token = tokens.get(key);
  if (!token || token.expires < Date.now()) {
    const response = await fetch('https://www.warcraftlogs.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Basic '+btoa(key+':'+env.WCL_CLIENT_SECRET)},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Warcraft Logs authentication failed. Check the server credentials.');
    const data = await response.json();
    if (!data.access_token) throw new Error('Warcraft Logs did not return an access token.');
    token = {value:data.access_token,expires:Date.now()+Math.max(0,(Number(data.expires_in)||3600)-60)*1000}; tokens.set(key,token);
  }
  const response = await fetch('https://www.warcraftlogs.com/api/v2/client',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token.value},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(25000)});
  if (response.status === 401) tokens.delete(key);
  if (response.status === 429) throw new Error('Warcraft Logs quota reached. Please try again later.');
  if (!response.ok) throw new Error('Warcraft Logs is temporarily unavailable.');
  const data = await response.json();
  if (data.errors?.length || !data.data?.reportData?.report) throw new Error('This report is unavailable. Use a public Warcraft Logs report; private reports are not supported yet.');
  return data.data.reportData.report;
}
async function cached(db,key,loader) {
  const row = await db.prepare('SELECT payload, expires_at FROM raid_log_cache WHERE cache_key = ?').bind(key).first();
  if (row && row.expires_at > Date.now()) return {...JSON.parse(row.payload),cached:true};
  if (!pending.has(key)) pending.set(key,(async()=>{
    const result = {...await loader(),fetchedAt:new Date().toISOString()};
    await db.prepare('INSERT INTO raid_log_cache (cache_key,payload,expires_at) VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at').bind(key,JSON.stringify(result),Date.now()+10*60*1000).run();
    return result;
  })().finally(()=>pending.delete(key)));
  return pending.get(key);
}
export async function raidLogs(env,raid,url,input,organizer,reply) {
  try {
    if (input.action === 'logs-link') {
      if (!organizer) return reply({error:'Only the raid organizer can link a report.'},403);
      const code = reportCode(input.report);
      if (!code) return reply({error:'Enter a valid Warcraft Logs report URL or 16-character report code.'},400);
      await env.DB.prepare('INSERT INTO raid_log_links (raid_id,report_code) VALUES (?,?) ON CONFLICT(raid_id) DO UPDATE SET report_code=excluded.report_code').bind(raid.id,code).run();
      return reply({ok:true});
    }
    const link = await env.DB.prepare('SELECT report_code FROM raid_log_links WHERE raid_id = ?').bind(raid.id).first();
    const configured = Boolean(env.WCL_CLIENT_ID && env.WCL_CLIENT_SECRET);
    if (!link) return reply({configured,report:null});
    const code = link.report_code;
    if (!configured) return reply({configured,report:{code},setupRequired:true});
    const metadata = await cached(env.DB,'wcl:report:'+code,async()=>{
      const report = await query(env,`query($code:String!){reportData{report(code:$code){code title startTime endTime zone{name} fights{ id name encounterID startTime endTime kill fightPercentage inProgress }}}}`,{code});
      return {report:{...report,fights:(report.fights ?? []).filter(f=>f.encounterID>0)}};
    });
    const fightValue = url.searchParams.get('fight');
    if (fightValue === null) return reply({configured,...metadata});
    const fight = metadata.report.fights.find(f=>f.id === Number(fightValue));
    if (!fight || !/^\d+$/.test(fightValue)) return reply({error:'Choose an encounter from this report.'},400);
    const analytics = await cached(env.DB,'wcl:fight:'+code+':'+fight.id,async()=>{
      const report = await query(env,`query($code:String!,$ids:[Int]){reportData{report(code:$code){
        damage:table(dataType:DamageDone,fightIDs:$ids)
        healing:table(dataType:Healing,fightIDs:$ids)
        taken:table(dataType:DamageTaken,fightIDs:$ids)
        interrupts:table(dataType:Interrupts,fightIDs:$ids)
        dispels:table(dataType:Dispels,fightIDs:$ids)
        deaths:events(dataType:Deaths,fightIDs:$ids,limit:1000){data nextPageTimestamp}
      }}}`,{code,ids:[fight.id]});
      return summarizeFight(fight,report);
    });
    return reply({configured,...metadata,analytics});
  } catch(error) { return reply({error:error.message || 'Unable to load raid logs.'},502); }
}
export function summarizeFight(fight,data) {
  const seconds = Math.max(0,(fight.endTime-fight.startTime)/1000);
  const number = value=>Number.isFinite(Number(value)) && Number(value)>=0 ? Number(value) : 0;
  const players = new Map();
  const tables = {};
  for (const metric of ['damage','healing','taken','interrupts','dispels']) {
    const entries = data[metric]?.data?.entries;
    tables[metric] = Array.isArray(entries);
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry.type === 'Pet' || entry.type === 'NPC') continue;
      const id = String(entry.id ?? entry.name);
      const player = players.get(id) ?? {id,name:String(entry.name || 'Unknown'),className:entry.type || '',damage:0,healing:0,taken:0,interrupts:0,dispels:0,deaths:0};
      player[metric] += number(entry.total);
      players.set(id,player);
    }
  }
  const events = Array.isArray(data.deaths?.data) ? data.deaths.data.filter(e=>e.type === 'death' && e.targetIsFriendly !== false) : [];
  const deaths = events.map(e=>{
    const player = players.get(String(e.targetID));
    if (player) player.deaths++;
    return {name:player?.name || 'Actor '+e.targetID,time:Math.max(0,(number(e.timestamp)-fight.startTime)/1000)};
  }).sort((a,b)=>a.time-b.time);
  const rows = [...players.values()].map(p=>({...p,dps:seconds ? p.damage/seconds : null,hps:seconds ? p.healing/seconds : null,dtps:seconds ? p.taken/seconds : null}));
  return {seconds,players:rows.sort((a,b)=>b.damage-a.damage),tables,deaths,deathsComplete:data.deaths?.nextPageTimestamp == null,totals:Object.fromEntries(['damage','healing','taken','interrupts','dispels'].map(k=>[k,rows.reduce((n,p)=>n+p[k],0)]))};
}
