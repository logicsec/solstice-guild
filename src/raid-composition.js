/** A composition draft contains placeholders, independent of saved raids and sign-ups. */
export function createCompositionPlan(specs, initial = {}) {
  let size = [10,20,40].includes(initial?.size) ? initial.size : 20;
  let nextId = 1;
  let players = [];
  const roles = ['Tank','Healer','Melee DPS','Ranged DPS'];
  const validSpec = (className,spec) => Object.hasOwn(specs,className) && specs[className].some(([name])=>name === spec);
  const choices = (player, values) => {
    player.blessing = ['Kings','Might','Wisdom','Salvation','Light'].includes(values.blessing) ? values.blessing : 'Kings';
    player.aura = ['Devotion','Retribution','Resistance'].includes(values.aura) ? values.aura : 'Devotion';
    player.air = ['Windfury','Grace of Air'].includes(values.air) ? values.air : 'Windfury';
    return player;
  };
  if (Array.isArray(initial?.players)) for (const value of initial.players.slice(0,size)) {
    if (!value || !validSpec(value.className,value.spec)) continue;
    const group = Number.isInteger(value.group) && value.group > 0 && value.group <= size/5 && players.filter(p=>p.group === value.group).length < 5 ? value.group : null;
    players.push(choices({id:String(nextId++),className:value.className,spec:value.spec,role:roles.includes(value.role) ? value.role : specs[value.className].find(([name])=>name === value.spec)[1],group},value));
  }
  return {
    snapshot:()=>({version:1,size,players:players.map(player=>({...player}))}),
    add(className,spec,role) {
      if (!validSpec(className,spec)) throw new Error('Choose a valid class and specialization.');
      if (players.length >= size) throw new Error('The '+size+'-player plan is full.');
      const id = String(nextId++);
      const entry = specs[className].find(([name])=>name === spec);
      const player = choices({id,className,spec,role:roles.includes(role) ? role : entry[1],group:null},{});
      if (className === 'Paladin') player.blessing = ['Kings','Might','Wisdom','Salvation','Light'].find(value=>!players.some(p=>p.className === className && p.blessing === value)) ?? 'Kings';
      if (className === 'Shaman' && players.some(p=>p.className === className && p.air === 'Windfury')) player.air = 'Grace of Air';
      players.push(player);return id;
    },
    move(id,group) {
      const player = players.find(player=>player.id === id);
      if (!player) throw new Error('Select a placeholder first.');
      if (group !== null && (!Number.isInteger(group) || group < 1 || group > size/5)) throw new Error('Choose a valid group.');
      if (group !== null && player.group !== group && players.filter(p=>p.group === group).length >= 5) throw new Error('Group '+group+' is full. Move someone out first.');
      player.group = group;
    },
    update(id,values) { const player=players.find(player=>player.id === id);if (!player) return;choices(player,{...player,...values});if (roles.includes(values.role)) player.role=values.role; },
    remove(id) { players=players.filter(player=>player.id !== id); },
    resize(value) {
      if (![10,20,40].includes(value)) throw new Error('Choose 10, 20 or 40 players.');
      if (players.length > value) throw new Error('Remove '+(players.length-value)+' placeholders before reducing the raid size.');
      size=value;for (const player of players) if (player.group > size/5) player.group=null;
    },
    optimize() {
      const buckets=Array.from({length:size/5},(_,index)=>({group:index+1,members:[]}));
      const partyBuffs=player=>[
        ...(player.className==='Shaman'?['Mana Spring']:[]),
        ...(player.className==='Warlock'?['Blood Pact']:[]),
        ...(player.className==='Priest'&&player.spec==='Shadow'?['Dark Inspiration']:[]),
        ...(player.className==='Paladin'&&player.aura!=='Resistance'?[player.aura]:[]),
      ];
      const ordered=[...players].sort((a,b)=>roles.indexOf(a.role)-roles.indexOf(b.role)||Number(a.id)-Number(b.id));
      for(const player of ordered){
        const benefits=partyBuffs(player);
        const repeatedBuffs=bucket=>bucket.members.filter(other=>partyBuffs(other).some(buff=>benefits.includes(buff))).length;
        const count=(bucket,key,value)=>bucket.members.filter(member=>member[key]===value).length;
        const available=buckets.filter(bucket=>bucket.members.length<5);
        available.sort((a,b)=>a.members.length-b.members.length ||
          repeatedBuffs(a)-repeatedBuffs(b) ||
          count(a,'role',player.role)-count(b,'role',player.role) ||
          count(a,'className',player.className)-count(b,'className',player.className) || a.group-b.group);
        const bucket=available[0];player.group=bucket.group;bucket.members.push(player);
      }
    },
    clear() { players=[]; },
  };
}

