export function characterIcons(className,spec) {
  const icons = raidElement('span',null,'character-icons');
  if (!Object.hasOwn(armorySpecs,className)) return icons;
  const specIcon = armorySpecs[className].find(([name])=>name.toLowerCase() === (spec ?? '').toLowerCase());
  for (const [name,description] of [['classicon_'+className.toLowerCase(),className],...(specIcon ? [[specIcon[2],specIcon[0]]] : [])]) {
    const image = raidElement('img');
    image.alt = description;
    image.title = description;
    image.src = 'https://wow.zamimg.com/images/wow/icons/medium/'+name+'.jpg';
    image.addEventListener('error',()=>image.remove(),{once:true});
    icons.append(image);
  }
  return icons;
}

export function renderArmoryProfile(character) {
  const root = raidElement('div',null,'armory-profile');
  const gear = character.gear ?? [];
  const layout = raidElement('div',null,'character-review-layout');
  const sheet = raidElement('div',null,'character-sheet');
  const left = raidElement('div',null,'character-gear');
  const right = raidElement('div',null,'character-gear character-gear-right');
  const leftSlots = [['HEAD','Head'],['NECK','Neck'],['SHOULDER','Shoulder'],['BACK','Back'],['CHEST','Chest'],
    ['TABARD','Tabard'],['SHIRT','Shirt'],['WRIST','Wrist'],['MAIN_HAND','Main Hand']];
  const rightSlots = [['HANDS','Hands'],['WAIST','Waist'],['LEGS','Legs'],['FEET','Feet'],['FINGER_1','First Ring'],
    ['FINGER_2','Second Ring'],['TRINKET_1','First Trinket'],['TRINKET_2','Second Trinket'],['OFF_HAND','Off Hand'],['RANGED','Ranged']];
  const slotKey = item => item.slotType || item.slot.toUpperCase().replace(/\s+/g,'_');
  const equipped = new Map(gear.map(item=>[slotKey(item),item]));
  function appendSlot(column, slot, item) {
    if (!item) {
      const empty = raidElement('div',null,'character-slot-empty');
      empty.append(raidElement('span',null,'character-slot-icon'),raidElement('span','No '+slot));
      column.append(empty);
      return;
    }
    const row = raidElement('div',null,'character-slot');
    const button = raidElement('button',null,'character-slot-button');
    button.type = 'button';
    button.setAttribute('aria-label',item.slot+': '+item.name);
    button.style.setProperty('--gear-quality',rarityColor(item.id,item.quality));
    const icon = itemIcons.get(item.id);
    const tile = raidElement('span',null,'character-slot-icon');
    tile.append(raidElement('span',item.slot,'character-slot-caption'));
    const copy = raidElement('span',null,'character-slot-copy');
    const label = raidElement('strong',item.name);
    label.style.color = rarityColor(item.id,item.quality);
    copy.append(label,raidElement('small',[item.slot,item.level != null ? 'iLvl '+item.level : ''].filter(Boolean).join(' · ')));
    if (item.enchants.length) copy.append(raidElement('small',item.enchants.join(' · '),'character-slot-enchant'));
    button.append(tile,copy);
    if (icon) {
      const image = raidElement('img');
      image.alt = '';
      image.addEventListener('load',()=>tile.replaceChildren(image),{once:true});
      image.src = icon;
    }
    const level = item.level != null ? 'Item Level '+item.level : '';
    const enchants = item.enchants.map(enchant=>/^enchanted:/i.test(enchant) ? enchant : 'Enchanted: '+enchant);
    const lines = [level,item.slot,...item.details,...enchants,...(item.effects ?? [])].filter(Boolean);
    const tooltip = raidElement('div',null,'character-item-tooltip');
    tooltip.id = 'character-item-'+(left.children.length+right.children.length);
    tooltip.setAttribute('popover','manual');
    tooltip.setAttribute('role','tooltip');
    const name = raidElement('strong',item.name);
    name.style.color = rarityColor(item.id,item.quality);
    tooltip.append(name);
    if (level) tooltip.append(raidElement('span',level,'character-tooltip-level'));
    tooltip.append(...[item.slot,...item.details].filter(Boolean).map(line=>raidElement('span',line)));
    tooltip.append(...[...enchants,...(item.effects ?? [])].map(line=>raidElement('span',line,'character-tooltip-effect')));
    button.setAttribute('aria-describedby',tooltip.id);
    function show() {
      if (typeof tooltip.showPopover !== 'function') {
        button.title = [item.name,...lines].join(' · ');
        return;
      }
      if (!tooltip.matches(':popover-open')) tooltip.showPopover();
      const rect = tile.getBoundingClientRect();
      const leftEdge = rect.right+tooltip.offsetWidth+10 <= innerWidth ? rect.right+8 : rect.left-tooltip.offsetWidth-8;
      tooltip.style.left = Math.max(8,Math.min(leftEdge,innerWidth-tooltip.offsetWidth-8))+'px';
      tooltip.style.top = Math.max(8,Math.min(rect.top,innerHeight-tooltip.offsetHeight-8))+'px';
    }
    function hide() { if (typeof tooltip.hidePopover === 'function') tooltip.hidePopover(); }
    button.addEventListener('mouseenter',show);
    button.addEventListener('focus',show);
    button.addEventListener('click',show);
    button.addEventListener('mouseleave',hide);
    button.addEventListener('blur',hide);
    button.addEventListener('keydown',event=>{
      if (event.key === 'Escape' && typeof tooltip.hidePopover === 'function' && tooltip.matches(':popover-open')) {
        event.preventDefault();
        hide();
      }
    });
    row.append(button,tooltip);
    column.append(row);
  }
  if (character.gear) {
    for (const [slots,column] of [[leftSlots,left],[rightSlots,right]]) {
      for (const [key,label] of slots) {
        appendSlot(column,label,equipped.get(key));
        equipped.delete(key);
      }
    }
    for (const item of equipped.values()) appendSlot(right,item.slot,item);
    sheet.append(left,right);
    layout.append(sheet);
  } else layout.append(raidElement('p','No equipment data available.','raid-card'));
  const attributes = raidElement('aside',null,'character-attributes');
  attributes.setAttribute('aria-label','Character Stats');
  for (const [group,values] of character.attributes ?? []) {
    const list = raidElement('dl');
    const groupPanel = raidElement('section',null,'character-stat-card');
    groupPanel.append(raidElement('h3',group),list);
    attributes.append(groupPanel);
    for (const [label,value] of values) list.append(raidElement('dt',label),raidElement('dd',new Intl.NumberFormat().format(value)));
  }
  if (!character.attributes?.length) attributes.append(raidElement('p','No attributes reported by the Armory.','character-stat-card'));
  layout.append(attributes);
  root.append(layout);
  const professions = raidElement('section',null,'raid-card');
  professions.append(raidElement('h3','Professions'));
  for (const entry of character.professions ?? []) {
    const skills = entry.skill == null ? entry.tiers.filter(tier=>tier.skill != null)
      .map(tier=>[tier.name,tier.skill+(tier.maxSkill ? ' / '+tier.maxSkill : '')].filter(Boolean).join(' ')).join(' · ') :
      entry.skill+(entry.maxSkill ? ' / '+entry.maxSkill : '');
    professions.append(raidElement('p',[entry.name,skills].filter(Boolean).join(' · ')));
  }
  if (!character.professions?.length) professions.append(raidElement('p','No profession data available.'));
  root.append(raidElement('small','Source: Blizzard Armory'));
  return { gearPanel:root, professions };
}

