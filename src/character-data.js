const finite = value => Number.isFinite(value) ? value : null;
const stat = value => finite(value?.effective ?? value?.value ?? value);

export function characterStatGroups(data) {
 const s = data ?? {};
 const row = (label,value,format='number') => ({label,value:stat(value),format});
 const range = (label,low,high) => ({label,value:Number.isFinite(low) && Number.isFinite(high) ? [low,high] : null,format:'range'});
 return [
  {name:'Base',rows:[row('Health',s.health),row('Mana',s.power_type?.id === 0 || s.power_type?.name === 'Mana' ? s.power : s.mana),...['Strength','Agility','Intellect','Stamina','Spirit'].map(name=>row(name,s[name.toLowerCase()])),row('Mastery',s.mastery,'percent'),row('Movement speed',s.movement_speed,'percent')]},
  {name:'Melee',rows:[row('Attack Power',s.attack_power),range('Main Hand Damage',s.main_hand_damage_min,s.main_hand_damage_max),row('Main Hand Speed',s.main_hand_speed,'speed'),row('Main Hand DPS',s.main_hand_dps,'decimal'),range('Off Hand Damage',s.off_hand_damage_min,s.off_hand_damage_max),row('Off Hand Speed',s.off_hand_speed,'speed'),row('Off Hand DPS',s.off_hand_dps,'decimal'),row('Melee Crit',s.melee_crit,'percent'),row('Melee Hit',s.melee_hit,'percent'),row('Off Hand Hit',s.off_hand_hit,'percent'),row('Off Hand Expertise',s.off_hand_expertise),row('Expertise',s.expertise),row('Armor Penetration',s.armor_penetration)]},
  {name:'Ranged',rows:[row('Ranged Attack Power',s.ranged_attack_power),range('Ranged Damage',s.ranged_damage_min,s.ranged_damage_max),row('Ranged Hit',s.ranged_hit,'percent'),row('Ranged Crit',s.ranged_crit,'percent')]},
  {name:'Spell',rows:[row('Spell Power',s.spell_power),row('Spell Penetration',s.spell_penetration),row('Spell Crit',s.spell_crit,'percent'),row('Mana Regen',s.mana_regen,'decimal'),row('Mana Regen (Combat)',s.mana_regen_combat,'decimal'),row('Spell Hit',s.spell_hit,'percent'),row('Spell Healing',s.spell_healing)]},
  {name:'Defense',rows:[row('Armor',s.armor),row('Defense',s.defense),row('Dodge',s.dodge,'percent'),row('Parry',s.parry,'percent'),row('Block',s.block,'percent'),...['Fire','Holy','Shadow','Nature','Arcane','Frost'].map(name=>row(name+' Resistance',s[name.toLowerCase()+'_resistance']))]},
 ];
}

export function flattenLifetime(data) {
 if (!Array.isArray(data?.categories)) return null;
 const rows=[];
 function walk(categories,parent='') {
  for (const category of categories) {
   const group = [parent,category.name].filter(Boolean).join(' / ');
   for (const item of category.statistics ?? []) if (typeof item.name === 'string' && Number.isFinite(item.quantity)) rows.push({id:item.id,name:item.name,value:item.quantity,group,description:item.description ?? null});
   walk(category.sub_categories ?? [],group);
  }
 }
 walk(data.categories);
 return rows;
}

export function achievementProgress(criteria,definition,earned=false) {
 if (!definition) return {current:earned ? 1 : 0,total:1};
 const children=definition.child_criteria ?? [];
 if (!children.length) {
  const total=Math.max(1,finite(definition.amount) ?? 1);
  return {current:earned || criteria?.is_completed ? total : Math.min(total,Math.max(0,finite(criteria?.amount) ?? 0)),total};
 }
 if (children.length===1) return achievementProgress((criteria?.child_criteria ?? []).find(child=>child.id===children[0].id),children[0],earned || criteria?.is_completed);
 const leaves=[];
 function visit(node){if(node.child_criteria?.length)node.child_criteria.forEach(visit);else leaves.push(node)}
 visit(definition);
 const values=new Map();
 function record(node){if(!node)return;values.set(node.id,node);for(const child of node.child_criteria ?? [])record(child)}
 record(criteria);
 return {current:earned ? leaves.length : leaves.filter(leaf=>values.get(leaf.id)?.is_completed).length,total:leaves.length};
}