export function compositionBuffs(plan) {
  // Scope updates: Blizzard's WoW Forever Beta Development Notes, Oct 15 / Nov 2.
  // https://us.forums.blizzard.com/en/wow/t/2360696
  // UI coverage reference: https://www.raidify.app/planner
  // Availability assumes the displayed spec's talents and the listed aura/totem/pet.
  const rules = [
    ['Power Word: Fortitude','Stamina','Priest','Raid',null,'Stamina'],
    ['Blessing of Kings','Stats','Paladin','Raid',null,'All stats','blessing','Kings'],
    ['Mark of the Wild','Stats','Druid','Raid',null,'Stats, armor and resistances'],
    ['Arcane Intellect','Intellect','Mage','Raid',null,'Intellect'],
    ['Blessing of Might','Attack Power','Paladin','Raid',null,'Attack power','blessing','Might'],
    ['Blessing of Wisdom','Mana Regen','Paladin','Raid',null,'Mana regeneration','blessing','Wisdom'],
    ['Salvation','Threat','Paladin','Raid',null,'Reduced threat','blessing','Salvation'],
    ['Blessing of Light','Healing','Paladin','Raid',null,'Improved Paladin healing','blessing','Light'],
    ['Divine Spirit','Mana Regen','Priest','Raid',null,'Spirit'],
    ['Battle Shout','Attack Power','Warrior','Raid',null,'Attack power'],
    ['Trueshot Aura','Attack Power','Hunter','Raid','Marksmanship','Ranged attack power; requires the talent'],
    ['Moonkin Aura','Crit','Druid','Raid','Balance','Spell critical strike; requires Moonkin form'],
    ['Leader of the Pack','Crit','Druid','Raid','Feral Combat','Melee / ranged critical strike; requires Cat or Bear form'],
    ['Windfury Totem','Damage','Shaman','Raid',null,'Extra melee attacks','air','Windfury'],
    ['Grace of Air Totem','Stats','Shaman','Raid',null,'Agility','air','Grace of Air'],
    ['Strength of Earth Totem','Stats','Shaman','Raid',null,'Strength'],
    ['Mana Spring Totem','Mana Regen','Shaman','Group',null,'Mana regeneration; water totem'],
    ['Dark Inspiration','Mana Regen','Priest','Group','Shadow','Spirit after Mind Blast or a full Mind Flay'],
    ['Blood Pact','Stamina','Warlock','Group',null,'Stamina; requires an active Imp'],
    ['Devotion Aura','Utility','Paladin','Group',null,'Armor','aura','Devotion'],
    ['Retribution Aura','Utility','Paladin','Group',null,'Reflects damage','aura','Retribution'],
    ['Resistance Aura','Resistance','Paladin','Raid',null,'Choose Fire, Frost or Shadow resistance for the encounter','aura','Resistance'],
  ];
  const assigned = plan.players.filter(player=>player.group !== null);
  const occupied = [...new Set(assigned.map(player=>player.group))].sort((a,b)=>a-b);
  const shortNames=['Fort','Kings','MotW','AI','Might','Wisdom','Salv','Light','DS','BS','TSA','Moonkin','LotP','WF','GoA','SoE','MST','DI','BP','Aura','Ret Aura','Res Aura'];
  return rules.map(([name,category,className,scope,spec,description,choice,value],iconIndex)=>{
    const candidates=assigned.filter(player=>player.className === className && (!spec || player.spec === spec));
    const providers=candidates.filter(player=>!choice || player[choice] === value);
    const groups=scope === 'Raid' && providers.length ? occupied : [...new Set(providers.map(player=>player.group))].sort((a,b)=>a-b);
    return {name,shortName:shortNames[iconIndex],category,className,scope,spec,description,iconIndex,groups,providers:providers.length,available:candidates.length>0,covered:providers.length>0,complete:providers.length>0 && (scope === 'Raid' || groups.length === occupied.length),choice,value};
  });
}

