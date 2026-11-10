export function attachCharacterTooltip(trigger, anchor, tooltip, fallback, showOnClick = false) {
  trigger.setAttribute('aria-describedby',tooltip.id);
  if (typeof tooltip.showPopover !== 'function') {
    trigger.title = fallback.filter(Boolean).join(' · ');
    tooltip.hidden = true;
    return;
  }
  function show() {
    if (!tooltip.matches(':popover-open')) tooltip.showPopover();
    const rect = anchor.getBoundingClientRect();
    const leftEdge = rect.right+tooltip.offsetWidth+10 <= innerWidth ? rect.right+8 : rect.left-tooltip.offsetWidth-8;
    tooltip.style.left = Math.max(8,Math.min(leftEdge,innerWidth-tooltip.offsetWidth-8))+'px';
    tooltip.style.top = Math.max(8,Math.min(rect.top,innerHeight-tooltip.offsetHeight-8))+'px';
  }
  function hide() { tooltip.hidePopover(); }
  trigger.addEventListener('mouseenter',show);
  trigger.addEventListener('focus',show);
  if (showOnClick) trigger.addEventListener('click',show);
  trigger.addEventListener('mouseleave',hide);
  trigger.addEventListener('blur',hide);
  trigger.addEventListener('keydown',event=>{
    if (event.key === 'Escape' && tooltip.matches(':popover-open')) {
      event.preventDefault();
      hide();
    }
  });
}

export function professionIcon(name) {
  const icons = {
    alchemy:'trade_alchemy', blacksmithing:'trade_blacksmithing', cooking:'inv_misc_food_15',
    enchanting:'trade_engraving', engineering:'trade_engineering', 'first aid':'spell_holy_sealofsacrifice',
    fishing:'trade_fishing', herbalism:'spell_nature_naturetouchgrow', leatherworking:'inv_misc_armorkit_17',
    mining:'trade_mining', skinning:'inv_misc_pelt_wolf_01', tailoring:'trade_tailoring',
  };
  const icon = raidElement('span',name.slice(0,1),'profession-progress-icon');
  const asset = icons[name.toLowerCase()];
  if (asset) {
    const image = raidElement('img');
    image.alt = '';
    image.addEventListener('load',()=>icon.replaceChildren(image),{once:true});
    image.src = 'https://wow.zamimg.com/images/wow/icons/medium/'+asset+'.jpg';
  }
  return icon;
}

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
    const linked = Number.isSafeInteger(item.id) && item.id > 0;
    const button = raidElement(linked ? 'a' : 'button',null,'character-slot-button');
    if (linked) {
      button.href = 'https://www.wowhead.com/forever/item='+item.id;
      button.target = '_blank';
      button.rel = 'noopener noreferrer';
      button.dataset.wowhead = 'np';
    } else button.type = 'button';
    button.setAttribute('aria-label',item.slot+': '+item.name+(linked ? ' (opens Wowhead in a new tab)' : ''));
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
    attachCharacterTooltip(button,tile,tooltip,[item.name,...lines],!linked);
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
  const professions = raidElement('div',null,'character-professions');
  for (const entry of character.professions ?? []) {
    const card = raidElement('section',null,'raid-card profession-progress-card');
    const icon = professionIcon(entry.name);
    const details = raidElement('div',null,'profession-progress-details');
    details.append(raidElement('h3',entry.name));
    const ranks = entry.skill == null ? entry.tiers.filter(tier=>tier.skill != null) : [entry];
    for (const rank of ranks) {
      const row = raidElement('div',null,'profession-progress-row');
      if (rank !== entry && rank.name && rank.name !== entry.name) details.append(raidElement('small',rank.name));
      if (rank.maxSkill > 0) {
        const progress = raidElement('progress');
        progress.max = rank.maxSkill;
        progress.value = rank.skill;
        progress.setAttribute('aria-label',rank.name || entry.name);
        row.append(progress,raidElement('small',rank.skill+' / '+rank.maxSkill));
      } else row.append(raidElement('small','Skill '+rank.skill));
      details.append(row);
    }
    if (!ranks.length) details.append(raidElement('small','Skill Level Unavailable'));
    const skillCap = Math.max(0,...ranks.map(rank=>rank.maxSkill ?? 0));
    const professionRanks = {75:'Apprentice',150:'Journeyman',225:'Expert',300:'Artisan'};
    const professionRank = professionRanks[skillCap];
    if (professionRank) {
      const nextRank = professionRanks[skillCap+75];
      const heading = raidElement('div',null,'profession-progress-rank');
      heading.append(raidElement('span',professionRank,'eyebrow'),
        raidElement('small',nextRank ? 'Next Rank: '+nextRank : 'Highest Rank'));
      card.append(heading);
    }
    card.append(icon,details);
    professions.append(card);
  }
  if (!character.professions?.length) professions.append(raidElement('p','No profession data available.','raid-card'));
  root.append(raidElement('small','Source: Blizzard Armory'));
  return { gearPanel:root, professions };
}

