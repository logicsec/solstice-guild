import { gearItems, itemFitsSlot } from './gear-items.js';
const slots=['Head','Neck','Shoulder','Back','Chest','Wrist','Hands','Waist','Legs','Feet','Finger 1','Finger 2','Trinket 1','Trinket 2','Main Hand','Off Hand','Ranged'];
const $=id=>document.getElementById(id);
let builds=[],current=null,catalog=gearItems,draft=new Map(),editingSlot=null,loading=false,loadVersion=0;
const colors={2:'#69bd75',3:'#78acf5',4:'#c89be9',5:'#efad60'};
const statLabels={0:'Strength',1:'Agility',2:'Stamina',3:'Intellect',4:'Healing power',5:'Spell damage',13:'Spirit',14:'Attack power',17:'Hit rating',18:'Crit rating',19:'Haste rating',22:'Defense rating',27:'Armor',29:'Health',30:'Mana',31:'Mana per 5 sec'};
const api=async(data,query='')=>{const r=await fetch('/api/gear-planner'+query,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:undefined);const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j};
function element(tag,text,className){const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node}
function message(s){$('status').textContent=s}
function icon(item){const tile=element('span',item?.icon?'':'◇','gear-icon');if(item?.icon&&/^[a-z0-9_]+$/i.test(item.icon)){const img=element('img');img.src='https://wow.zamimg.com/images/wow/icons/medium/'+item.icon+'.jpg';img.alt='';img.className='gear-icon';img.loading='lazy';img.addEventListener('error',()=>img.replaceWith(tile),{once:true});return img}return tile}
function draw(){
 $('slots').replaceChildren();
 const lookup=new Map(catalog.map(item=>[item.id,item]));
 for(const slot of slots){
  const item=draft.get(slot),details=lookup.get(item?.item_id);
  const box=element('button',null,'gear-slot');box.type='button';box.dataset.slot=slot;box.setAttribute('aria-label',slot+': '+(item?.item_name||'Choose item'));
  box.style.setProperty('--item-color',colors[details?.quality]||'var(--ink)');
  const copy=element('span',null,'gear-slot-copy');copy.append(element('small',slot),element('strong',item?.item_name||(item?'Item '+item.item_id:'Choose item')),element('small',item?[details?.ilvl?'iLvl '+details.ilvl:'',item.priority,details?.source].filter(Boolean).join(' · '):'No target selected'));
  box.append(icon(details),copy);if(item?.acquired)box.append(element('span','Acquired','gear-state'));
  box.addEventListener('click',()=>openPicker(slot));$('slots').append(box);
 }
 const chosen=[...draft.values()];$('buildSummary').replaceChildren();
 for(const [label,value] of [['Slots planned',chosen.length+' / '+slots.length],['Acquired',chosen.filter(item=>item.acquired).length],['BiS targets',chosen.filter(item=>item.priority==='BiS').length]]){const cell=element('div');cell.append(element('strong',value),element('span',label,'muted'));$('buildSummary').append(cell)}
 const stats={};let unknown=0;
 for(const item of chosen){const data=lookup.get(item.item_id);if(!data)unknown++;for(const [key,value] of Object.entries(data?.stats??{})){if(Number.isFinite(value))stats[key]=(stats[key]||0)+value}}
 $('gearStats').replaceChildren();
 for(const [key,label] of Object.entries(statLabels)){if(!stats[key])continue;const row=element('div');row.append(element('span',label),element('strong',new Intl.NumberFormat().format(stats[key])));$('gearStats').append(row)}
 if(!$('gearStats').children.length)$('gearStats').append(element('p','Select gear to see equipment totals.','muted'));
 if(unknown)$('gearStats').append(element('p',unknown+' item(s) missing from catalog totals.','muted'));
 $('equipmentTitle').textContent=$('title').value.trim()||'Target gear';
}
function openPicker(slot){editingSlot=slot;const item=draft.get(slot);$('pickerTitle').textContent=slot;$('itemSearch').value='';$('manualId').value=item?.item_id||'';$('manualName').value=item?.item_name||'';$('itemPriority').value=item?.priority||'Upgrade';$('itemAcquired').checked=!!item?.acquired;$('pickerError').textContent='';$('removeItem').disabled=!item;renderPicker();$('itemPicker').showModal();$('itemSearch').focus()}
function renderPicker(){
 const query=$('itemSearch').value.trim().toLowerCase(),armor=$('armorFilter').value,quality=$('qualityFilter').value,phase=$('phaseFilter').value;
 const items=catalog.filter(item=>itemFitsSlot(item,editingSlot)&&(!phase||(item.phase||1)<=Number(phase))&&(!query||item.name.toLowerCase().includes(query)||String(item.id)===query)&&(!armor||item.armorType===Number(armor))&&(!quality||item.quality===Number(quality))).sort((a,b)=>(b.ilvl-a.ilvl)||a.name.localeCompare(b.name));
 $('pickerCount').textContent=items.length+' matching items · Highest item level first'+(items.length>150?' · Showing first 150; search to narrow results.':'');
 $('pickerResults').replaceChildren();
 for(const item of items.slice(0,150)){
  const button=element('button',null,'picker-row');button.type='button';button.style.setProperty('--item-color',colors[item.quality]||'var(--ink)');
  const copy=element('span');copy.append(element('strong',item.name),element('small',(['','Cloth','Leather','Mail','Plate'][item.armorType]||'Equipment')+' · Requires level '+(item.reqLvl||1)));
  button.append(icon(item),copy,element('span',item.ilvl||'—'),element('span',item.source||'Source not listed','item-source'));
  button.addEventListener('click',()=>applyItem(item.id,item.name));$('pickerResults').append(button);
 }
 if(!items.length)$('pickerResults').append(element('p','No matching items. Adjust the filters or enter an item ID below.','muted'));
 $('pickerResults').scrollTop=0;
}
function applyItem(id,name){
 const catalogItem=catalog.find(item=>item.id===id);
 if(catalogItem&&!itemFitsSlot(catalogItem,editingSlot)){$('pickerError').textContent='That item cannot be equipped in this slot.';return}
 if(editingSlot==='Off Hand'&&catalog.find(item=>item.id===draft.get('Main Hand')?.item_id)?.handType===4){$('pickerError').textContent='Choose a one-handed main hand before adding an off-hand item.';$('pickerError').closest('details').open=true;return}
 const item={slot:editingSlot,item_id:id,item_name:name,priority:$('itemPriority').value,acquired:$('itemAcquired').checked};
 if(catalogItem?.unique){for(const [slot,chosen] of draft){if(slot!==editingSlot&&chosen.item_id===id){$('pickerError').textContent='This unique item is already planned in '+slot+'.';$('pickerError').closest('details').open=true;return}}}
 draft.set(editingSlot,item);
 if(editingSlot==='Main Hand'&&catalogItem?.handType===4)draft.delete('Off Hand');
 $('itemPicker').close();draw();message('Unsaved changes. Save the build to keep this plan.');
}
for(const id of ['itemSearch','armorFilter','qualityFilter','phaseFilter'])$(id).addEventListener(id==='itemSearch'?'input':'change',renderPicker);
$('closePicker').addEventListener('click',()=>$('itemPicker').close());
$('removeItem').addEventListener('click',()=>{draft.delete(editingSlot);$('itemPicker').close();draw();message('Unsaved changes. Save the build to keep this plan.')});
$('manualApply').addEventListener('click',()=>{const id=Number($('manualId').value);if(!Number.isSafeInteger(id)||id<1||id>99999999){$('pickerError').textContent='Enter a valid item ID.';return}const known=catalog.find(item=>item.id===id);applyItem(id,known?.name||$('manualName').value.trim())});
$('itemPriority').addEventListener('change',updateOptions);$('itemAcquired').addEventListener('change',updateOptions);
function updateOptions(){const item=draft.get(editingSlot);if(item){item.priority=$('itemPriority').value;item.acquired=$('itemAcquired').checked;draw();message('Unsaved changes. Save the build to keep this plan.')}}
function selected(){return builds.find(b=>b.id===$('build').value)||null}
function choose(){current=selected();draft=new Map((current?.items??[]).map(item=>[item.slot,{...item,acquired:!!item.acquired}]));$('title').value=current?.title||'';$('spec').value=current?.spec||'';draw()}
async function load(){const version=++loadVersion,character=$('character').value;loading=true;$('save').disabled=true;try{if(!character){builds=[];current=null;draft.clear();$('build').replaceChildren(new Option('New build',''));draw();return}const data=await api(null,'?character='+encodeURIComponent(character));if(version!==loadVersion)return;builds=data.builds;$('build').replaceChildren(new Option('New build',''));for(const b of builds)$('build').add(new Option((b.is_active?'★ ':'')+b.title,b.id));$('build').value=builds[0]?.id||'';choose()}finally{if(version===loadVersion){loading=false;$('save').disabled=!$('character').value}}}
$('character').addEventListener('change',()=>{document.dispatchEvent(new CustomEvent('guild-character-selected',{detail:{name:$('character').value}}));load().catch(e=>message(e.message))});
document.addEventListener('guild-character-change',event=>{const name=event.detail.name;if ([...$('character').options].some(option=>option.value === name) && $('character').value !== name) {$('character').value=name;load().catch(e=>message(e.message));}});$('build').addEventListener('change',choose);$('title').addEventListener('input',()=>$('equipmentTitle').textContent=$('title').value.trim()||'Target gear');
$('save').addEventListener('click',async()=>{
 if(loading)return;
 $('save').disabled=true;
 try{const wasNew=!current;const result=await api({action:'save',id:current?.id,character:$('character').value,title:$('title').value,spec:$('spec').value,items:[...draft.values()]});if(wasNew)await api({action:'activate',id:result.id});await load();$('build').value=result.id;choose();message(wasNew?'Build saved and set active.':'Build saved.')}catch(e){message(e.message)}finally{$('save').disabled=!$('character').value}
});
for(const action of ['activate','delete'])$(action).addEventListener('click',async()=>{if(!current)return message('Select a saved build first.');if(action==='delete'&&!confirm('Delete this build?'))return;try{await api({action,id:current.id});await load();message(action==='activate'?'Active build updated.':'Build deleted.')}catch(e){message(e.message)}});
async function refreshCatalog(){try{const data=await api(null,'?catalog=1');if(!Array.isArray(data.items)||!data.items.length)throw Error('Empty catalog');catalog=data.items;$('catalogStatus').textContent=data.fresh?'WoWSims Forever · '+catalog.length.toLocaleString()+' items · Checked just now':data.source+' · Live refresh unavailable; using saved item data.';draw();if($('itemPicker').open)renderPicker()}catch{$('catalogStatus').textContent='WoWSims refresh unavailable · Using bundled item data.'}}
refreshCatalog();
(async()=>{try{draw();const r=await fetch('/api/raid-characters');if(!r.ok)throw Error('Could not load your characters');const data=await r.json();const names=new Set([...(data.characters||[]),...(data.signupCharacters||[])].map(x=>x.name).filter(Boolean));$('character').replaceChildren(new Option('Select character',''));for(const name of [...names].sort())$('character').add(new Option(name,name));if(names.size){const requested=new URLSearchParams(location.search).get('character')||document.getElementById('guildCharacter')?.value||(()=>{try{return localStorage.getItem('solstice-active-character')}catch{return null}})();$('character').value=[...names].find(n=>n.toLowerCase()===requested?.toLowerCase())||[...names].sort()[0];await load()}else{message('Add or link a character in Guild Hall first.');$('save').disabled=true}}catch(e){message(e.message)}})();
const raidId=new URLSearchParams(location.search).get('raid');
if(raidId){
 $('raidPlanning').hidden=false;
 api(null,'?raid='+encodeURIComponent(raidId)).then(data=>{
  const root=$('raidPlanningResults');root.replaceChildren();
  if(!data.items.length){root.textContent='No active gear targets from confirmed raiders yet.';return}
  const grouped=new Map();
  for(const item of data.items){const key=item.item_id+'|'+item.item_name;const group=grouped.get(key)||[];group.push(item);grouped.set(key,group)}
  for(const [key,items] of grouped){
   const box=document.createElement('div');box.className='slot';box.style.marginBottom='10px';
   const name=document.createElement('strong');name.textContent=items[0].item_name||'Item '+items[0].item_id;
   const link=document.createElement('a');link.href='https://www.wowhead.com/forever/item='+items[0].item_id;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Wowhead';
   const status=document.createElement('p');status.className='muted';status.textContent=items.some(x=>x.onLootTable)?'On raid loot table':'Not on this raid loot table';
   box.append(name,link,status);
   for(const item of items){const p=document.createElement('p');p.textContent=item.character+' · '+item.class_name+' · '+item.priority+(item.acquired?' · Acquired':'')+(item.reserved?' · Reserved':'');box.append(p)}
   root.append(box);
  }
 }).catch(e=>{$('raidPlanningResults').textContent=e.message});
}
