export function matchesGuildRosterFilter(character,{query='',race='',className='',spec='',minLevel='',maxLevel='',professionSlugs=null}={}){
  if(professionSlugs&&!professionSlugs.has(character.armorySlug))return false;
  if(race&&(race==='__unknown__'?!!character.race:character.race!==race))return false;
  if(className&&character.class_name!==className)return false;
  if(spec&&(spec==='__unknown__'?!!character.spec:character.spec!==spec))return false;
  const minimum=minLevel===''?null:Number(minLevel),maximum=maxLevel===''?null:Number(maxLevel);
  if((minimum!==null&&(!Number.isInteger(minimum)||minimum<1||minimum>60))||(maximum!==null&&(!Number.isInteger(maximum)||maximum<1||maximum>60))||(minimum!==null&&maximum!==null&&minimum>maximum))return false;
  if((minimum!==null||maximum!==null)&&!Number.isFinite(character.level))return false;
  if(minimum!==null&&character.level<minimum)return false;
  if(maximum!==null&&character.level>maximum)return false;
  const haystack=[character.name,character.race,character.class_name,character.spec,character.role].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}