export function renderCharacterTalents(character) {
  const panel = raidElement('section',null,'raid-card character-talents');
  panel.append(raidElement('h3','Talent Trees'));
  if (!character.talents?.length) {
    panel.append(raidElement('p',character.talents ? 'No talent builds reported by the Armory.' : 'Talent data is unavailable from the Armory.'));
    return panel;
  }
  const layout = Object.hasOwn(foreverTalentLayout,character.className) ? foreverTalentLayout[character.className] : [];
  const builds = raidElement('div',null,'raid-actions');
  const trees = raidElement('div',null,'character-talent-trees');
  const detail = raidElement('div',null,'character-talent-detail');
  detail.setAttribute('aria-live','polite');
  const source = raidElement('a','Talent data from The Forever Era','text-link');
  source.href = 'https://theforeverera.com/en/talents/';
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  panel.append(builds,trees,detail,source);
  function select(index) {
    for (const [i,button] of [...builds.children].entries()) button.setAttribute('aria-pressed',String(i === index));
    trees.replaceChildren();
    detail.replaceChildren(raidElement('p','Hover over or select a talent to see what it does.'));
    const build = character.talents[index];
    const labels = new Map(layout.map(tree=>[tree[0].toLowerCase(),tree]));
    for (const tree of build.trees) {
      if (!labels.has(tree.name.toLowerCase())) labels.set(tree.name.toLowerCase(),[tree.name,'',[]]);
    }
    for (const [key,[name,icon,nodes]] of labels) {
      const tree = build.trees.find(entry=>entry.name.toLowerCase() === key);
      const learned = tree?.talents ?? [];
      const points = tree?.points ?? learned.reduce((sum,talent)=>sum+talent.rank,0);
      const card = raidElement('section',null,'character-talent-tree');
      const title = raidElement('h4',name+' · '+points+' pts');
      if (icon) {
        const image = raidElement('img');
        image.alt = '';
        image.src = 'https://wow.zamimg.com/images/wow/icons/medium/'+icon+'.jpg';
        title.prepend(image);
      }
      card.append(title);
      const grid = raidElement('div',null,'character-talent-grid');
      const matched = new Set();
      for (const [id,talentName,row,col,maxRank,asset,descriptions] of nodes) {
        const talent = learned.find(entry=>entry.id === id || entry.name.toLowerCase() === talentName.toLowerCase());
        if (talent) matched.add(talent);
        const rank = talent?.rank ?? 0;
        const node = raidElement('button',null,'character-talent-node');
        node.type = 'button';
        node.dataset.learned = String(rank > 0);
        node.style.gridArea = (row+1)+' / '+(col+1);
        const rankText = rank+'/'+maxRank;
        node.setAttribute('aria-label',talentName+', rank '+rankText);
        const description = talent?.description || descriptions[Math.max(0,Math.min(rank,maxRank)-1)];
        const rankLabel = rank ? 'Rank '+rankText : 'Unlearned · Rank 1 Preview';
        const tooltip = raidElement('div',null,'character-item-tooltip character-talent-tooltip');
        tooltip.id = 'character-talent-'+id;
        tooltip.setAttribute('popover','manual');
        tooltip.setAttribute('role','tooltip');
        tooltip.append(raidElement('strong',talentName),raidElement('span',rankLabel,'character-tooltip-level'));
        if (description) tooltip.append(raidElement('span',description));
        attachCharacterTooltip(node,node,tooltip,[talentName,rankLabel,description]);
        if (asset) {
          const image = raidElement('img');
          image.alt = '';
          image.loading = 'lazy';
          image.src = 'https://wow.zamimg.com/images/wow/icons/medium/'+asset+'.jpg';
          node.append(image);
        }
        node.append(raidElement('span',rankText));
        node.addEventListener('click',()=>detail.replaceChildren(raidElement('strong',talentName+' · '+rankLabel),
          ...(description ? [raidElement('p',description)] : [])));
        grid.append(node,tooltip);
      }
      if (nodes.length) card.append(grid);
      for (const talent of learned.filter(entry=>!matched.has(entry))) {
        card.append(raidElement('p',talent.name+' · Rank '+talent.rank));
      }
      trees.append(card);
    }
    if (!labels.size) trees.append(raidElement('p','No talents reported for this build.'));
  }
  for (const [i,build] of character.talents.entries()) {
    const label = 'Build '+(i+1)+(build.active ? ' · Active' : '');
    const button = raidElement('button',label);
    button.type = 'button';
    button.addEventListener('click',()=>select(i));
    builds.append(button);
  }
  builds.hidden = character.talents.length < 2;
  select(Math.max(0,character.talents.findIndex(build=>build.active)));
  return panel;
}

