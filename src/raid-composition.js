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
  return rules.map(([name,category,className,scope,spec,description,choice,value],iconIndex)=>{
    const candidates=assigned.filter(player=>player.className === className && (!spec || player.spec === spec));
    const providers=candidates.filter(player=>!choice || player[choice] === value);
    const groups=scope === 'Raid' && providers.length ? occupied : [...new Set(providers.map(player=>player.group))].sort((a,b)=>a-b);
    return {name,category,className,scope,spec,description,iconIndex,groups,providers:providers.length,available:candidates.length>0,covered:providers.length>0,complete:providers.length>0 && (scope === 'Raid' || groups.length === occupied.length),choice,value};
  });
}

export function renderRaidComposition(root, {specs, storageKey = 'solstice-composition-v1'}) {
  const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text != null)node.textContent=text;if(cls)node.className=cls;return node;};
  const button=(text,action,cls)=>{const node=make('button',text,cls);node.type='button';node.addEventListener('click',action);return node;};
  const heading=(text,icon)=>{const h=make('h3');h.append(tablerIcon(icon,'card-header-icon'),document.createTextNode(text));return h;};
  function buffLine(buff, compact = false) {
    const row=make('div',null,compact?'comp-buff comp-category-detail':'comp-buff');
    row.dataset.state=buff.complete?'covered':buff.covered?'partial':buff.available?'alternative':'missing';
    const icon=make('span',null,'comp-spell-icon');icon.setAttribute('aria-hidden','true');icon.title=buff.name;
    icon.style.backgroundPosition=(buff.iconIndex%5*25)+'% '+(Math.floor(buff.iconIndex/5)*25)+'%';
    const info=make('div');info.append(make('strong',buff.name));if(!compact)info.append(make('small',buff.description));
    const state=buff.complete?'Covered':buff.covered?'Group '+buff.groups.join(', '):buff.available?'Alternative':'Missing';
    const badge=make('span',buff.scope,'comp-scope');badge.dataset.scope=buff.scope;
    row.append(icon,info,make('small',state,'comp-buff-state'),badge);return row;
  }
  let initial;try{initial=JSON.parse(localStorage.getItem(storageKey));}catch{}
  const model=createCompositionPlan(specs,initial);
  let chosenClass='Warrior',selected=null,dragged=null,expandedCategory=null;
  const roleIcons={'Tank':'shield-check','Healer':'heart','Melee DPS':'swords','Ranged DPS':'target'};
  const controls=make('div',null,'comp-controls');
  const sizeLabel=make('label','Raid size');const size=make('select');size.setAttribute('aria-label','Raid size');
  for(const value of [10,20,40])size.add(new Option(value+' players',value));size.value=String(model.snapshot().size);sizeLabel.append(size);
  const saveStatus=make('small','Draft saved on this browser.','comp-save-status');
  const status=make('p','','comp-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const groups=make('div',null,'comp-groups');
  const groupsPanel=make('section',null,'raid-card comp-groups-panel');groupsPanel.append(heading('Raid Groups','users'),groups);
  const unassigned=make('section',null,'raid-card comp-unassigned');
  const picker=make('section',null,'raid-card comp-picker');
  const composition=make('section',null,'raid-card comp-composition');
  const settings=make('section',null,'raid-card comp-settings');
  const main=make('div',null,'comp-main');main.append(groupsPanel,unassigned);
  const side=make('aside',null,'comp-sidebar');side.setAttribute('aria-label','Composition controls');side.append(picker,composition,settings);
  const layout=make('div',null,'comp-layout');layout.append(main,side);
  const issues=make('section',null,'raid-card comp-issues');
  const categories=make('section',null,'raid-card comp-categories');
  const buffs=make('section',null,'raid-card comp-buffs');
  const analysis=make('div',null,'comp-analysis');analysis.append(categories,buffs);
  controls.append(sizeLabel,saveStatus,button('Clear all',()=>{if(model.snapshot().players.length && !window.confirm('Clear all placeholders from this composition?'))return;model.clear();selected=null;commit('Composition cleared.');}));
  root.replaceChildren(controls,status,layout,issues,analysis);
  size.addEventListener('change',()=>{try{model.resize(Number(size.value));commit('Raid size updated.');}catch(error){size.value=String(model.snapshot().size);status.textContent=error.message;}});
  function persist(){try{localStorage.setItem(storageKey,JSON.stringify(model.snapshot()));saveStatus.textContent='Draft saved on this browser.';}catch{saveStatus.textContent='Draft could not be saved on this browser.';}}
  function commit(message){persist();draw();status.textContent=message;}
  function move(id,group){try{const player=model.snapshot().players.find(player=>player.id===id);model.move(id,group);selected=null;commit(player.spec+' '+player.className+' moved to '+(group===null?'Unassigned':'Group '+group)+'.');}catch(error){draw();status.textContent=error.message;}}
  function destination(node,group){
    node.addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';node.classList.add('is-drop-target');});
    node.addEventListener('dragleave',()=>node.classList.remove('is-drop-target'));
    node.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();node.classList.remove('is-drop-target');const id=event.dataTransfer?.getData('application/x-solstice-composition')||dragged;if(id)move(id,group);dragged=null;});
  }
  function playerCard(player){
    const row=make('div',null,'comp-player');row.dataset.wowClass=player.className;row.draggable=true;row.dataset.playerId=player.id;
    row.addEventListener('dragstart',event=>{dragged=player.id;event.dataTransfer.setData('application/x-solstice-composition',player.id);event.dataTransfer.setData('text/plain',player.spec+' '+player.className);event.dataTransfer.effectAllowed='move';row.classList.add('is-dragging');});
    row.addEventListener('dragend',()=>{dragged=null;row.classList.remove('is-dragging');for(const target of root.querySelectorAll('.is-drop-target'))target.classList.remove('is-drop-target');});
    const select=button('',()=>{selected=selected===player.id?null:player.id;draw();root.querySelector('[data-player-select="'+player.id+'"]')?.focus();status.textContent=selected?'Choose an empty slot or use Move to for '+player.spec+' '+player.className+'.':'Selection cleared.';},'comp-player-select');
    select.dataset.playerSelect=player.id;select.setAttribute('aria-pressed',String(selected===player.id));select.setAttribute('aria-label','Select '+player.spec+' '+player.className+' to move');
    const identity=make('span');identity.append(make('strong',player.spec==='Feral Combat'?(player.role==='Tank'?'Feral (Bear)':'Feral (Cat)'):player.spec),make('small',player.className));
    select.append(guildIcon('spec',player.spec,'',player.className),identity,tablerIcon(roleIcons[player.role]));
    const remove=button('',event=>{event.stopPropagation();model.remove(player.id);if(selected===player.id)selected=null;commit(player.spec+' '+player.className+' removed.');},'comp-remove');remove.append(tablerIcon('x'));remove.setAttribute('aria-label','Remove '+player.spec+' '+player.className);
    row.append(select,remove);return row;
  }
  function draw(){
    const plan=model.snapshot();const coverage=compositionBuffs(plan);const assigned=plan.players.filter(player=>player.group!==null);const chosen=plan.players.find(player=>player.id===selected);
    groups.replaceChildren();
    for(let group=1;group<=plan.size/5;group++){
      const members=assigned.filter(player=>player.group===group);const card=make('section',null,'comp-group');destination(card,group);
      const title=make('h4','Group '+group);title.append(make('small','('+members.length+'/5)'));card.append(title);
      for(const player of members)card.append(playerCard(player));
      for(let slot=members.length;slot<5;slot++){
        const empty=button(selected?'Place selected':'Empty',()=>{if(selected)move(selected,group);else status.textContent='Add a class and spec, then drag or select a placeholder to place it.';},'comp-empty');empty.setAttribute('aria-label','Group '+group+', empty slot '+(slot+1)+(selected?', place selected placeholder':''));card.append(empty);
      }
      const groupBuffs=coverage.filter(buff=>buff.scope==='Group'&&buff.groups.includes(group));
      const hint=make('small',members.length?(groupBuffs.length?groupBuffs.map(buff=>buff.name).join(' · '):'No group-only buffs'):'Group is empty','comp-group-hint');card.append(hint);groups.append(card);
    }
    const pool=plan.players.filter(player=>player.group===null);unassigned.replaceChildren(heading('Unassigned ('+pool.length+')','users'));
    const poolRows=make('div',null,'comp-pool');destination(poolRows,null);
    for(const player of pool)poolRows.append(playerCard(player));
    if(!pool.length)poolRows.append(make('p','Select a class and specialization to add a placeholder.','comp-empty-message'));
    unassigned.append(poolRows,button('Move selected to Unassigned',()=>{if(selected)move(selected,null);},'comp-return'));unassigned.lastElementChild.hidden=!selected||chosen?.group===null;
    picker.replaceChildren(heading('Add Characters','user-circle'),make('label','Class'));
    const classes=make('div',null,'comp-classes');
    for(const className of ['Warrior','Paladin','Hunter','Rogue','Priest','Shaman','Mage','Warlock','Druid']){
      const item=button('',()=>{chosenClass=className;draw();root.querySelector('[data-class="'+className+'"]')?.focus();},'comp-class');item.dataset.class=className;item.dataset.wowClass=className;item.setAttribute('aria-pressed',String(chosenClass===className));item.append(guildIcon('class',className),make('span',className));classes.append(item);
    }
    picker.append(classes,make('label','Specialization'));
    for(const [name,role] of specs[chosenClass])for(const selectedRole of name==='Feral Combat'?['Melee DPS','Tank']:[role]){
      const label=name==='Feral Combat'?(selectedRole==='Tank'?'Feral (Bear)':'Feral (Cat)'):name;
      const add=button('',()=>{try{model.add(chosenClass,name,selectedRole);commit(label+' '+chosenClass+' added to Unassigned.');}catch(error){status.textContent=error.message;}},'comp-add-spec');add.dataset.wowClass=chosenClass;add.disabled=plan.players.length>=plan.size;add.setAttribute('aria-label','Add '+label+' '+chosenClass+' to Unassigned');add.append(guildIcon('spec',name,'',chosenClass),make('span',label),tablerIcon(roleIcons[selectedRole]),tablerIcon('plus'));picker.append(add);
    }
    composition.replaceChildren(heading('Composition','chart-line'));
    for(const role of ['Tank','Healer','Melee DPS','Ranged DPS']){
      const line=make('div',null,'comp-count');line.dataset.role=role;line.append(tablerIcon(roleIcons[role]),make('span',role),make('strong',String(plan.players.filter(player=>player.role===role).length)));composition.append(line);
    }
    const total=make('div',null,'comp-count comp-total');total.append(tablerIcon('users'),make('span','Total'),make('strong',plan.players.length+' / '+plan.size));composition.append(total,make('small',assigned.length+' assigned · '+pool.length+' unassigned'));
    settings.hidden=!chosen;
    if(chosen){
      settings.replaceChildren(heading('Selected Placeholder','adjustments-horizontal'),make('p',chosen.spec+' '+chosen.className));
      const field=(label,values,value,action)=>{const wrapper=make('label',label);const select=make('select');for(const [key,title] of values)select.add(new Option(title,key));select.value=String(value);select.addEventListener('change',()=>action(select.value));wrapper.append(select);settings.append(wrapper);};
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
    categories.replaceChildren(heading('Buff Categories','wand'));buffs.replaceChildren(heading('All Raid Buffs','sparkles'));
    const list=make('div',null,'comp-buff-list');
    for(const category of [...new Set(coverage.map(buff=>buff.category))]){
      const entries=coverage.filter(buff=>buff.category===category);
      const section=make('div',null,'comp-category');
      const toggle=button('',()=>{expandedCategory=expandedCategory===category?null:category;draw();},'comp-category-toggle');toggle.setAttribute('aria-expanded',String(expandedCategory===category));toggle.dataset.coverage=entries.every(buff=>buff.covered)?'covered':'missing';toggle.append(make('span',category),make('strong',entries.filter(buff=>buff.covered).length+' / '+entries.length),tablerIcon('chevron-down'));section.append(toggle);
      if(expandedCategory===category)for(const buff of entries)section.append(buffLine(buff,true));categories.append(section);
    }
    for(const buff of coverage)list.append(buffLine(buff));
    buffs.append(list,make('p','Coverage uses assigned placeholders. Greater Blessings are planned by class; one blessing per Paladin. A Shaman provides one air totem. Talent, form, Imp and totem requirements must be met in game.','comp-buff-note'));
  }
  persist();draw();
  return {model,draw};
}
