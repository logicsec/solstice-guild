import {sameOriginWrite} from './auth.js';
import {armorySpecs} from './armory.js';
import {createCompositionPlan} from './raid-composition.js';

export function lockedCompositionPlan(input) {
  if(!input || ![10,20,40].includes(input.size) || !Array.isArray(input.players) || !input.players.length || input.players.length>input.size)return null;
  if(input.players.some(player=>!player || !['Tank','Healer','Melee DPS','Ranged DPS'].includes(player.role)))return null;
  const plan=createCompositionPlan(armorySpecs,input).snapshot();
  if(plan.players.length!==input.players.length || plan.players.some((player,index)=>player.group===null || (input.players[index].character!=null && !player.character)))return null;
  return plan;
}
export async function ownedRaidComposition(db,owner,id) {
  if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))return null;
  const record=await db.prepare('SELECT id,title,plan,created_at FROM raid_compositions WHERE id=? AND owner=?').bind(id,owner).first();
  return record?{...record,plan:JSON.parse(record.plan)}:null;
}
export async function raidCompositionsApi(request,env,url,session) {
  const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  const db=env.DB,owner=session?.discord_id;
  if(!owner)return reply({error:'Sign in to save compositions.'},401);
  if(!db)return reply({error:'Composition storage is unavailable.'},503);
  if(request.method==='GET'){
    const {results}=await db.prepare('SELECT id,title,plan,created_at FROM raid_compositions WHERE owner=? ORDER BY created_at DESC,rowid DESC').bind(owner).all();
    return reply({compositions:results.map(record=>({...record,plan:JSON.parse(record.plan)}))});
  }
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  if(!sameOriginWrite(request,url)||!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'Invalid request origin.'},403);
  const input=await request.json().catch(()=>null);
  const title=typeof input?.title==='string'?input.title.trim():'';
  const plan=lockedCompositionPlan(input?.plan);
  if(!title||title.length>80||!plan)return reply({error:'Name the composition and assign every placeholder to a valid group before locking it in.'},400);
  const id=crypto.randomUUID();
  await db.prepare('INSERT INTO raid_compositions(id,owner,title,plan) VALUES(?,?,?,?)').bind(id,owner,title,JSON.stringify(plan)).run();
  return reply({composition:await ownedRaidComposition(db,owner,id)},201);
}
