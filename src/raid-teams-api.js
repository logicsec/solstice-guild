import {sameOriginWrite} from './auth.js';
import {armorySpecs,fetchGuildRoster,publicRosterProfile,guildProfessionSummary} from './armory.js';
const roles=['Tank','Healer','Melee DPS','Ranged DPS'];
const validId=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value);

export async function guildRoster(env,refresh=false){
  const db=env.DB;
  const cached=await db.prepare('SELECT payload,updated_at FROM guild_roster_snapshots WHERE guild_slug=?').bind('solstice').first();
  let data;
  if(cached&&Date.now()-cached.updated_at<(refresh?30000:300000))data=JSON.parse(cached.payload);
  else try{
    data=await fetchGuildRoster(env);
    await db.prepare('INSERT INTO guild_roster_snapshots(guild_slug,payload,updated_at) VALUES(?,?,?) ON CONFLICT(guild_slug) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind('solstice',JSON.stringify(data),Date.now()).run();
  }catch{
    if(cached&&Date.now()-cached.updated_at<86400000)data={...JSON.parse(cached.payload),warning:'Blizzard is unavailable. Showing the last synced guild roster.'};
    else data={guild:'Solstice',characters:[],source:'linked',updatedAt:null,warning:'Full Blizzard guild roster is unavailable. Showing site-linked characters; refresh to try again.'};
  }
  const linked=(await db.prepare(`SELECT slug,name,class_name,spec,role,member FROM armory_links`).bind().all()).results;
  const manual=(await db.prepare('SELECT name,class_name,spec,role,member FROM raid_characters').bind().all()).results;
  const bySlug=new Map(linked.map(row=>[row.slug,row]));
  data.characters=data.characters.map(character=>{const link=bySlug.get(character.slug);return{...character,spec:link?.spec||character.spec||'',role:link?.role||character.role||'',linked:!!link};});
  if(data.source==='linked')for(const row of [...linked,...manual]){
    const slug=row.slug||row.name.trim().toLowerCase().replace(/\s+/g,'-');
    if(data.characters.some(character=>character.slug===slug))continue;
    data.characters.push({key:'slug:'+slug,slug,name:row.name,className:row.class_name,spec:row.spec,role:row.role,level:null,rank:null,itemLevel:null,linked:!!row.slug});
  }
  return data;
}

const professionCache=new Map();
export async function guildRosterProfessions(env,slugs,cachedOnly=false){
  const key=[...new Set(slugs)].sort().join('|');const cached=professionCache.get(key);
  if(cached&&cached.expires>Date.now())return cached.value;
  if(cachedOnly)return {reviewed:0,professions:[],pending:slugs.length>0};
  const value=guildProfessionSummary(env,slugs);
  professionCache.set(key,{value,expires:Date.now()+300000});
  if(professionCache.size>50)professionCache.delete(professionCache.keys().next().value);
  return value;
}

async function membersFor(db,teamId,roster){
  const rows=(await db.prepare('SELECT * FROM raid_team_members WHERE team_id=? ORDER BY name COLLATE NOCASE').bind(teamId).all()).results;
  return rows.map(row=>{
    const character=roster.characters.find(character=>character.key===row.character_key||character.slug===row.slug);
    return {...(character||{key:row.character_key,name:row.name,slug:row.slug,className:row.class_name,level:null,itemLevel:null,rank:null}),key:row.character_key,guildKey:character?.key??null,spec:row.spec,role:row.role,isMain:!!row.is_main,inGuild:!!character};
  });
}
export async function raidTeamsApi(request,env,url,session){
  const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  const db=env.DB,user=session?.discord_id;
  if(!user)return reply({error:'Sign in to use raid teams.'},401);
  if(!db)return reply({error:'Team storage unavailable.'},503);
  const teamId=url.searchParams.get('team');
  if(teamId&&!validId(teamId))return reply({error:'Team not found.'},404);
  const team=teamId?await db.prepare('SELECT * FROM raid_teams WHERE id=?').bind(teamId).first():null;
  if(teamId&&!team)return reply({error:'Team not found.'},404);
  const canEdit=team?.owner===user;
  if(request.method==='GET'){
    if(!team){
      const {results}=await db.prepare(`SELECT t.id,t.name,t.description,t.size,t.accent,t.created_at,(t.owner=?) AS canEdit,
        (SELECT COUNT(*) FROM raid_team_members m WHERE m.team_id=t.id) AS characters,
        (SELECT COUNT(*) FROM raid_team_members m WHERE m.team_id=t.id AND m.is_main=1) AS mains
        FROM raid_teams t ORDER BY t.created_at DESC,t.name COLLATE NOCASE`).bind(user).all();
      return reply({teams:results});
    }
    const roster=await guildRoster(env);
    const members=await membersFor(db,teamId,roster);
    if(url.searchParams.get('section')==='professions'){
      const slugs=members.map(member=>member.slug).filter(Boolean);
      const summary=await guildRosterProfessions(env,slugs);
      const crafts=(await db.prepare('SELECT character,profession,recipe_name,result_name,note FROM guild_crafts ORDER BY recipe_name COLLATE NOCASE').bind().all()).results
        .filter(craft=>members.some(member=>member.name.toLowerCase()===craft.character.toLowerCase()));
      return reply({...summary,crafts});
    }
    if(url.searchParams.get('profiles')==='1'){
      const selected=members.filter(member=>member.slug).sort((a,b)=>Number(b.isMain)-Number(a.isMain)).slice(0,40);
      for(let offset=0;offset<selected.length;offset+=8)await Promise.all(selected.slice(offset,offset+8).map(async member=>{
        const profile=await publicRosterProfile(env,member.slug);if(profile){member.level=profile.level??member.level;member.itemLevel=profile.itemLevel??null;}
      }));
    }
    return reply({team:{id:team.id,name:team.name,description:team.description,size:team.size,accent:team.accent,canEdit},roster,members});
  }
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
  if(!sameOriginWrite(request,url)||!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'Invalid request origin.'},403);
  const input=await request.json().catch(()=>null);
  if(!input||typeof input!=='object')return reply({error:'Invalid team form.'},400);
  if(input.action==='create'||input.action==='settings'){
    if(input.action==='settings'&&!canEdit)return reply({error:'Only the team leader can change team settings.'},403);
    const name=typeof input.name==='string'?input.name.trim():'';
    const description=typeof input.description==='string'?input.description.trim():'';
    if(!name||name.length>60||description.length>500||![10,20,40].includes(input.size)||!/^#[0-9a-f]{6}$/i.test(input.accent||''))return reply({error:'Enter a team name, raid size and valid banner color.'},400);
    if(input.action==='create'){
      const id=crypto.randomUUID();await db.prepare('INSERT INTO raid_teams(id,owner,name,description,size,accent) VALUES(?,?,?,?,?,?)').bind(id,user,name,description,input.size,input.accent).run();return reply({id},201);
    }
    await db.prepare('UPDATE raid_teams SET name=?,description=?,size=?,accent=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,description,input.size,input.accent,teamId).run();return reply({ok:true});
  }
  if(!team)return reply({error:'Choose a team.'},400);
  if(input.action==='refresh'){return reply({roster:await guildRoster(env,true)});}
  if(!canEdit)return reply({error:'Only the team leader can change this roster.'},403);
  if(input.action==='assign'){
    if(!Array.isArray(input.characters)||!input.characters.length||input.characters.length>150||input.characters.some(key=>typeof key!=='string'))return reply({error:'Select guild characters to assign.'},400);
    const roster=await guildRoster(env);const selected=[...new Set(input.characters)].map(key=>roster.characters.find(character=>character.key===key));
    if(selected.some(character=>!character))return reply({error:'Select characters from the current guild roster.'},400);
    const existing=(await db.prepare('SELECT character_key,slug FROM raid_team_members WHERE team_id=?').bind(teamId).all()).results;
    const additions=selected.filter(character=>!existing.some(row=>row.character_key===character.key||row.slug===character.slug));
    if(existing.length+additions.length>150)return reply({error:'A team can have up to 150 characters, including alts.'},400);
    await db.batch(additions.map(character=>db.prepare('INSERT INTO raid_team_members(team_id,character_key,name,slug,class_name,spec,role) VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING').bind(teamId,character.key,character.name,character.slug,character.className,character.spec,character.role)));
    return reply({ok:true});
  }
  const member=typeof input.character==='string'?await db.prepare('SELECT * FROM raid_team_members WHERE team_id=? AND character_key=?').bind(teamId,input.character).first():null;
  if(!member)return reply({error:'Team character not found.'},404);
  if(input.action==='remove'){
    await db.prepare('DELETE FROM raid_team_members WHERE team_id=? AND character_key=?').bind(teamId,input.character).run();return reply({ok:true});
  }
  if(input.action==='update'){
    const specs=armorySpecs[member.class_name]??[];
    if(typeof input.spec!=='string'||(input.spec&&!specs.some(([name])=>name===input.spec))||(!roles.includes(input.role)&&input.role!=='')||typeof input.isMain!=='boolean')return reply({error:'Choose a valid specialization, role and main/alt status.'},400);
    await db.prepare('UPDATE raid_team_members SET spec=?,role=?,is_main=? WHERE team_id=? AND character_key=?').bind(input.spec,input.role,Number(input.isMain),teamId,input.character).run();return reply({ok:true});
  }
  return reply({error:'Unknown team action.'},400);
}
