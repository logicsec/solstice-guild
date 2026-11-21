import { sameOriginWrite } from './auth.js';

const slots = new Set(['Head','Neck','Shoulder','Back','Chest','Wrist','Hands','Waist','Legs','Feet','Finger 1','Finger 2','Trinket 1','Trinket 2','Main Hand','Off Hand','Ranged']);
const priorities = new Set(['BiS','Upgrade','Optional']);
const reply = (data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const clean = (value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const uuid = value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value);
async function ownsCharacter(db,member,name){
 const row=await db.prepare(`SELECT 1 AS ok FROM armory_links WHERE member=? AND name=? COLLATE NOCASE
 UNION SELECT 1 FROM raid_characters WHERE member=? AND name=? COLLATE NOCASE LIMIT 1`).bind(member,name,member,name).first();
 return !!row;
}
async function builds(db,member,character){
 const {results}=await db.prepare('SELECT id,character,title,spec,is_active,updated_at FROM gear_builds WHERE member=? AND character=? COLLATE NOCASE ORDER BY is_active DESC,updated_at DESC').bind(member,character).all();
 for(const build of results){
  const items=await db.prepare('SELECT slot,item_id,item_name,priority,acquired FROM gear_build_items WHERE build_id=? ORDER BY slot').bind(build.id).all();
  build.items=items.results;
 }
 return results;
}
export async function gearPlannerApi(request,env,url,session){
 const db=env.DB,member=session.discord_id;
 if(!db||!member)return reply({error:'Guild sign-in and storage required.'},401);
 if(request.method==='GET'){
  const character=clean(url.searchParams.get('character'),61);
  if(character){
   if(!await ownsCharacter(db,member,character))return reply({error:'Link or save this character first.'},403);
   return reply({builds:await builds(db,member,character)});
  }
  const raidId=url.searchParams.get('raid');
  if(!uuid(raidId))return reply({error:'Choose a character or raid.'},400);
  const raid=await db.prepare('SELECT owner,instance FROM raids WHERE id=?').bind(raidId).first();
  if(!raid||raid.owner!==member)return reply({error:'Only the raid organizer can review raid-wide gear plans.'},403);
  const {results}=await db.prepare(`SELECT s.character,c.class_name,b.title,b.spec,i.slot,i.item_id,i.item_name,i.priority,i.acquired
  FROM raid_signups s LEFT JOIN raid_characters c ON c.member=s.member AND c.name=s.character COLLATE NOCASE JOIN gear_builds b ON b.member=s.member AND b.character=s.character COLLATE NOCASE AND b.is_active=1
  JOIN gear_build_items i ON i.build_id=b.id
  WHERE s.raid_id=? AND s.status='Going' ORDER BY i.item_name COLLATE NOCASE,s.character COLLATE NOCASE`).bind(raidId).all();
  const loot=await db.prepare('SELECT items FROM raid_loot_tables WHERE owner=? AND instance=?').bind(raid.owner,raid.instance).first();
  const allowed=new Set(loot?JSON.parse(loot.items).map(x=>x.toLowerCase()):[]);
  return reply({raid:raidId,items:results.map(x=>({...x,onLootTable:allowed.has(x.item_name.toLowerCase())}))});
 }
 if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
 if(!sameOriginWrite(request,url)||!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'Invalid request origin.'},403);
 let input;try{input=await request.json()}catch{return reply({error:'Invalid JSON.'},400)}
 if(input.action==='save'){
  const character=clean(input.character,61),title=clean(input.title,60),spec=clean(input.spec,40);
  if(!character||!title||!await ownsCharacter(db,member,character))return reply({error:'Select one of your linked or saved characters and name the build.'},400);
  if(!Array.isArray(input.items)||input.items.length>slots.size)return reply({error:'Invalid equipment list.'},400);
  const seen=new Set();
  for(const item of input.items){
   if(!item||!slots.has(item.slot)||seen.has(item.slot)||!Number.isSafeInteger(item.item_id)||item.item_id<1||item.item_id>99999999||!priorities.has(item.priority)||typeof item.acquired!=='boolean'||typeof item.item_name!=='string'||item.item_name.length>120)return reply({error:'Invalid item, slot, or priority.'},400);
   seen.add(item.slot);
  }
  if(input.id!=null&&!uuid(input.id))return reply({error:'Invalid build ID.'},400);
  const id=input.id||crypto.randomUUID();
  const existing=await db.prepare('SELECT member FROM gear_builds WHERE id=?').bind(id).first();
  if(existing&&existing.member!==member)return reply({error:'Build not found.'},404);
  if(existing){const owner=await db.prepare('SELECT character FROM gear_builds WHERE id=? AND member=?').bind(id,member).first();if(owner.character.toLowerCase()!==character.toLowerCase())return reply({error:'A build cannot be moved to another character.'},400)}
  try{
   await db.prepare(`INSERT INTO gear_builds(id,member,character,title,spec,is_active) VALUES(?,?,?,?,?,0)
   ON CONFLICT(id) DO UPDATE SET character=excluded.character,title=excluded.title,spec=excluded.spec,updated_at=CURRENT_TIMESTAMP WHERE member=excluded.member`).bind(id,member,character,title,spec).run();
   await db.prepare('DELETE FROM gear_build_items WHERE build_id=? AND EXISTS(SELECT 1 FROM gear_builds WHERE id=? AND member=?)').bind(id,id,member).run();
   for(const item of input.items)await db.prepare('INSERT INTO gear_build_items(build_id,slot,item_id,item_name,priority,acquired) VALUES(?,?,?,?,?,?)').bind(id,item.slot,item.item_id,item.item_name,item.priority,Number(item.acquired)).run();
   return reply({ok:true,id});
  }catch{return reply({error:'Could not save build. Build names must be unique per character.'},409)}
 }
 if(input.action==='activate'||input.action==='delete'){
  if(!uuid(input.id))return reply({error:'Invalid build.'},400);
  const build=await db.prepare('SELECT character FROM gear_builds WHERE id=? AND member=?').bind(input.id,member).first();
  if(!build)return reply({error:'Build not found.'},404);
  if(input.action==='delete')await db.prepare('DELETE FROM gear_builds WHERE id=? AND member=?').bind(input.id,member).run();
  else {
   await db.prepare('UPDATE gear_builds SET is_active=0 WHERE member=? AND character=? COLLATE NOCASE').bind(member,build.character).run();
   await db.prepare('UPDATE gear_builds SET is_active=1 WHERE id=? AND member=?').bind(input.id,member).run();
  }
  return reply({ok:true});
 }
 return reply({error:'Unknown action.'},400);
}