export function openCharacterSheet(player, event, organizer) {
  const dialog = raidElement('dialog',null,'workspace-drawer character-drawer');
  const title = raidElement('h2',player.character);
  title.id = 'character-sheet-title';
  dialog.setAttribute('aria-labelledby',title.id);
  const heading = raidElement('div',null,'character-inspector-title');
  const identity = raidElement('div');
  identity.append(title,raidElement('p',[player.class_name,player.spec,player.role].filter(Boolean).join(' · '),'inspector-meta'));
  const portrait = characterIcons(player.class_name,player.spec);
  portrait.classList.add('character-banner-portrait');
  heading.append(portrait,identity);
  const close = raidElement('button','Close');
  close.addEventListener('click',()=>dialog.close());
  const header = raidElement('header',null,'workspace-drawer-heading character-banner');
  header.append(heading,close);
  const content = raidElement('div');
  content.append(raidElement('p','Loading character sheet…'));
  const checks = reviewCharacter(event,player,organizer,async update=>{
    await raidRequest('/'+event.id,update);
    dialog.close();
    if (raidView === 'roster' && workspaceGoal === event.id) await openRaidView('roster',null,false);
  });
  checks.open = true;
  const professions = raidElement('div');
  professions.append(raidElement('p','Loading professions…'));
  const tabs = raidElement('nav',null,'character-review-tabs');
  tabs.setAttribute('aria-label','Character Sheet Sections');
  const panels = [['Character',content],['Raid Review',checks],['Professions',professions]].map(([label,panel])=>{
    const button = raidElement('button',label);
    button.type = 'button';
    tabs.append(button);
    return {button,panel};
  });
  function selectPanel(selected) {
    dialog.querySelector('.character-item-tooltip:popover-open')?.hidePopover();
    for (const {button,panel} of panels) {
      button.setAttribute('aria-pressed',String(panel === selected));
      panel.hidden = panel !== selected;
    }
  }
  for (const {button,panel} of panels) button.addEventListener('click',()=>selectPanel(panel));
  dialog.append(header,tabs,content,checks,professions);
  selectPanel(content);
  dialog.addEventListener('scroll',()=>{
    dialog.querySelector('.character-item-tooltip:popover-open')?.hidePopover();
  });
  document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal();
  armoryRequest('?name='+encodeURIComponent(player.armorySlug)).then(({character})=>{
    if (!dialog.open) return;
    const { gearPanel, professions:skills } = renderArmoryProfile(character);
    content.replaceChildren(gearPanel);
    professions.replaceChildren(skills);
    if (character.portrait) {
      const image = raidElement('img');
      image.alt = '';
      image.addEventListener('load',()=>portrait.replaceChildren(image),{once:true});
      image.src = character.portrait;
    }
    if (character.guild) identity.append(raidElement('p','<'+character.guild+'>','character-banner-guild'));
    identity.append(raidElement('p',[
      character.level != null ? 'Level '+character.level : '',character.race,character.faction,
      character.itemLevel != null ? 'Item Level '+character.itemLevel : '',
    ].filter(Boolean).join(' · '),'inspector-meta'));
  }).catch(error=>{
    content.replaceChildren(raidElement('p',error.message));
    professions.replaceChildren(raidElement('p','Professions are unavailable.'));
  });
}