export function compositionCapabilities(plan) {
  // Baseline class utility; pet-dependent dispels are excluded. Counts are providers,
  // not simultaneous casts. Talent cooldowns assume the named specialization.
  // Priest updates: https://news.blizzard.com/en-us/article/24301514/
  const assigned=plan.players.filter(p=>p.group!==null);
  const count=predicate=>assigned.filter(predicate).length;
  const classes=(...names)=>p=>names.includes(p.className);
  const entries=[
    ['Interrupts',classes('Warrior','Rogue','Mage','Shaman'),0,'Pummel / Shield Bash, Kick, Counterspell, Earth Shock'],
    ['Magic dispels',classes('Priest','Paladin'),1,'Dispel Magic / Cleanse; friendly magic removal'],
    ['Curse removal',classes('Mage','Druid'),2,'Remove Lesser Curse / Remove Curse'],
    ['Poison cures',classes('Druid','Paladin','Shaman'),3,'Cure / Abolish Poison, Cleanse, Poison Cleansing Totem'],
    ['Disease cures',classes('Priest','Paladin','Shaman'),4,'Cure / Abolish Disease, Cleanse, Disease Cleansing Totem'],
    ['Purge',classes('Shaman','Priest'),5,'Purge / offensive Dispel Magic; pet-dependent effects excluded'],
    ['Tranq Shot',classes('Hunter'),6,'Tranquilizing Shot; requires learning the ability'],
    ['Battle res',classes('Druid'),7,'Rebirth; Soulstone is not counted as a direct battle resurrection'],
    ['Fear Ward',classes('Priest'),8,'Fear Ward'],
    ['Power Infusion',p=>p.className==='Priest'&&p.spec==='Discipline',9,'Power Infusion; assumes the Discipline talent'],
    ['Innervate',classes('Druid'),10,'Innervate'],
    ['Healing',p=>p.className==='Druid'||p.className==='Priest'&&p.spec==='Shadow'||p.className==='Paladin'&&p.spec==='Holy',11,'Tranquility, Shadow Priest Vampiric Embrace, Holy Paladin Divine Favor; assumes specialization talents'],
    ['Defensives',classes('Warrior','Paladin','Mage','Rogue','Druid'),12,'Shield Wall, Divine Shield, Ice Block, Evasion or Barkskin; personal defensives, not raid mitigation'],
  ];
  const debuffs=[
    ['Major armor reduction',classes('Warrior','Rogue'),13,'Sunder Armor / Expose Armor; alternatives do not stack'],
    ['Faerie Fire',classes('Druid'),14,'Faerie Fire'],
    ['Hunter’s Mark',classes('Hunter'),15,'Hunter’s Mark'],
    ['Curse of the Elements',classes('Warlock'),16,'One planned curse per Warlock; other curses are not counted'],
    ['Attack power reduction',p=>p.className==='Warrior'||p.className==='Druid'&&p.spec==='Feral Combat',17,'Demoralizing Shout / Roar; alternative effects do not stack'],
    ['Thunder Clap',classes('Warrior'),18,'Attack-speed reduction'],
    ['Insect Swarm',classes('Druid'),19,'Insect Swarm; baseline Forever ability'],
  ];
  const map=([name,predicate,iconIndex,description])=>({name,count:count(predicate),iconIndex,description});
  return {utility:entries.slice(0,8).map(map),single:entries.slice(8,11).map(map),cooldowns:entries.slice(11).map(map),debuffs:debuffs.map(map).filter(e=>e.count>0)};
}

