const slots=['Head','Neck','Shoulder','Back','Chest','Wrist','Hands','Waist','Legs','Feet','Finger 1','Finger 2','Trinket 1','Trinket 2','Main Hand','Off Hand','Ranged'];
const $=id=>document.getElementById(id);
let builds=[],current=null;
const api=async (data,query='')=>{const r=await fetch('/api/gear-planner'+query,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:undefined);const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j};
function message(s){$('status').textContent=s}
function draw(){
 $('slots').replaceChildren();
 for(const slot of slots){
  const item=current?.items?.find(x=>x.slot===slot);
  const box=document.createElement('div');box.className='slot';
  const title=document.createElement('strong');title.textContent=slot;box.append(title);
  const id=document.createElement('input');id.type='number';id.min='1';id.max='99999999';id.placeholder='Wowhead item ID';id.value=item?.item_id||'';
  const name=document.createElement('input');name.placeholder='Item name';name.maxLength=120;name.value=item?.item_name||'';
  const priority=document.createElement('select');for(const v of ['BiS','Upgrade','Optional']){const o=new Option(v,v);priority.add(o)}priority.value=item?.priority||'Upgrade';
  const acquired=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=!!item?.acquired;check.style.width='auto';check.style.display='inline';acquired.append(check,' Acquired');
  const link=document.createElement('a');link.target='_blank';link.rel='noopener noreferrer';link.textContent='View on Wowhead';const refresh=()=>{const n=Number(id.value);link.href=Number.isSafeInteger(n)&&n>0?'https://www.wowhead.com/forever/item='+n:'#';link.hidden=!n};id.addEventListener('input',refresh);refresh();
  box.append(id,name,priority,acquired,link);box.dataset.slot=slot;$('slots').append(box);
 }
}
function selected(){return builds.find(b=>b.id===$('build').value)||null}
function choose(){current=selected();$('title').value=current?.title||'';$('spec').value=current?.spec||'';draw()}
async function load(){const character=$('character').value;if(!character){builds=[];current=null;draw();return}const data=await api(null,'?character='+encodeURIComponent(character));builds=data.builds;$('build').replaceChildren(new Option('New build',''));for(const b of builds)$('build').add(new Option((b.is_active?'★ ':'')+b.title,b.id));$('build').value=builds[0]?.id||'';choose()}
$('character').addEventListener('change',()=>load().catch(e=>message(e.message)));
$('build').addEventListener('change',choose);
$('save').addEventListener('click',async()=>{
 try{
 const items=[];for(const box of $('slots').children){
 const [id,name,priority]=box.querySelectorAll('input,select');const n=Number(id.value);
 if(!id.value)continue;if(!Number.isSafeInteger(n)||n<1||n>99999999)throw Error('Enter a valid item ID.');
 items.push({slot:box.dataset.slot,item_id:n,item_name:name.value.trim(),priority:priority.value,acquired:box.querySelector('input[type=checkbox]').checked});
 }
 const result=await api({action:'save',id:current?.id,character:$('character').value,title:$('title').value,spec:$('spec').value,items});await load();$('build').value=result.id;choose();message('Build saved.');
 }catch(e){message(e.message)}
});
for(const action of ['activate','delete'])$(action).addEventListener('click',async()=>{if(!current)return message('Select a saved build first.');if(action==='delete'&&!confirm('Delete this build?'))return;try{await api({action,id:current.id});await load();message(action==='activate'?'Active build updated.':'Build deleted.')}catch(e){message(e.message)}});
(async()=>{try{
 const r=await fetch('/api/raid-characters');if(!r.ok)throw Error('Could not load your characters');const data=await r.json();
 const names=new Set([...(data.characters||[]),...(data.signupCharacters||[])].map(x=>x.name).filter(Boolean));
 $('character').replaceChildren(new Option('Select character',''));for(const name of [...names].sort())$('character').add(new Option(name,name));
 if(names.size){const requested=new URLSearchParams(location.search).get('character');$('character').value=[...names].find(n=>n.toLowerCase()===requested?.toLowerCase())||[...names].sort()[0];await load()}else{message('Add or link a character in Guild Hall first.');draw()}
}catch(e){message(e.message)}})();

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
   for(const item of items){const p=document.createElement('p');p.textContent=item.character+' · '+item.class_name+' · '+item.priority+(item.acquired?' · Acquired':'');box.append(p)}
   root.append(box);
  }
 }).catch(e=>{$('raidPlanningResults').textContent=e.message});
}