export async function renderArmory(root) {
  const card = raidElement('section',null,'raid-card armory-card');
  card.append(raidElement('p','Blizzard Armory','eyebrow'),raidElement('h3','Link a character'),
    raidElement('p','Enter your character’s first and last name. A link associates this character with your Discord account for raid sign-ups.'));
  const content = raidElement('div');
  card.append(content); root.append(card);
  try {
    const {configured,characters} = await armoryRequest();
    for (const entry of characters) {
      const row = raidElement('div',null,'raid-row');
      const title = raidElement('div');
      title.append(raidElement('strong',entry.name),raidElement('small',[entry.class_name,entry.spec,entry.role].filter(Boolean).join(' · ')));
      const unlink = raidElement('button','Unlink');
      unlink.addEventListener('click',async()=>{
        unlink.disabled = true;
        try {
          await armoryRequest('',{action:'unlink',slug:entry.slug});
          row.remove();
        } catch (error) { raidError(error); }
        finally { unlink.disabled = false; }
      });
      row.append(title,unlink); content.append(row);
    }
    if (!configured) { content.append(raidElement('p','Armory lookup requires Blizzard API credentials from your guild administrator.')); return; }
    const form = raidElement('form',null,'raid-form armory-search');
    function nameField(title, example) {
      const label = raidElement('label',title);
      const field = raidElement('input');
      field.placeholder = example;
      field.required = true;
      field.maxLength = 30;
      field.autocomplete = 'off';
      label.append(field);
      form.append(label);
      return field;
    }
    const firstName = nameField('First name','Astra');
    const lastName = nameField('Last name','Mortis');
    const search = raidElement('button','Search Armory','raid-primary');
    const results = raidElement('div');
    results.setAttribute('aria-live','polite');
    form.append(search); content.append(form,results);
    form.addEventListener('submit',async event=>{
      event.preventDefault(); search.disabled = true; results.replaceChildren();
      try {
        const name = firstName.value.trim()+' '+lastName.value.trim();
        const {character} = await armoryRequest('?name='+encodeURIComponent(name));
        if (card.isConnected) renderArmoryConfirmation(card,character,search);
      } catch (error) { results.append(raidElement('p',error.message)); }
      finally { search.disabled = false; }
    });
  } catch (error) { content.append(raidElement('p',error.message)); }
}