export function renderRaidComposition(root, {specs, storageKey = 'solstice-composition-v1', request = null, defaultSize = 10, raidNames = {}, chooseRaid = false, getCharacter = () => null}) {
  const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text != null)node.textContent=text;if(cls)node.className=cls;return node;};
  const button=(text,action,cls)=>{const node=make('button',text,cls);node.type='button';node.addEventListener('click',action);return node;};
  const heading=(text,icon)=>{const h=make('h3');h.append(tablerIcon(icon,'card-header-icon'),document.createTextNode(text));return h;};
  let sharedPlan;
  let url;
  try {
    url = new URL(window.location.href);
    const payload = new URLSearchParams(url.hash.slice(1)).get('lineup');
    if (payload && payload.length <= 16000) {
      const plan = JSON.parse(payload);
      if (plan?.version === 1 && [10,20,40].includes(plan.size) && Array.isArray(plan.players)) sharedPlan = plan;
    }
  } catch {}
  let initial;
  try { initial = JSON.parse(localStorage.getItem(storageKey)); } catch {}
  let model = createCompositionPlan(specs, sharedPlan ?? initial ?? {size:defaultSize});
  let locked = !sharedPlan && initial?.lockedId ? {id:initial.lockedId,title:'Loading saved composition…'} : null;
  let savedCompositions = [];
  let selected = null;
  let dragged = null;
  let draggedSpec = null;
  let choosing = chooseRaid && !sharedPlan;
  const roleIcons={'Tank':'shield-check','Healer':'heart','Melee DPS':'swords','Ranged DPS':'target'};
  const controls=make('header',null,'comp-controls');
  const title=make('h3',null,'comp-plan-title');
  const sizes=make('div',null,'comp-sizes');
  sizes.setAttribute('role','group');
  sizes.setAttribute('aria-label','Raid size');
  const sizeButtons = [10,20,40].map(value=>{
    const control = button(String(value),()=>{
      if (locked || value === model.snapshot().size) return;
      try { model.resize(value); commit('Raid size updated.'); }
      catch (error) { status.textContent=error.message; }
    });
    control.setAttribute('aria-label',value+' players');
    sizes.append(control);
    return [value,control];
  });
  const saveStatus=make('small',null,'comp-save-status');
  const actions=make('div',null,'comp-actions');
  const status=make('p','','comp-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const groups=make('div',null,'comp-groups');
  const unassigned=make('section',null,'raid-card comp-unassigned');
  const picker=make('div',null,'comp-picker');
  picker.setAttribute('role','group');
  picker.setAttribute('aria-label','Class specializations');
  const settings=make('section',null,'raid-card comp-settings');
  const issues=make('section',null,'raid-card comp-issues');
  const raidHas=make('section',null,'raid-card comp-raid-has');
  const main=make('div',null,'comp-main');
  main.append(picker,groups,unassigned);
  const side=make('aside',null,'comp-sidebar');
  side.setAttribute('aria-label','Raid coverage and seat settings');
  side.append(settings,raidHas);
  const layout=make('div',null,'comp-layout');
  layout.append(issues,main,side);
  const savedBar=make('details',null,'comp-saved-bar');
  const savedLabel=make('label','Saved compositions');
  const savedSelect=make('select');
  savedSelect.setAttribute('aria-label','Saved compositions');
  savedSelect.add(new Option('Choose a locked composition',''));
  savedLabel.append(savedSelect);
  const dialog=make('dialog',null,'comp-lock-dialog');dialog.setAttribute('aria-label','Lock in composition');
  const lockForm=make('form');const lockTitle=make('h3','Lock In Composition');
  const nameLabel=make('label','Composition name');const nameInput=make('input');nameInput.required=true;nameInput.maxLength=80;nameInput.placeholder='e.g. Hyjal balanced comp';nameLabel.append(nameInput);
  const lockStatus=make('p');lockStatus.setAttribute('role','status');
  const saveLocked=button('Save locked composition',()=>{});saveLocked.type='submit';
  lockForm.append(lockTitle,make('p','Save a fixed copy for raid creation. You can make a new draft without changing the saved version.'),nameLabel,saveLocked,button('Cancel',()=>dialog.close()),lockStatus);dialog.append(lockForm);
  const lockButton=button('Save to my guild',()=>{
    const plan=model.snapshot();
    if(locked||!request)return;
    if(!plan.players.length||plan.players.some(player=>player.group===null)){status.textContent='Assign every placeholder to a group before locking in. Auto-Optimize can do this for you.';return;}
    nameInput.value=plan.size+'-player composition';lockStatus.textContent='';dialog.showModal();nameInput.focus();
  },'comp-lock');
  const draftButton=button('Edit as draft',()=>{locked=null;savedSelect.value='';persist();draw();status.textContent='Editing a draft copy. The locked composition is unchanged.';});
  const clear=button('Clear lineup',()=>{if(locked)return;if(model.snapshot().players.length&&!window.confirm('Clear all placeholders from this composition?'))return;model.clear();selected=null;commit('Composition cleared.');});
  clear.replaceChildren(tablerIcon('trash'),document.createTextNode('Clear lineup'));
  lockButton.replaceChildren(tablerIcon('users'),document.createTextNode('Save to my guild'));
  const shareDialog = make('dialog',null,'comp-lock-dialog');
  shareDialog.setAttribute('aria-label','Share lineup');
  const shareField = make('input');
  shareField.readOnly = true;
  shareField.setAttribute('aria-label','Lineup link');
  const copyLink = async () => {
    try {
      await window.navigator.clipboard.writeText(shareField.value);
      shareDialog.close();
      status.textContent='Lineup link copied.';
    } catch {
      if (!shareDialog.open) shareDialog.showModal();
      shareField.select();
    }
  };
  shareDialog.append(make('h3','Share lineup'),shareField,button('Copy link',copyLink),button('Close',()=>shareDialog.close()));
  const share=button('Share link',()=>{
    if (!url) return;
    const link = new URL(window.location.href);
    link.hash = new URLSearchParams({lineup:JSON.stringify(model.snapshot())}).toString();
    shareField.value = link.href;
    copyLink();
  },'comp-share');
  share.replaceChildren(tablerIcon('copy'),document.createTextNode('Share link'));
  function savedOptions(){savedSelect.replaceChildren(new Option('Choose a locked composition',''));for(const entry of savedCompositions)savedSelect.add(new Option(entry.title+' · '+entry.plan.players.length+'/'+entry.plan.size,entry.id));savedSelect.value=locked?.id??'';}
  function openSaved(entry){model=createCompositionPlan(specs,entry.plan);locked=entry;selected=null;persist();draw();status.textContent='Locked composition: '+entry.title+'. Choose Edit as draft to make changes.';}
  savedSelect.addEventListener('change',()=>{const entry=savedCompositions.find(entry=>entry.id===savedSelect.value);if(entry)openSaved(entry);});
  lockForm.addEventListener('submit',async event=>{
    event.preventDefault();if(!request||saveLocked.disabled)return;
    saveLocked.disabled=true;lockStatus.textContent='Saving…';
    try{const result=await request({title:nameInput.value.trim(),plan:model.snapshot()});savedCompositions.unshift(result.composition);openSaved(result.composition);savedOptions();dialog.close();status.textContent='Locked in as '+result.composition.title+'. Saved to your account for raid creation.';}
    catch(error){lockStatus.textContent=error.message;}
    finally{saveLocked.disabled=false;}
  });
  const optimize=button('Auto-Optimize',()=>{
    if(locked)return;
    if(!model.snapshot().players.length){status.textContent='Add some class and spec placeholders first.';return;}
    model.optimize();selected=null;commit('All placeholders distributed evenly across groups. You can still move anyone manually.');
  },'comp-optimize');
  optimize.replaceChildren(tablerIcon('sparkles'),document.createTextNode('Auto-Optimize'));optimize.title='Redistribute all placeholders evenly, spreading roles, classes and group buff providers.';
  const options=make('div',null,'comp-options');
  options.append(optimize,draftButton,savedLabel);
  savedLabel.hidden=!request;
  savedBar.append(make('summary','Lineup options'),options);
  actions.append(clear,lockButton,share);
  const back = button('Raid selection',()=>{
    choosing=true;
    renderScreen();
    selectionTitle.focus();
  },'comp-back');
  if (chooseRaid && !sharedPlan) controls.append(back);
  controls.append(title,sizes,saveStatus,actions);
  const planner=make('div',null,'composition-planner');
  planner.append(controls,status,layout,savedBar,dialog,shareDialog);
  const selection=make('section',null,'comp-selection');
  const selectionTitle=make('h3','Raid planner','comp-selection-title');
  selectionTitle.tabIndex=-1;
  const selectionGrid=make('div',null,'comp-selection-grid');
  const raidList=make('div',null,'comp-selection-choices');
  const rows=make('div',null,'comp-selection-rows');
  const selectionStatus=make('p',null,'comp-selection-status');
  selectionStatus.setAttribute('role','status');
  const profile=make('aside',null,'comp-selection-profile');
  selectionGrid.append(raidList,profile);
  selection.append(selectionTitle,selectionGrid);
  raidList.append(make('h4','Plan a raid','comp-selection-label'),rows,selectionStatus,
    make('p','Drafts are saved in this browser. Share a snapshot by link or save a lineup to your guild.','comp-selection-note'));
  for (const size of [10,20,40]) {
    const row=button('',()=>{
      try {
        if (size!==model.snapshot().size) {
          model.resize(size);
          locked=null;
          savedSelect.value='';
          selected=null;
          persist();
        }
        choosing=false;
        selectionStatus.textContent='';
        renderScreen();
        draw();
        title.focus();
      } catch (error) { selectionStatus.textContent=error.message; }
    },'comp-selection-row');
    const capacity=make('span',null,'comp-selection-capacity');
    capacity.append(make('strong',String(size)),make('small','players'));
    const info=make('span',null,'comp-selection-info');
    info.append(make('strong',raidNames[size]||size+'-player raid'),make('small',size/5+' parties of five'));
    const parties=make('span',null,'comp-selection-parties');
    parties.setAttribute('aria-hidden','true');
    for (let party=0;party<size/5;party++) {
      const dots=make('span');
      for(let seat=0;seat<5;seat++) dots.append(make('i'));
      parties.append(dots);
    }
    const chevron=tablerIcon('chevron-right');
    info.append(parties);
    row.append(capacity,info,chevron);
    rows.append(row);
  }
  title.tabIndex=-1;

  function drawProfile() {
    profile.replaceChildren(make('h4','You in a raid','comp-selection-label'));
    const character=getCharacter();
    if (!character?.class_name) {
      profile.append(make('p','Choose an active character to see what they bring to a raid.'));
      return;
    }
    const {class_name:className,spec,name,role}=character;
    const identity=make('div',null,'comp-selection-character');
    identity.dataset.wowClass=className;
    const details=make('div');
    details.append(make('strong',[spec,className].filter(Boolean).join(' ')),make('small',name));
    identity.append(spec?guildIcon('spec',spec,'',className):guildIcon('class',className),details);
    profile.append(identity);
    const preview=createCompositionPlan(specs,{size:10,players:[{className,spec:spec||specs[className]?.[0]?.[0],role,group:1}]});
    const buffs=compositionBuffs(preview.snapshot()).filter(buff=>buff.covered && (spec||!buff.spec));
    if (!buffs.length) return;
    const chips=make('div',null,'comp-selection-profile-buffs');
    for (const buff of buffs) {
      const chip=make('span',null,'comp-selection-buff');
      chip.title=buff.description;
      const icon=make('span',null,'comp-spell-icon');
      icon.style.backgroundPosition=(buff.iconIndex%5*25)+'% '+(Math.floor(buff.iconIndex/5)*25)+'%';
      chip.append(icon,make('span',buff.name));
      chips.append(chip);
    }
    profile.append(make('h4','You bring','comp-selection-label'),chips);
  }

  selection.addEventListener('planner-character-change',drawProfile);
  function renderScreen() {
    if (choosing) drawProfile();
    root.replaceChildren(choosing?selection:planner);
  }
  renderScreen();
  function persist() {
    if (sharedPlan) return;
    try { localStorage.setItem(storageKey,JSON.stringify({...model.snapshot(),lockedId:locked?.id??null})); }
    catch { status.textContent='Draft could not be saved on this browser.'; }
  }
  function commit(message){persist();draw();status.textContent=message;}
  function move(id,group){if(locked){status.textContent='Choose Edit as draft before moving placeholders.';return;}try{const player=model.snapshot().players.find(player=>player.id===id);model.move(id,group);selected=null;commit(player.spec+' '+player.className+' moved to '+(group===null?'Unassigned':'Group '+group)+'.');}catch(error){draw();status.textContent=error.message;}}
  function destination(node,group){
    node.addEventListener('dragover',event=>{if(locked)return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect=draggedSpec?'copy':'move';node.classList.add('is-drop-target');});
    node.addEventListener('dragleave',()=>node.classList.remove('is-drop-target'));
    node.addEventListener('drop',event=>{
      event.preventDefault();
      event.stopPropagation();
      node.classList.remove('is-drop-target');
      if (locked) return;
      const id = event.dataTransfer?.getData('application/x-solstice-composition') || dragged;
      if (id) move(id,group);
      else if (draggedSpec) addSpec(...draggedSpec,group);
      dragged = null;
      draggedSpec = null;
    });
  }
  function playerCard(player){
    const row=make('div',null,'comp-player');row.dataset.wowClass=player.className;row.draggable=!locked;row.dataset.playerId=player.id;
    row.addEventListener('dragstart',event=>{if(locked){event.preventDefault();return;}dragged=player.id;event.dataTransfer.setData('application/x-solstice-composition',player.id);event.dataTransfer.setData('text/plain',player.spec+' '+player.className);event.dataTransfer.effectAllowed='move';row.classList.add('is-dragging');});
    row.addEventListener('dragend',()=>{dragged=null;row.classList.remove('is-dragging');for(const target of root.querySelectorAll('.is-drop-target'))target.classList.remove('is-drop-target');});
    const select=button('',()=>{selected=selected===player.id?null:player.id;draw();root.querySelector('[data-player-select="'+player.id+'"]')?.focus();status.textContent=selected?'Choose an empty slot or use Move to for '+player.spec+' '+player.className+'.':'Selection cleared.';},'comp-player-select');
    select.dataset.playerSelect=player.id;select.setAttribute('aria-pressed',String(selected===player.id));select.setAttribute('aria-label','Select '+player.spec+' '+player.className+' to move');
    const label=(player.spec==='Feral Combat'?(player.role==='Tank'?'Feral (Bear)':'Feral (Cat)'):player.spec)+' '+player.className;
    select.title=label+' · '+player.role;
    const identity=make('span');identity.append(make('strong',label),make('small',player.role));
    const artwork=make('span',null,'comp-player-artwork');
    const roleIcon=tablerIcon(roleIcons[player.role],'comp-player-role');roleIcon.dataset.role=player.role;
    artwork.append(guildIcon('spec',player.spec,'',player.className),roleIcon);
    select.append(artwork,identity);
    const remove=button('',event=>{
      event.stopPropagation();if(locked)return;
      if(player.group!==null){move(player.id,null);return;}
      model.remove(player.id);if(selected===player.id)selected=null;
      commit(player.spec+' '+player.className+' removed.');
    },'comp-remove');
    const removeLabel=player.group===null?'Remove '+player.spec+' '+player.className:'Move '+player.spec+' '+player.className+' to Unassigned';
    remove.append(tablerIcon('x'));remove.setAttribute('aria-label',removeLabel);remove.title=removeLabel;remove.disabled=!!locked;
    row.append(select,remove);return row;
  }
  function draw(){
    const plan=model.snapshot();const coverage=compositionBuffs(plan);const assigned=plan.players.filter(player=>player.group!==null);const chosen=plan.players.find(player=>player.id===selected);
    lockButton.disabled=!!locked||!request;
    lockButton.hidden=!request;
    draftButton.hidden=!locked;
    optimize.disabled=!!locked;
    clear.disabled=!!locked;
    title.replaceChildren(document.createTextNode('Your '+plan.size+'-player plan'));
    if (raidNames[plan.size]) title.append(make('span',' · '+raidNames[plan.size]));
    saveStatus.textContent=assigned.length+' of '+plan.size+' placed · '+(locked?'Saved: '+locked.title:sharedPlan?'Shared lineup':'Saved in this browser');
    for (const [size,control] of sizeButtons) {
      control.disabled=!!locked;
      control.setAttribute('aria-pressed',String(size===plan.size));
    }

    groups.replaceChildren();
    for(let group=1;group<=plan.size/5;group++){
      const members=assigned.filter(player=>player.group===group);const card=make('section',null,'comp-group');destination(card,group);
      const title=make('h4','Party '+group);
      const roleLabel = members.length > 0 && members.every(player=>player.role===members[0].role) ? members[0].role : '';
      if (roleLabel) title.append(make('small',roleLabel));
      card.append(title);
      for(const player of members)card.append(playerCard(player));
      for(let slot=members.length;slot<5;slot++){
        const empty=button(selected?'Place selected':'Empty',()=>{if(selected)move(selected,group);else status.textContent='Add a class and spec, then drag or select a placeholder to place it.';},'comp-empty');empty.disabled=!!locked;empty.setAttribute('aria-label','Group '+group+', empty slot '+(slot+1)+(selected?', place selected placeholder':''));empty.replaceChildren(tablerIcon('plus'),make('span',selected?'Place selected':'Empty'));card.append(empty);
      }
      const groupBuffs=coverage.filter(buff=>buff.scope==='Group'&&buff.groups.includes(group));
      const hasManaUsers=members.some(player=>!['Warrior','Rogue'].includes(player.className));
      const missing=coverage.filter(buff=>buff.name==='Mana Spring Totem'&&buff.available&&!buff.groups.includes(group)&&hasManaUsers);
      const hint=make('div',null,'comp-group-hint');
      for(const buff of [...groupBuffs,...missing]){
        const covered=buff.groups.includes(group);const chip=make('span',(covered?'':'× ')+buff.shortName,'comp-buff-chip');
        chip.dataset.state=covered?'covered':'missing';chip.title=buff.name+' — '+buff.description+(covered?' (available in this group)':' (missing from this group)');
        chip.setAttribute('aria-label',buff.name+': '+(covered?'available':'missing'));hint.append(chip);
      }
      if(groupBuffs.length||missing.length)card.append(hint);
      groups.append(card);
    }
    const pool=plan.players.filter(player=>player.group===null);unassigned.replaceChildren(heading('Unassigned ('+pool.length+')','users'));
    const poolRows=make('div',null,'comp-pool');destination(poolRows,null);
    for(const player of pool)poolRows.append(playerCard(player));
    unassigned.hidden=!pool.length&&!chosen;
    unassigned.append(poolRows,button('Move selected to Unassigned',()=>{if(selected)move(selected,null);},'comp-return'));unassigned.lastElementChild.hidden=!selected||chosen?.group===null;unassigned.lastElementChild.disabled=!!locked;
    for(const control of specButtons) {
      control.disabled=!!locked||plan.players.length>=plan.size;
      control.draggable=!control.disabled;
    }
    settings.hidden=!chosen;
    if(chosen){
      settings.replaceChildren(heading('Selected Placeholder','adjustments-horizontal'),make('p',chosen.spec+' '+chosen.className));
      const field=(label,values,value,action)=>{const wrapper=make('label',label);const select=make('select');for(const [key,title] of values)select.add(new Option(title,key));select.value=String(value);select.disabled=!!locked;select.addEventListener('change',()=>{if(!locked)action(select.value);});wrapper.append(select);settings.append(wrapper);};
      field('Move to',[[0,'Unassigned'],...Array.from({length:plan.size/5},(_,i)=>[i+1,'Group '+(i+1)])],chosen.group??0,value=>move(chosen.id,Number(value)||null));
      field('Role',['Tank','Healer','Melee DPS','Ranged DPS'].map(role=>[role,role]),chosen.role,value=>{model.update(chosen.id,{role:value});commit('Role updated.');});
      if(chosen.className==='Paladin'){
        field('Blessing',['Kings','Might','Wisdom','Salvation','Light'].map(value=>[value,value]),chosen.blessing,value=>{model.update(chosen.id,{blessing:value});commit('Blessing updated.');});
        field('Aura',['Devotion','Retribution','Resistance'].map(value=>[value,value]),chosen.aura,value=>{model.update(chosen.id,{aura:value});commit('Aura updated.');});
      }
      if(chosen.className==='Shaman')field('Air totem',['Windfury','Grace of Air'].map(value=>[value,value]),chosen.air,value=>{model.update(chosen.id,{air:value});commit('Air totem updated.');});
    }
    const needsHeader=make('header',null,'comp-needs-header');
    needsHeader.append(make('h3','Needs'),make('p','What to change, most important first'));
    issues.replaceChildren(needsHeader);
    let issueCount=0;
    const issue=(title,detail)=>{
      const row=make('div',null,'comp-issue');
      row.append(make('strong',title));
      if (detail) row.append(make('small',detail));
      issues.append(row);
      issueCount++;
    };
    if (assigned.length < 2) issue('Place at least two players');
    else {
      if (!assigned.some(player=>player.role==='Tank')) issue('No tanks assigned','Add a tank or change a player’s role.');
      if (!assigned.some(player=>player.role==='Healer')) issue('No healers assigned','Add a healer to the assigned lineup.');
      for (const buff of ['Power Word: Fortitude','Blessing of Kings','Mark of the Wild']) {
        if (!coverage.find(entry=>entry.name===buff)?.covered) issue('Missing '+buff);
      }
      for (const buff of coverage.filter(buff=>buff.scope==='Group'&&buff.covered&&!buff.complete)) {
        issue(buff.name+' covers Party '+buff.groups.join(', '),'Move or add a provider to cover another party.');
      }
    }
    if (!issueCount) issues.append(make('p','Core buffs, tanks, and healers are represented.','comp-success'));
    drawCoverage(coverage,compositionCapabilities(plan));
  }

  function addSpec(className,name,role,group=null) {
    if (locked) return;
    if (group !== null && model.snapshot().players.filter(player=>player.group===group).length >= 5) {
      status.textContent='Party '+group+' is full.';
      return;
    }
    try {
      const id = model.add(className,name,role);
      if (group !== null) model.move(id,group);
      selected = group === null ? id : null;
      commit(name+' '+className+(group === null?' added to Unassigned. Choose an empty seat.':' added to Party '+group+'.'));
    } catch (error) { status.textContent=error.message; }
  }

  function drawCoverage(coverage, capabilities) {
    raidHas.replaceChildren(make('h3','What the raid has'));
    const section = (label,count) => {
      const block = make('section');
      const title = make('h4',label);
      if (count != null) title.append(make('strong',String(count)));
      block.append(title);
      raidHas.append(block);
      return block;
    };
    const raidBuffs = coverage.filter(buff=>buff.scope==='Raid');
    const raid = section('Raid-wide buffs',raidBuffs.filter(buff=>buff.covered).length);
    const icons = make('div',null,'comp-buff-icons');
    for (const buff of raidBuffs) {
      const icon = make('span',null,'comp-spell-icon comp-buff-icon');
      icon.dataset.buffName=buff.name;
      icon.dataset.state=buff.covered?'covered':'missing';
      icon.style.backgroundPosition=(buff.iconIndex%5*25)+'% '+(Math.floor(buff.iconIndex/5)*25)+'%';
      icon.title=buff.name+' · '+buff.providers+' provider'+(buff.providers===1?'':'s')+' · '+buff.description;
      icon.setAttribute('role','img');
      icon.setAttribute('aria-label',icon.title);
      icons.append(icon);
    }
    raid.append(icons);
    const effectIcon = entry => {
      const icon = make('span',null,'comp-effect-icon');
      icon.style.backgroundPosition=(entry.iconIndex%5*25)+'% '+(Math.floor(entry.iconIndex/5)*100/3)+'%';
      return icon;
    };
    const debuffs = section('Debuffs on the boss',capabilities.debuffs.length);
    const debuffIcons = make('div',null,'comp-buff-icons');
    for (const entry of capabilities.debuffs) {
      const icon=effectIcon(entry);
      icon.title=entry.name+' · '+entry.count+' providers · '+entry.description;
      icon.setAttribute('role','img');
      icon.setAttribute('aria-label',icon.title);
      debuffIcons.append(icon);
    }
    debuffs.append(capabilities.debuffs.length?debuffIcons:make('small','None yet.'));
    for (const [label,entries] of [['Utility',capabilities.utility],['Single target',capabilities.single],['Cooldowns',capabilities.cooldowns]]) {
      const block=section(label);
      const grid=make('div',null,'comp-capabilities');
      for (const entry of entries) {
        const row=make('div',null,'comp-capability');
        row.dataset.capability=entry.name;
        row.dataset.available=String(entry.count>0);
        row.title=entry.description;
        const icon=effectIcon(entry);
        icon.setAttribute('aria-hidden','true');
        row.append(icon,make('span',entry.name),make('strong',String(entry.count)));
        grid.append(row);
      }
      block.append(grid);
    }
    raidHas.append(make('small','Click a seat to edit it.','comp-seat-hint'));
  }

  const specButtons = [];
  for (const [className,entries] of Object.entries(specs)) {
    const family=make('div',null,'comp-spec-family');
    family.dataset.wowClass=className;
    family.setAttribute('role','group');
    family.setAttribute('aria-label',className);
    for (const [name,role] of entries) for (const selectedRole of name==='Feral Combat'?['Melee DPS','Tank']:[role]) {
      const label=name==='Feral Combat'?(selectedRole==='Tank'?'Feral Bear':'Feral Cat'):name;
      const control=button('',()=>addSpec(className,name,selectedRole),'comp-add-spec');
      control.title=label+' '+className;
      control.setAttribute('aria-label','Add '+label+' '+className+' to Unassigned');
      control.append(guildIcon('spec',name,'',className));
      control.addEventListener('dragstart',event=>{
        if(locked){event.preventDefault();return;}
        draggedSpec=[className,name,selectedRole];
        event.dataTransfer.setData('text/plain',control.title);
        event.dataTransfer.effectAllowed='copy';
      });
      control.addEventListener('dragend',()=>{draggedSpec=null;});
      specButtons.push(control);
      family.append(control);
    }
    picker.append(family);
  }
  persist();draw();
  if(request)request().then(result=>{
    savedCompositions=[...savedCompositions,...(result.compositions??[])].filter((entry,index,all)=>all.findIndex(other=>other.id===entry.id)===index);savedOptions();
    if(locked){const entry=savedCompositions.find(entry=>entry.id===locked.id);if(entry)openSaved(entry);else{locked=null;persist();draw();}}
  }).catch(error=>{status.textContent='Saved compositions could not be loaded: '+error.message;});
  return {get model(){return model;},draw};
}
