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
  function assignCharacter(player, value) {
    if (!value) { delete player.character; return; }
    const key = typeof value.key === 'string' ? value.key.trim() : '';
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (!key || key.length > 256 || !name || name.length > 61) throw new Error('Choose a valid roster character.');
    if (players.some(other=>other!==player&&(other.character?.key===key||other.character?.name.toLowerCase()===name.toLowerCase()))) {
      throw new Error('That character already has a seat in this lineup.');
    }
    player.character = {key,name};
  }
  if (Array.isArray(initial?.players)) for (const value of initial.players.slice(0,size)) {
    if (!value || !validSpec(value.className,value.spec)) continue;
    const group = Number.isInteger(value.group) && value.group > 0 && value.group <= size/5 && players.filter(p=>p.group === value.group).length < 5 ? value.group : null;
    const player=choices({id:String(nextId++),className:value.className,spec:value.spec,role:roles.includes(value.role) ? value.role : specs[value.className].find(([name])=>name === value.spec)[1],group},value);
    if(value.character)try{assignCharacter(player,value.character);}catch{}
    players.push(player);
  }
  return {
    snapshot:()=>({version:1,size,players:players.map(player=>player.character?{...player,character:{...player.character}}:{...player})}),
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
    assign(id,character) {
      const player=players.find(player=>player.id===id);
      if (!player) throw new Error('Select a seat first.');
      assignCharacter(player,character);
    },
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

export function renderRaidComposition(root, {specs, storageKey = 'solstice-composition-v1', request = null, raidNames = {}, roster = null}) {
  const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text != null)node.textContent=text;if(cls)node.className=cls;return node;};
  const button=(text,action,cls)=>{const node=make('button',text,cls);node.type='button';node.addEventListener('click',action);return node;};
  const heading=(text,icon)=>{const h=make('h3');h.append(tablerIcon(icon,'card-header-icon'),document.createTextNode(text));return h;};
  let initial;try{initial=JSON.parse(localStorage.getItem(storageKey));}catch{}
  let model=createCompositionPlan(specs,initial);
  let locked=initial?.lockedId?{id:initial.lockedId,title:'Loading saved composition…'}:null;
  let savedCompositions=[];
  let selected=null,dragged=null,draggedSpec=null;
  const roleIcons={'Tank':'shield-check','Healer':'heart','Melee DPS':'swords','Ranged DPS':'target'};
  const controls=make('header',null,'comp-controls');
  const planTitle=make('h3',null,'comp-plan-title');
  const raidName=make('span',null,'comp-raid-name');
  const sizes=make('div',null,'comp-sizes');
  sizes.setAttribute('role','group');
  sizes.setAttribute('aria-label','Raid size');
  const sizeButtons=[10,20,40].map(value=>{
    const item=button(String(value),()=>{
      if(locked||model.snapshot().size===value)return;
      try{model.resize(value);commit('Raid size updated.');}
      catch(error){status.textContent=error.message;}
    });
    item.setAttribute('aria-label',value+' players');
    sizes.append(item);
    return [value,item];
  });
  const saveStatus=make('small',null,'comp-save-status');
  const actions=make('div',null,'comp-actions');
  let savedLocally=true;
  const status=make('p','','comp-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const groups=make('div',null,'comp-groups');
  const groupsPanel=make('section',null,'raid-card comp-groups-panel');groupsPanel.append(heading('Raid Groups','users'),groups);
  const unassigned=make('section',null,'raid-card comp-unassigned');
  const picker=make('div',null,'comp-picker');
  picker.setAttribute('role','group');
  picker.setAttribute('aria-label','Add a specialization');
  const specButtons=[];
  const rosterHint=roster && make('p','Dimmed specs have no roster match. You can still add them as placeholders.','comp-roster-hint');
  for(const className of ['Warrior','Paladin','Hunter','Rogue','Priest','Shaman','Mage','Warlock','Druid']){
    const family=make('div',null,'comp-spec-family');
    family.dataset.wowClass=className;
    family.setAttribute('role','group');
    const classMembers=roster?.filter(member=>member.className===className);
    family.setAttribute('aria-label',className);
    if(classMembers)family.dataset.rosterMatch=classMembers.length?'available':'missing';
    for(const [spec,defaultRole] of specs[className]??[]){
      const feral=spec==='Feral Combat';
      const roles=feral?['Melee DPS','Tank']:[defaultRole];
      for(const role of roles){
        const label=feral?(role==='Tank'?'Feral (Bear)':'Feral (Cat)'):spec;
        const add=button('',()=>addSpecialization(className,spec,role,null),'comp-add-spec');
        add.addEventListener('dragstart',event=>{
          if(locked||add.disabled){event.preventDefault();return;}
          draggedSpec=[className,spec,role];
          event.dataTransfer.setData('text/plain',label+' '+className);
          event.dataTransfer.effectAllowed='copy';
        });
        add.addEventListener('dragend',()=>{draggedSpec=null;clearDropTargets();});
        const matches=classMembers && matchingRoster({className,spec,role});
        let availability='';
        if(matches){
          add.dataset.rosterMatch=matches.length?'available':'missing';
          const unknown=classMembers.some(member=>!member.spec||feral&&member.spec===spec&&!member.role);
          availability=matches.length?matches.map(member=>member.name).join(', '):
            unknown?'No match recorded; some roster assignments are incomplete.':'No matching character on the team roster.';
        }
        add.title=[label+' '+className+' · '+role,availability].filter(Boolean).join(' — ');
        add.setAttribute('aria-label','Add '+label+' '+className+' to Unassigned'+(availability?' — '+availability:''));
        add.append(guildIcon('spec',spec,'',className));
        if(feral){
          const badge=tablerIcon(roleIcons[role],'comp-spec-role');
          badge.setAttribute('aria-hidden','true');
          add.append(badge);
        }
        family.append(add);
        specButtons.push(add);
      }
    }
    if(family.children.length)picker.append(family);
  }
  const raidNeeds=make('section',null,'raid-card comp-raid-needs');
  const composition=make('section',null,'raid-card comp-composition');
  const settings=make('section',null,'raid-card comp-settings');
  const main=make('div',null,'comp-main');main.append(picker);if(rosterHint)main.append(rosterHint);main.append(groupsPanel,unassigned);
  const side=make('aside',null,'comp-sidebar');side.setAttribute('aria-label','Composition controls');side.append(raidNeeds,composition,settings);
  const layout=make('div',null,'comp-layout');layout.append(main,side);
  const issues=make('section',null,'raid-card comp-issues');
  const savedBar=make('details',null,'comp-saved-bar');
  const savedLabel=make('label');const savedSelect=make('select');savedSelect.setAttribute('aria-label','Saved compositions');savedSelect.add(new Option('Choose a locked composition',''));savedLabel.append(savedSelect);savedBar.append(make('summary','Saved compositions'),savedLabel);savedBar.hidden=!request;
  const dialog=make('dialog',null,'comp-lock-dialog');dialog.setAttribute('aria-label','Lock in composition');
  const lockForm=make('form');const lockTitle=make('h3','Lock In Composition');
  const nameLabel=make('label','Composition name');const nameInput=make('input');nameInput.required=true;nameInput.maxLength=80;nameInput.placeholder='e.g. Hyjal balanced comp';nameLabel.append(nameInput);
  const lockStatus=make('p');lockStatus.setAttribute('role','status');
  const saveLocked=button('Save locked composition',()=>{});saveLocked.type='submit';
  lockForm.append(lockTitle,make('p','Save a fixed copy for raid creation. You can make a new draft without changing the saved version.'),nameLabel,saveLocked,button('Cancel',()=>dialog.close()),lockStatus);dialog.append(lockForm);
  const lockButton=button('Lock In',()=>{
    const plan=model.snapshot();
    if(locked||!request)return;
    if(!plan.players.length||plan.players.some(player=>player.group===null)){status.textContent='Assign every placeholder to a group before locking in. Auto-Optimize can do this for you.';return;}
    nameInput.value=plan.size+'-player composition';lockStatus.textContent='';dialog.showModal();nameInput.focus();
  },'comp-lock');
  const draftButton=button('Edit as draft',()=>{locked=null;savedSelect.value='';persist();draw();status.textContent='Editing a draft copy. The locked composition is unchanged.';});
  const clear=button('Clear all',async()=>{
    if(locked)return;
    if(model.snapshot().players.length && !await showSolsticeDialog({
      title:'Clear composition?',message:'All planned seats will be removed from this draft.',
      confirmLabel:'Clear composition',danger:true,
    }))return;
    if(locked||clear.isConnected===false)return;
    model.clear();
    selected=null;
    commit('Composition cleared.');
  });
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
  actions.append(optimize,lockButton,draftButton,clear);
  controls.append(planTitle,sizes,saveStatus,actions);
  const characterDialog=make('dialog',null,'comp-lock-dialog comp-character-dialog');
  characterDialog.setAttribute('aria-label','Choose a roster character');
  root.replaceChildren(controls,savedBar,status,layout,issues,dialog,characterDialog);

  function matchingRoster({className,spec,role}){
    return (roster??[]).filter(member=>member.className===className&&member.spec===spec&&(spec!=='Feral Combat'||member.role===role));
  }
  function chooseCharacter(player){
    const occupied=model.snapshot().players.filter(other=>other.id!==player.id&&other.character);
    const options=matchingRoster(player).filter(member=>member.key&&member.name&&
      !occupied.some(other=>other.character.key===member.key||other.character.name.toLowerCase()===member.name.toLowerCase()));
    if(!options.length&&!player.character)return;
    const select=make('select');
    select.setAttribute('aria-label','Team roster character');
    select.add(new Option('Keep as a placeholder',''));
    for(const member of options)select.add(new Option(member.name+(member.isMain?' · Main':' · Alt'),member.key));
    if(player.character&&!options.some(member=>member.key===player.character.key)){
      select.add(new Option(player.character.name+' · Saved assignment',player.character.key));
    }
    select.value=player.character?.key??'';
    const apply=button('Save seat',()=>{
      const character=options.find(member=>member.key===select.value)??(select.value===player.character?.key?player.character:null);
      try{
        model.assign(player.id,character);
        characterDialog.close();
        commit(character?character.name+' assigned to the seat.':'Seat kept as a placeholder.');
        root.querySelector('[data-player-select="'+player.id+'"]')?.focus();
      }catch(error){errorMessage.textContent=error.message;}
    });
    const cancel=button('Cancel',()=>{
      characterDialog.close();
      root.querySelector('[data-player-select="'+player.id+'"]')?.focus();
    });
    const errorMessage=make('p');
    errorMessage.setAttribute('role','alert');
    characterDialog.replaceChildren(make('h3','Choose a roster character'),make('p',player.spec+' '+player.className),select,apply,cancel,errorMessage);
    characterDialog.showModal();
    select.focus();
  }

  function addSpecialization(className,spec,role,group){
    if(locked)return;
    const players=model.snapshot().players;
    if(group!==null&&players.filter(player=>player.group===group).length>=5){
      status.textContent='Group '+group+' is full. Move someone out first.';
      return;
    }
    try{
      const id=model.add(className,spec,role);
      if(group===null)commit(spec+' '+className+' added to Unassigned.');
      else move(id,group);
    }catch(error){status.textContent=error.message;}
  }

  function persist(){
    try{
      localStorage.setItem(storageKey,JSON.stringify({...model.snapshot(),lockedId:locked?.id??null}));
      savedLocally=true;
    }catch{savedLocally=false;}
  }
  function commit(message){persist();draw();status.textContent=message;}
  function move(id,group){
    if(locked){status.textContent='Choose Edit as draft before moving placeholders.';return;}
    try{
      const player=model.snapshot().players.find(player=>player.id===id);
      model.move(id,group);
      selected=null;
      commit((player.character?.name||player.spec+' '+player.className)+' moved to '+(group===null?'Unassigned':'Group '+group)+'.');
      if(group!==null&&!player.character)chooseCharacter(player);
    }catch(error){draw();status.textContent=error.message;}
  }
  function clearDropTargets(){
    for(const target of root.querySelectorAll('.is-drop-target'))target.classList.remove('is-drop-target');
  }
  function destination(node,group){
    node.addEventListener('dragover',event=>{
      if(locked||!draggedSpec&&!dragged)return;
      event.preventDefault();
      if(event.dataTransfer)event.dataTransfer.dropEffect=draggedSpec?'copy':'move';
      node.classList.add('is-drop-target');
    });
    node.addEventListener('dragleave',()=>node.classList.remove('is-drop-target'));
    node.addEventListener('drop',event=>{
      event.preventDefault();
      event.stopPropagation();
      clearDropTargets();
      if(draggedSpec)addSpecialization(...draggedSpec,group);
      else {
        const id=event.dataTransfer?.getData('application/x-solstice-composition')||dragged;
        if(id)move(id,group);
      }
      dragged=null;
      draggedSpec=null;
    });
  }
  function playerCard(player){
    const row=make('div',null,'comp-player');row.dataset.wowClass=player.className;row.draggable=!locked;row.dataset.playerId=player.id;
    row.addEventListener('dragstart',event=>{if(locked){event.preventDefault();return;}dragged=player.id;event.dataTransfer.setData('application/x-solstice-composition',player.id);event.dataTransfer.setData('text/plain',player.spec+' '+player.className);event.dataTransfer.effectAllowed='move';row.classList.add('is-dragging');});
    row.addEventListener('dragend',()=>{dragged=null;row.classList.remove('is-dragging');clearDropTargets();});
    const select=button('',()=>{selected=selected===player.id?null:player.id;draw();root.querySelector('[data-player-select="'+player.id+'"]')?.focus();status.textContent=selected?'Choose an empty slot or use Move to for '+player.spec+' '+player.className+'.':'Selection cleared.';},'comp-player-select');
    select.dataset.playerSelect=player.id;select.setAttribute('aria-pressed',String(selected===player.id));select.setAttribute('aria-label','Select '+(player.character?.name||player.spec+' '+player.className)+' to edit');
    const label=(player.spec==='Feral Combat'?(player.role==='Tank'?'Feral (Bear)':'Feral (Cat)'):player.spec)+' '+player.className;
    select.title=[player.character?.name,label,player.role].filter(Boolean).join(' · ');
    const identity=make('span');identity.append(make('strong',player.character?.name||label));
    if(player.character)identity.append(make('small',label));
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
    lockButton.disabled=!!locked||!request;draftButton.hidden=!locked;optimize.disabled=!!locked;clear.disabled=!!locked;
    planTitle.replaceChildren(document.createTextNode('Your '+plan.size+'-player plan'));
    if(raidNames[plan.size]){
      raidName.textContent=' · '+raidNames[plan.size];
      planTitle.append(raidName);
    }
    saveStatus.textContent=assigned.length+' of '+plan.size+' placed · '+(locked?'Locked: '+locked.title:savedLocally?'Saved in this browser':'Browser save unavailable');
    for(const [value,item] of sizeButtons){
      item.disabled=!!locked;
      item.setAttribute('aria-pressed',String(value===plan.size));
    }
    groups.replaceChildren();
    for(let group=1;group<=plan.size/5;group++){
      const members=assigned.filter(player=>player.group===group);const card=make('section',null,'comp-group');destination(card,group);
      const title=make('h4','Group '+group);title.append(make('small','('+members.length+'/5)'));
      const covered=coverage.filter(buff=>buff.groups.includes(group));
      const percentage=make('span',Math.round(covered.length/coverage.length*100)+'%','comp-group-coverage');
      percentage.title='Buff coverage: '+covered.length+' of '+coverage.length+' planned effects available to this group.';
      percentage.setAttribute('aria-label',percentage.title);title.append(percentage);card.append(title);
      const counts=make('div',null,'comp-group-roles');
      for(const role of ['Tank','Healer','Melee DPS','Ranged DPS']){
        const count=members.filter(player=>player.role===role).length;if(!count)continue;
        const badge=make('span',null,'comp-role-mini');badge.dataset.role=role;badge.title=role+': '+count;badge.setAttribute('aria-label',badge.title);
        badge.append(tablerIcon(roleIcons[role]),make('span',String(count)));counts.append(badge);
      }
      card.append(counts);
      for(const player of members)card.append(playerCard(player));
      for(let slot=members.length;slot<5;slot++){
        const empty=button(selected?'Place selected':'Empty',()=>{if(selected)move(selected,group);else status.textContent='Add a class and spec, then drag or select a placeholder to place it.';},'comp-empty');empty.disabled=!!locked;empty.setAttribute('aria-label','Group '+group+', empty slot '+(slot+1)+(selected?', place selected placeholder':''));card.append(empty);
      }
      const groupBuffs=coverage.filter(buff=>buff.scope==='Group'&&buff.groups.includes(group));
      const hasManaUsers=members.some(player=>!['Warrior','Rogue'].includes(player.className));
      const missing=coverage.filter(buff=>buff.name==='Mana Spring Totem'&&buff.available&&!buff.groups.includes(group)&&hasManaUsers);
      const hint=make('div',null,'comp-group-hint');
      hint.append(make('small',members.length?'Group Buffs:':'Group is empty'));
      for(const buff of [...groupBuffs,...missing]){
        const covered=buff.groups.includes(group);const chip=make('span',(covered?'':'× ')+buff.shortName,'comp-buff-chip');
        chip.dataset.state=covered?'covered':'missing';chip.title=buff.name+' — '+buff.description+(covered?' (available in this group)':' (missing from this group)');
        chip.setAttribute('aria-label',buff.name+': '+(covered?'available':'missing'));hint.append(chip);
      }
      if(members.length&&!groupBuffs.length&&!missing.length)hint.append(make('small','No group-only buffs','comp-group-no-buffs'));
      card.append(hint);groups.append(card);
    }
    const pool=plan.players.filter(player=>player.group===null);unassigned.replaceChildren(heading('Unassigned ('+pool.length+')','users'));
    const poolRows=make('div',null,'comp-pool');destination(poolRows,null);
    for(const player of pool)poolRows.append(playerCard(player));
    if(!pool.length)poolRows.append(make('p','Choose a specialization above to add a placeholder.','comp-empty-message'));
    unassigned.append(poolRows,button('Move selected to Unassigned',()=>{if(selected)move(selected,null);},'comp-return'));unassigned.lastElementChild.hidden=!selected||chosen?.group===null;unassigned.lastElementChild.disabled=!!locked;
    for(const add of specButtons){add.disabled=!!locked||plan.players.length>=plan.size;add.draggable=!add.disabled;}
    composition.replaceChildren(heading('Composition','chart-line'));
    for(const role of ['Tank','Healer','Melee DPS','Ranged DPS']){
      const line=make('div',null,'comp-count');line.dataset.role=role;line.append(tablerIcon(roleIcons[role]),make('span',role),make('strong',String(plan.players.filter(player=>player.role===role).length)));composition.append(line);
    }
    const total=make('div',null,'comp-count comp-total');total.append(tablerIcon('users'),make('span','Total'),make('strong',plan.players.length+' / '+plan.size));composition.append(total,make('small',assigned.length+' assigned · '+pool.length+' unassigned'));
    settings.hidden=!chosen;
    if(chosen){
      settings.replaceChildren(heading('Selected seat','adjustments-horizontal'),make('p',chosen.character?.name||chosen.spec+' '+chosen.className));
      if(!locked&&(chosen.character||matchingRoster(chosen).length)){
        settings.append(button('Choose character',()=>chooseCharacter(chosen)));
      }
      const field=(label,values,value,action)=>{const wrapper=make('label',label);const select=make('select');for(const [key,title] of values)select.add(new Option(title,key));select.value=String(value);select.disabled=!!locked;select.addEventListener('change',()=>{if(!locked)action(select.value);});wrapper.append(select);settings.append(wrapper);};
      field('Move to',[[0,'Unassigned'],...Array.from({length:plan.size/5},(_,i)=>[i+1,'Group '+(i+1)])],chosen.group??0,value=>move(chosen.id,Number(value)||null));
      field('Role',['Tank','Healer','Melee DPS','Ranged DPS'].map(role=>[role,role]),chosen.role,value=>{model.update(chosen.id,{role:value});commit('Role updated.');});
      if(chosen.className==='Paladin'){
        field('Blessing',['Kings','Might','Wisdom','Salvation','Light'].map(value=>[value,value]),chosen.blessing,value=>{model.update(chosen.id,{blessing:value});commit('Blessing updated.');});
        field('Aura',['Devotion','Retribution','Resistance'].map(value=>[value,value]),chosen.aura,value=>{model.update(chosen.id,{aura:value});commit('Aura updated.');});
      }
      if(chosen.className==='Shaman')field('Air totem',['Windfury','Grace of Air'].map(value=>[value,value]),chosen.air,value=>{model.update(chosen.id,{air:value});commit('Air totem updated.');});
    }
    issues.replaceChildren(heading('Issues & Recommendations','shield'));
    let issueCount=0;
    const issue=(title,detail,tone='warning')=>{const row=make('div',null,'comp-issue');row.dataset.tone=tone;row.append(tablerIcon('shield'),make('div'));row.lastElementChild.append(make('strong',title),make('small',detail));issues.append(row);issueCount++;};
    if(!assigned.length)issue('No placeholders assigned yet','Drag from Unassigned into a group to calculate raid and party coverage.','info');
    for(const [className,buff] of [['Priest','Power Word: Fortitude'],['Paladin','Blessing of Kings'],['Druid','Mark of the Wild']])if(!coverage.find(entry=>entry.name===buff)?.covered)issue('Missing '+buff,className==='Paladin'&&assigned.some(player=>player.className==='Paladin')?'Select Kings on a Paladin, or add another Paladin.':'Assign a '+className+' to the raid.');
    if(assigned.length && !assigned.some(player=>player.role==='Tank'))issue('No tanks assigned','Add a tank or change a selected placeholder’s role.');
    if(assigned.length && !assigned.some(player=>player.role==='Healer'))issue('No healers assigned','Add a healer to the assigned raid composition.');
    for(const buff of coverage.filter(buff=>buff.scope==='Group'&&buff.covered&&!buff.complete))issue(buff.name+' covers Group '+buff.groups.join(', '),'Move or add a provider to cover the remaining occupied groups.','info');
    if(!issueCount)issues.append(make('p','Core buffs, tanks and healers are represented. Review group coverage for your encounter.','comp-success'));
    drawRaidNeeds(coverage,compositionCapabilities(plan));
  }

  function drawRaidNeeds(coverage, capabilities) {
    raidNeeds.replaceChildren(make('h3','What the raid needs'));
    const section = (label,countLabel) => {
      const block = make('section');
      const title = make('h4',label);
      if (countLabel) title.append(make('strong',countLabel));
      block.append(title);
      raidNeeds.append(block);
      return block;
    };
    const raidBuffs = coverage.filter(buff=>buff.scope==='Raid');
    const raid = section('Raid-wide buffs',raidBuffs.filter(buff=>!buff.covered).length+' missing');
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
    const debuffs = section('Debuffs on the boss',capabilities.debuffs.length+' covered');
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
        const count=make('strong',String(entry.count));
        count.setAttribute('aria-label',entry.count+' assigned providers');
        row.append(icon,make('span',entry.name),count);
        grid.append(row);
      }
      block.append(grid);
    }
    raidNeeds.append(make('small','Coverage updates when players are placed in raid groups.','comp-seat-hint'));
  }

  persist();draw();
  if(request)request().then(result=>{
    savedCompositions=[...savedCompositions,...(result.compositions??[])].filter((entry,index,all)=>all.findIndex(other=>other.id===entry.id)===index);savedOptions();
    if(locked){const entry=savedCompositions.find(entry=>entry.id===locked.id);if(entry)openSaved(entry);else{locked=null;persist();draw();}}
  }).catch(error=>{status.textContent='Saved compositions could not be loaded: '+error.message;});
  return {get model(){return model;},draw};
}