const cache=new Map();
async function staticData(token,path) {
 const cached=cache.get(path);
 if(cached?.expires>Date.now())return cached.value;
 const value=fetch('https://us.api.blizzard.com/data/wow/'+path+'?namespace=static-forever-us&locale=en_US',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)}).then(async response=>{
  if(!response.ok)throw Error('Achievement definitions unavailable');
  return response.json();
 }).catch(error=>{cache.delete(path);throw error});
 cache.set(path,{expires:Date.now()+6*60*60*1000,value});
 return value;
}
async function pool(values,work) {
 const result=Array(values.length);let next=0;
 await Promise.all(Array.from({length:Math.min(8,values.length)},async()=>{while(next<values.length){const index=next++;result[index]=await work(values[index]);}}));
 return result;
}
export async function characterAchievements(token,profile,summary) {
 if(!Array.isArray(summary?.achievements))return null;
 const index=await staticData(token,'achievement-category/index');
 const categoryResults=await pool(index.categories ?? [],async ref=>staticData(token,'achievement-category/'+ref.id).catch(()=>null));
 const categories=categoryResults.filter(Boolean);
 const byCategory=new Map(categories.map(category=>[category.id,category]));
 const className=typeof profile.character_class?.name === 'string' ? profile.character_class.name : profile.character_class?.name?.en_US;
 const faction=String(profile.faction?.type ?? profile.faction?.name ?? '').toLowerCase();
 function lineage(id) {const chain=[];const seen=new Set();while(byCategory.has(id)&&!seen.has(id)){seen.add(id);const node=byCategory.get(id);chain.unshift(node);id=node.parent_category?.id;}return chain;}
 const visible=categories.filter(category=>{
  const chain=lineage(category.id);
  if(chain.some(row=>row.is_guild_category || /do not display/i.test(row.name)))return false;
  if(chain[0]?.name === 'Classes' && chain.length>1 && chain[1].name !== className)return false;
  return true;
 });
 const refs=new Map(visible.flatMap(category=>(category.achievements ?? []).map(ref=>[ref.id,ref])));
 for(const progress of summary.achievements) if(!refs.has(progress.id)) refs.set(progress.id,progress.achievement);
 const definitions=await pool([...refs.keys()],async id=>staticData(token,'achievement/'+id).catch(()=>null));
 const progress=new Map(summary.achievements.map(item=>[item.id,item]));
 const items=(await pool(definitions.filter(Boolean),async definition=>{
  const chain=lineage(definition.category?.id);
  if(!chain.length || !visible.some(category=>category.id===definition.category?.id))return null;
  const requiredFaction=String(definition.criteria?.faction?.type ?? '').toLowerCase();
  if(requiredFaction && faction && requiredFaction!==faction)return null;
  const earned=progress.get(definition.id);
  const completed=!!earned?.completed_timestamp || earned?.criteria?.is_completed === true;
  let icon=null;
  try {const media=await staticData(token,'media/achievement/'+(definition.media?.id ?? definition.id));icon=(media.assets ?? []).find(asset=>asset.key==='icon')?.value ?? null;}catch{}
  return {id:definition.id,name:definition.name,description:definition.description ?? '',category:chain[0].name,group:definition.category.name,order:definition.display_order ?? 0,icon,earned:completed,completedAt:earned?.completed_timestamp ?? null,...achievementProgress(earned?.criteria,definition.criteria,completed)};
 })).filter(Boolean);
 const categoryOrder=categories.filter(category=>!category.parent_category).sort((a,b)=>(a.display_order??0)-(b.display_order??0)).map(category=>category.name);
 items.sort((a,b)=>categoryOrder.indexOf(a.category)-categoryOrder.indexOf(b.category)||a.group.localeCompare(b.group)||a.order-b.order||a.name.localeCompare(b.name));
 return {items,partial:categoryResults.some(category=>!category) || definitions.some(definition=>!definition),accountWide:true};
}