export function renderArmoryConfirmation(card,character,search) {
  const dialog = raidElement('dialog',null,'armory-confirm');
  dialog.setAttribute('aria-labelledby','armory-confirm-title');
  const header = raidElement('header',null,'armory-confirm-header');
  const heading = raidElement('div');
  const title = raidElement('h2','Character found');
  title.id = 'armory-confirm-title';
  heading.append(title,raidElement('p','Confirm the details to add this character.'));
  const close = raidElement('button','×','armory-confirm-close');
  close.type = 'button';
  close.setAttribute('aria-label','Close character confirmation');
  close.addEventListener('click',()=>dialog.close());
  header.append(heading,close);

  const summary = raidElement('div',null,'armory-confirm-summary');
  const portrait = raidElement('div',null,'armory-confirm-portrait');
  const initials = character.name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
  portrait.textContent = initials;
  function icon(name) {
    const image = raidElement('img');
    image.alt = '';
    image.src = 'https://wow.zamimg.com/images/wow/icons/medium/'+name+'.jpg';
    return image;
  }
  if (Object.hasOwn(armorySpecs,character.className)) {
    const image = icon('classicon_'+character.className.toLowerCase());
    image.addEventListener('load',()=>portrait.replaceChildren(image));
  }
  const identity = raidElement('div');
  identity.append(raidElement('h3',character.name),raidElement('p',[
    character.ruleset,character.level != null && 'Level '+character.level,
  ].filter(Boolean).join(' · ')));
  const badges = raidElement('div',null,'armory-confirm-badges');
  if (character.className) {
    const classBadge = raidElement('span',character.className,'armory-class-badge');
    classBadge.dataset.wowClass = character.className;
    badges.append(classBadge);
  }
  if (character.faction) badges.append(raidElement('span',character.faction));
  identity.append(badges);
  if (character.guild) identity.append(raidElement('p','‹'+character.guild+'›','armory-confirm-guild'));
  summary.append(portrait,identity);

  const form = raidElement('form',null,'armory-confirm-form');
  const specs = Object.hasOwn(armorySpecs,character.className) ? armorySpecs[character.className] : [];
  if (specs.length) {
    const fieldset = raidElement('fieldset',null,'armory-specs');
    const choices = raidElement('div',null,'armory-spec-grid');
    fieldset.append(raidElement('legend','Primary specialization'),choices);
    for (const [index,[name,defaultRole,iconName]] of specs.entries()) {
      const label = raidElement('label',null,'armory-spec');
      const input = raidElement('input');
      Object.assign(input,{type:'radio',name:'spec',value:name,checked:index===0});
      const text = raidElement('span');
      text.append(raidElement('strong',name),raidElement('small',defaultRole));
      const specIcon = icon(iconName);
      specIcon.addEventListener('error',()=>specIcon.hidden = true);
      label.append(input,specIcon,text);
      choices.append(label);
    }
    form.append(fieldset);
  }
  const feedback = raidElement('p',null,'armory-confirm-feedback');
  feedback.setAttribute('role','status');
  const actions = raidElement('div',null,'armory-confirm-actions');
  const add = raidElement('button','Add character','raid-primary');
  const back = raidElement('button','Back');
  back.type = 'button';
  back.addEventListener('click',()=>dialog.close());
  actions.append(add,back);
  form.append(feedback,actions);
  if (!specs.length) {
    add.disabled = true;
    feedback.textContent = 'No specialization choices are available for this class.';
  }
  dialog.append(header,summary,form);
  dialog.addEventListener('close',()=>{
    dialog.remove();
    if (search.isConnected) search.focus();
  });
  dialog.addEventListener('cancel',event=>{ if (back.disabled) event.preventDefault(); });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    add.disabled = back.disabled = close.disabled = true;
    feedback.textContent = '';
    try {
      await armoryRequest('',{action:'link',slug:character.slug,spec:new FormData(form).get('spec') ?? ''});
      dialog.close();
      if (card.isConnected) await openRaidView('characters',null,false);
    } catch (error) { feedback.textContent = error.message; }
    finally { add.disabled = back.disabled = close.disabled = false; }
  });
  card.append(dialog);
  dialog.showModal();
}