export function openCharacterSheet(player, event, organizer) {
  const dialog = raidElement('dialog',null,'workspace-drawer character-drawer');
  const title = raidElement('h2',player.character);
  title.id = 'character-sheet-title';
  dialog.setAttribute('aria-labelledby',title.id);
  const heading = raidElement('div',null,'character-inspector-title');
  const identity = raidElement('div');
  identity.append(raidElement('p','Character Profile','eyebrow'),title,raidElement('p',[player.class_name,player.spec,player.role].filter(Boolean).join(' · '),'inspector-meta'));
  const portrait = characterIcons(player.class_name,player.spec);
  portrait.classList.add('character-banner-portrait');
  heading.append(portrait,identity);
  const close = raidElement('button','×','character-banner-close');
  close.type = 'button';
  close.setAttribute('aria-label','Close character sheet');
  close.addEventListener('click',()=>dialog.close());
  const level = raidElement('span',player.level == null ? '' : 'Level '+player.level,'character-banner-level');
  level.hidden = player.level == null;
  const header = raidElement('header',null,'workspace-drawer-heading character-banner');
  header.append(heading,level,close);
  const content = raidElement('div');
  content.append(raidElement('p','Loading character sheet…'));
  const review = event ? raidElement('div',null,'character-raid-review') : null;
  const evidence = event ? raidElement('section',null,'raid-card raid-review-evidence') : null;
  if (event) {
    const checks = reviewCharacter(event,player,organizer,async update=>{
      await raidRequest('/'+event.id,update);
      dialog.close();
      if (raidView === 'roster' && workspaceGoal === event.id) await openRaidView('roster',null,false);
    },true);
    const summary = raidElement('section',null,'raid-card raid-review-summary');
    const readiness = readinessOf(player);
    const ready = readinessChecks.filter(([key])=>player.readiness?.[key] === 'Ready').length;
    const applicable = readinessChecks.filter(([key])=>player.readiness?.[key] !== 'Not applicable').length;
    const state = raidElement('strong',readiness);
    state.dataset.readiness = readiness;
    summary.append(raidElement('p','Saved Raid Readiness','eyebrow'),raidElement('h3',event.title),state,
      raidElement('p',(applicable ? ready+' of '+applicable+' applicable checks ready' : 'No applicable checks')+' · RSVP: '+player.status),
      raidElement('small',player.reviewed_at ? 'Last reviewed '+raidDate(player.reviewed_at) : 'No review saved yet.'));
    evidence.append(raidElement('h3','Armory Evidence'),raidElement('p',player.armorySlug ?
      'Loading Armory data…' : 'This character has no linked Armory profile. You can still complete the review.'));
    review.append(summary,checks,evidence);
  }
  const professions = raidElement('div');
  professions.append(raidElement('p','Loading professions…'));
  const tabs = raidElement('nav',null,'character-review-tabs');
  tabs.setAttribute('aria-label','Character Sheet Sections');
  const talents = raidElement('div');
  talents.append(raidElement('p','Loading talents…'));
  const sections = [['Character',content],['Talents',talents],...(review ? [['Raid Review',review]] : []),['Professions',professions]];
  const panels = sections.map(([label,panel])=>{
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
  dialog.append(header);
  if (player.armorySlug) {
    dialog.append(tabs,...panels.map(({panel})=>panel));
    selectPanel(content);
  } else dialog.append(review ?? raidElement('p','This character was added manually and has no linked Armory profile.','raid-card'));
  dialog.addEventListener('scroll',()=>{
    dialog.querySelector('.character-item-tooltip:popover-open')?.hidePopover();
  });
  document.body.append(dialog);
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.setAttribute('closedby','any');
  function onBackdrop(event) {
    if (event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX >= bounds.right ||
      event.clientY < bounds.top || event.clientY >= bounds.bottom;
  }
  if (!('closedBy' in dialog)) {
    let pressedBackdrop = false;
    dialog.addEventListener('pointerdown',event=>{ pressedBackdrop = onBackdrop(event); });
    dialog.addEventListener('click',event=>{
      if (pressedBackdrop && onBackdrop(event)) dialog.close();
      pressedBackdrop = false;
    });
  }
  dialog.showModal();
  if (!player.armorySlug) return;
  armoryRequest('?name='+encodeURIComponent(player.armorySlug)).then(({character})=>{
    if (!dialog.open) return;
    const { gearPanel, professions:skills } = renderArmoryProfile(character);
    content.replaceChildren(gearPanel);
    professions.replaceChildren(skills);
    talents.replaceChildren(renderCharacterTalents(character));
    if (character.portrait) {
      const image = raidElement('img');
      image.alt = '';
      image.addEventListener('load',()=>portrait.replaceChildren(image),{once:true});
      image.src = character.portrait;
    }
    if (character.guild) identity.append(raidElement('p','<'+character.guild+'>','character-banner-guild'));
    if (character.level != null) {
      level.textContent = 'Level '+character.level;
      level.hidden = false;
    }
    if (!evidence) return;
    const gear = character.gear;
    const stats = raidElement('div',null,'raid-stats');
    raidStats(stats,[
      ['Item Level',character.itemLevel ?? 'Unavailable'],
      ['Equipped Items',gear?.length ?? 'Unavailable'],
      ['Items With Reported Enchants',gear?.filter(item=>item.enchants.length).length ?? 'Unavailable'],
    ]);
    evidence.replaceChildren(raidElement('h3','Armory Evidence'),stats,
      raidElement('p','These figures come from Blizzard. Organizers set readiness for the selected raid.'));
  }).catch(error=>{
    content.replaceChildren(raidElement('p',error.message));
    professions.replaceChildren(raidElement('p','Professions are unavailable.'));
    talents.replaceChildren(raidElement('p','Talents are unavailable.'));
    evidence?.replaceChildren(raidElement('h3','Armory Evidence'),raidElement('p','Armory data is unavailable. You can still complete the review.'));
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
  const facts = raidElement('dl',null,'character-banner-facts');
  header.append(heading,close,facts);

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
