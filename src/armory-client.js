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

export function professionIcon(name, watermarkTarget) {
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
    image.addEventListener('load',()=>{
      icon.replaceChildren(image);
      if (watermarkTarget) {
        const watermark = image.cloneNode();
        watermark.className = 'guild-character-watermark guild-profession-watermark';
        watermarkTarget.append(watermark);
      }
    },{once:true});
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
  const gear = character.gear ?? [];
  const sheet = raidElement('div',null,'character-sheet');
  const left = raidElement('div',null,'character-gear');
  const right = raidElement('div',null,'character-gear character-gear-right');
  const weapons = raidElement('div',null,'character-gear character-weapons');
  const weaponSlots = [['MAIN_HAND','Main Hand'],['OFF_HAND','Off Hand'],['RANGED','Ranged']];
  let tooltipCount = 0;
  const leftSlots = [['HEAD','Head'],['NECK','Neck'],['SHOULDER','Shoulder'],['BACK','Back'],['CHEST','Chest'],
    ['TABARD','Tabard'],['SHIRT','Shirt'],['WRIST','Wrist']];
  const rightSlots = [['HANDS','Hands'],['WAIST','Waist'],['LEGS','Legs'],['FEET','Feet'],['FINGER_1','First Ring'],
    ['FINGER_2','Second Ring'],['TRINKET_1','First Trinket'],['TRINKET_2','Second Trinket']];
  const slotKey = item => item.slotType || item.slot.toUpperCase().replace(/\s+/g,'_');
  const equipped = new Map(gear.map(item=>[slotKey(item),item]));
  function appendSlot(column, slot, item) {
    if (!item) {
      const empty = raidElement('div',null,'character-slot-empty');
      const tile = raidElement('span',slot,'character-slot-icon');
      empty.setAttribute('aria-label','Empty '+slot+' slot');
      empty.append(tile,raidElement('span','No '+slot));
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
    const tile = raidElement('span',null,'character-slot-icon');
    tile.append(raidElement('span',item.slot,'character-slot-caption'));
    const copy = raidElement('span',null,'character-slot-copy');
    const label = raidElement('strong',item.name);
    label.style.color = rarityColor(item.id,item.quality);
    copy.append(label,raidElement('small',[item.slot,item.level != null ? 'iLvl '+item.level : ''].filter(Boolean).join(' · ')));
    if (item.enchants.length) copy.append(raidElement('small',item.enchants.join(' · '),'character-slot-enchant'));
    button.append(tile,copy);
    setItemIcon(tile, item.id);
    if (item.level != null) button.append(raidElement('small',item.level,'character-item-level'));
    const level = item.level != null ? 'Item Level '+item.level : '';
    const enchants = item.enchants.map(enchant=>/^enchanted:/i.test(enchant) ? enchant : 'Enchanted: '+enchant);
    const lines = [level,item.slot,...item.details,...enchants,...(item.effects ?? [])].filter(Boolean);
    const tooltip = raidElement('div',null,'character-item-tooltip');
    tooltip.id = 'character-item-'+tooltipCount++;
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
    for (const [slots,column] of [[leftSlots,left],[rightSlots,right],[weaponSlots,weapons]]) {
      for (const [key,label] of slots) {
        appendSlot(column,label,equipped.get(key));
        equipped.delete(key);
      }
    }
    for (const item of equipped.values()) appendSlot(right,item.slot,item);
    const showcase = raidElement('div',null,'character-showcase');
    showcase.hidden = true;
    if (character.render) {
      const model = raidElement('img');
      model.alt = character.name+' Armory render';
      if (character.renderStyle === 'main-raw') model.className = 'character-model-raw';
      model.addEventListener('load',()=>{
        showcase.hidden = false;
        sheet.classList.add('has-character-render');
      },{once:true});
      model.src = character.render;
      showcase.append(model);
    }
    sheet.append(left,showcase,right,weapons);
  } else sheet.append(raidElement('p','No equipment data available.'));
  const overview = raidElement('section',null,'profile-overview');
  const facts = raidElement('div',null,'raid-stats');
  raidStats(facts,[['Achievements',character.achievementCount ?? '—'],['Item Level',character.itemLevel ?? 'Unavailable'],['Equipped Items',character.gear?.length ?? 'Unavailable']]);
  overview.append(facts);
  const professions = raidElement('div',null,'character-profession-sections');
  const groups = {primary:raidElement('div',null,'guild-dashboard-rows character-professions'),secondary:raidElement('div',null,'guild-dashboard-rows character-professions')};
  for (const entry of character.professions ?? []) {
    const card = raidElement('div',null,'guild-dashboard-entry guild-profession-tile');
    const icon = professionIcon(entry.name,card);
    const details = raidElement('div',null,'character-profession-name');
    details.append(raidElement('strong',entry.name));
    const ranks = entry.skill == null ? entry.tiers.filter(tier=>tier.skill != null) : [entry];
    const skillCap = Math.max(0,...ranks.map(rank=>rank.maxSkill ?? 0));
    const professionRanks = {75:'Apprentice',150:'Journeyman',225:'Expert',300:'Artisan'};
    const professionRank = professionRanks[skillCap];
    if (professionRank) {
      const nextRank = professionRanks[skillCap+75];
      details.append(raidElement('small',professionRank+' · '+(nextRank ? 'Next Rank: '+nextRank : 'Highest Rank')));
    }
    const badges = raidElement('div',null,'character-profession-skills');
    for (const rank of ranks) {
      const badge = raidElement('span',rank.maxSkill > 0 ? rank.skill+' / '+rank.maxSkill : String(rank.skill),'guild-dashboard-count');
      badge.setAttribute('aria-label',(rank.name || entry.name)+' skill '+badge.textContent);
      badges.append(badge);
    }
    if (!ranks.length) badges.append(raidElement('span','—','guild-dashboard-count'));
    card.append(icon,details,badges);
    const category = entry.category ?? (['cooking','fishing','first aid'].includes(entry.name.toLowerCase()) ? 'secondary' : 'primary');
    groups[category].append(card);
  }
  if (!character.professions?.length) professions.append(raidElement('p','No profession data available.','raid-card'));
  else {
    for (const [category,label] of [['primary','Primary Professions'],['secondary','Secondary Professions']]) {
      const section = raidElement('section',null,'guild-profession-group character-profession-section');
      section.append(raidElement('h4',label));
      const cards = groups[category];
      section.append(cards.children.length ? cards : raidElement('p','No '+category+' professions reported.'));
      professions.append(section);
    }
  }
  const statistics = raidElement('section',null,'character-stats-tables');
  const columns = Array.from({length:4},()=>raidElement('div',null,'character-stat-column'));
  for (const group of character.statGroups ?? []) {
    const card = raidElement('section',null,'character-stat-table');
    card.append(raidElement('h3',group.name));
    const rows = raidElement('dl');
    const advanced = raidElement('dl');
    for (const item of group.rows) {
      const row = raidElement('div');
      let value = '—';
      if (item.value != null) {
        if (item.format === 'range') value = item.value.map(number=>Math.round(number).toLocaleString()).join(' – ');
        else {
          const decimals = item.format === 'percent' || item.format === 'decimal' ? 1 : item.format === 'speed' ? 2 : 0;
          value = new Intl.NumberFormat(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(item.value)+(item.format === 'percent' ? '%' : '');
        }
      }
      const shortLabel = item.label.replace(/^(?:Spell|Ranged|Melee) /,'').replace('Main Hand ','Main hand ').replace('Off Hand ','Off hand ').replace('Mana Regen (Combat)','Regen in combat').replace('Mana Regen','Mana regen');
      const label = raidElement('dt',shortLabel);
      label.title = item.label;
      row.append(label,raidElement('dd',value));
      const secondary = /Resistance|Expertise|Penetration|Mastery|Movement|Off Hand/.test(item.label) || item.value == null;
      (secondary ? advanced : rows).append(row);
    }
    card.append(rows);
    if (advanced.children.length) {
      const details = raidElement('details',null,'character-stat-more');
      details.append(raidElement('summary','More stats'),advanced);
      card.append(details);
    }
    columns[({Base:0,Melee:1,Ranged:2,Spell:2,Defense:3})[group.name] ?? 0].append(card);
  }
  statistics.append(...columns);
  statistics.append(raidElement('p','— indicates a value not reported by Blizzard.','character-data-note'));
  return {overview,equipment:sheet,professions,statistics};
}

export function renderCharacterTalents(character) {
  const panel = raidElement('section',null,'raid-card character-talents');
  panel.append(raidElement('h3','Talent Trees'));
  if (!character.talents?.length) {
    panel.append(raidElement('p',character.talents ? 'No talent builds reported by the Armory.' : 'Talent data is unavailable from the Armory.'));
    return panel;
  }
  const layout = Object.hasOwn(foreverTalentLayout,character.className) ? foreverTalentLayout[character.className] : [];
  const builds = raidElement('div',null,'raid-actions character-talent-builds');
  const trees = raidElement('div',null,'character-talent-trees');
  const detail = raidElement('div',null,'character-talent-detail');
  detail.setAttribute('aria-live','polite');
  const source = raidElement('a','Talent data from The Forever Era','text-link');
  source.href = 'https://theforeverera.com/en/talents/';
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  const buildSummary = raidElement('div',null,'character-talent-summary');
  panel.append(buildSummary,builds,trees,detail,source);
  function select(index) {
    for (const [i,button] of [...builds.children].entries()) button.setAttribute('aria-pressed',String(i === index));
    trees.replaceChildren();
    detail.replaceChildren(raidElement('p','Hover over or select a talent to see what it does.'));
    const build = character.talents[index];
    const totalPoints = build.trees.reduce((sum,tree)=>sum+(tree.points ?? tree.talents.reduce((count,talent)=>count+talent.rank,0)),0);
    const primary = build.trees.reduce((best,tree)=>(tree.points ?? 0)>(best?.points ?? -1) ? tree : best,null);
    const summaryTitle = raidElement('div');
    summaryTitle.append(raidElement('strong',primary?.name || 'Talent build'),raidElement('span',build.trees.map(tree=>tree.points ?? 0).join('/')));
    if (build.active) summaryTitle.append(raidElement('small','Active'));
    buildSummary.replaceChildren(summaryTitle,raidElement('span',totalPoints+' points spent'));
    const labels = new Map(layout.map(tree=>[tree[0].toLowerCase(),tree]));
    for (const tree of build.trees) {
      if (!labels.has(tree.name.toLowerCase())) labels.set(tree.name.toLowerCase(),[tree.name,'',null,[]]);
    }
    for (const [key,[name,icon,art,nodes]] of labels) {
      const tree = build.trees.find(entry=>entry.name.toLowerCase() === key);
      const learned = tree?.talents ?? [];
      const points = tree?.points ?? learned.reduce((sum,talent)=>sum+talent.rank,0);
      const card = raidElement('section',null,'character-talent-tree');

      const title = raidElement('h4',name);
      title.append(raidElement('span',points+' pts','character-talent-points'));
      if (icon) {
        const image = raidElement('img');
        image.alt = '';
        image.src = 'https://wow.zamimg.com/images/wow/icons/medium/'+icon+'.jpg';
        title.prepend(image);
      }
      card.append(title);
      const grid = raidElement('div',null,'character-talent-grid');
      const matched = new Set();
      const allocations = new Map(nodes.map(([id,talentName])=>[id,learned.find(entry=>
        entry.id === id || entry.name.toLowerCase() === talentName.toLowerCase())]));
      const positions = new Map(nodes.map(node=>[node[0],node]));
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 400 700');
      svg.setAttribute('aria-hidden','true');
      svg.classList.add('character-talent-connections');
      for (const [id,talentName,row,col,maxRank,asset,descriptions,requirements = []] of nodes) {
        const talent = allocations.get(id);
        for (const [requiredId,requiredRank] of requirements) {
          const prerequisite = positions.get(requiredId);
          if (!prerequisite) continue;
          const [,,fromRow,fromCol] = prerequisite;
          const startX = fromCol*100+50, startY = fromRow*100+50;
          const endX = col*100+50, endY = row*100+50;
          const angle = Math.atan2(endY-startY,endX-startX);
          const tipX = endX-36*Math.cos(angle), tipY = endY-36*Math.sin(angle);
          const baseX = tipX-12*Math.cos(angle), baseY = tipY-12*Math.sin(angle);
          const wingX = 7*Math.sin(angle), wingY = 7*Math.cos(angle);
          const arrow = document.createElementNS(svg.namespaceURI,'path');
          arrow.setAttribute('d','M '+startX+' '+startY+' L '+tipX+' '+tipY+
            ' M '+(baseX+wingX)+' '+(baseY-wingY)+' L '+tipX+' '+tipY+' L '+(baseX-wingX)+' '+(baseY+wingY));
          if ((allocations.get(requiredId)?.rank ?? 0) >= requiredRank) arrow.classList.add('is-unlocked');
          svg.append(arrow);
        }
        if (talent) matched.add(talent);
        const rank = talent?.rank ?? 0;
        const node = raidElement('button',null,'character-talent-node');
        node.type = 'button';
        node.dataset.state = rank >= maxRank ? 'maxed' : rank > 0 ? 'learned' :
          points >= row*5 && requirements.every(([requiredId,requiredRank])=>(allocations.get(requiredId)?.rank ?? 0) >= requiredRank) ? 'available' : 'locked';
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
      if (nodes.length) {
        grid.prepend(svg);
        card.append(grid);
      }
      for (const talent of learned.filter(entry=>!matched.has(entry))) {
        card.append(raidElement('p',talent.name+' · Rank '+talent.rank));
      }
      trees.append(card);
    }
    if (!labels.size) trees.append(raidElement('p','No talents reported for this build.'));
  }
  for (const [i,build] of character.talents.entries()) {
    const label = (['Primary','Secondary'][i] ?? 'Build '+(i+1))+(build.active ? ' · Active' : '');
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
  if (location.pathname !== '/character') {
    const params = new URLSearchParams({character:player.character});
    if (player.armorySlug) params.set('name',player.armorySlug);
    if (event?.id) params.set('raid',event.id);
    location.href = '/character?'+params;
    return;
  }
  document.body.classList.add('character-page-active');
  document.title = player.character+' · Solstice';
  document.querySelector('.character-page-root')?.remove();
  const dialog = raidElement('section',null,'character-page-root');
  dialog.open = true;
  const backUrl = event?.id ? '/?tool=raid&view=detail&raid='+encodeURIComponent(event.id) : '/?tool=raid&view=guildDashboard';
  dialog.close = () => { location.href = backUrl; };
  const back = raidElement('a','Back to Guild Hall','character-page-back');
  back.href = backUrl;
  dialog.append(back);
  const title = raidElement('h2',player.character);
  title.id = 'character-sheet-title';
  dialog.setAttribute('aria-labelledby',title.id);
  const heading = raidElement('div',null,'character-inspector-title');
  const identity = raidElement('div');
  identity.append(title,raidElement('p',[player.spec,player.class_name,player.role].filter(Boolean).join(' · '),'inspector-meta'));
  const close = raidElement('a','Back to Guild Hall','character-banner-close');
  close.href = backUrl;
  close.type = 'button';
  close.setAttribute('aria-label','Close character sheet');

  const level = raidElement('span',undefined,'character-banner-level');
  function setLevel(value) {
    level.textContent = value == null ? '' : String(value);
    level.hidden = value == null;
    if (value != null) level.setAttribute('aria-label','Level '+value);
  }
  setLevel(player.level);
  heading.append(level,identity);
  const header = raidElement('header',null,'character-profile-hero');
  const inner = raidElement('div',null,'character-profile-grid');
  const info = raidElement('div',null,'character-profile-info');
  const overview = raidElement('div');
  overview.append(raidElement('p','Loading character sheet…'));
  const equipment = raidElement('div');
  equipment.hidden = true;
  info.append(heading,overview);
  inner.append(info);
  header.append(inner,close);
  const content = raidElement('div');
  const plannerLink = raidElement('a','Plan Gear for '+player.character,'raid-primary');
  plannerLink.href = '/gear-planner?character='+encodeURIComponent(player.character);
  plannerLink.style.display='inline-block';
  plannerLink.style.margin='12px 0';
  content.append(plannerLink,equipment);
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
  const statisticsPanel = raidElement('div');
  const achievementsPanel = raidElement('div');
  const lifetimePanel = raidElement('div');
  for (const panel of [statisticsPanel,achievementsPanel,lifetimePanel]) panel.append(raidElement('p','Loading character data…'));
  const sections = [['Gear',content,'Equipped items'],['Talents',talents,'Spec builds'],['Stats',statisticsPanel,'Attributes & combat'],['Achievements',achievementsPanel,'Earned & in progress'],['Lifetime',lifetimePanel,'Quests, kills & deaths'],['Professions',professions,'Skills & trades'],...(review ? [['Raid Review',review,'Readiness & evidence']] : [])];
  const panels = sections.map(([label,panel,description])=>{
    const button = raidElement('button');
    button.append(raidElement('strong',label),raidElement('small',description));
    panel.classList.add('character-page-panel');
    panel.setAttribute('aria-label',label);
    panel.setAttribute('role','region');
    button.type = 'button';
    tabs.append(button);
    return {button,panel};
  });
  const loadedSections = new Set();
  async function loadSection(selected) {
    const section = selected === achievementsPanel ? 'achievements' : selected === lifetimePanel ? 'lifetime' : null;
    if (!section || loadedSections.has(section)) return;
    loadedSections.add(section);
    selected.replaceChildren(raidElement('p','Loading '+section+' from Blizzard…','character-data-note'));
    try {
      const data = await armoryRequest('?name='+encodeURIComponent(player.armorySlug)+'&section='+section);
      if (!dialog.isConnected) return;
      selected.replaceChildren(section === 'achievements' ? renderCharacterAchievements(data.achievements) : renderCharacterLifetime(data.lifetime));
    } catch (error) {
      loadedSections.delete(section);
      const retry = raidElement('button','Retry');
      retry.type = 'button';
      retry.addEventListener('click',()=>loadSection(selected));
      selected.replaceChildren(raidElement('p',error.message,'character-data-note'),retry);
    }
  }
  function selectPanel(selected) {
    dialog.querySelector('.character-item-tooltip:popover-open')?.hidePopover();
    overview.hidden = false;
    loadSection(selected);
    equipment.hidden = selected !== content || !equipment.hasChildNodes();
    for (const {button,panel} of panels) {
      button.setAttribute('aria-pressed',String(panel === selected));
      panel.hidden = panel !== selected;
    }
    requestAnimationFrame(()=>{
      if (!matchMedia('(max-width: 600px)').matches) return;
      const active = panels.find(({panel})=>panel === selected)?.button;
      if (!active) return;
      const bounds = tabs.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      if (item.left < bounds.left || item.right > bounds.right) {
        tabs.scrollLeft += item.left-bounds.left-(tabs.clientWidth-item.width)/2;
      }
    });
  }
  for (const {button,panel} of panels) button.addEventListener('click',()=>{
    selectPanel(panel);
    const url = new URL(location.href);
    url.searchParams.set('tab',panel.getAttribute('aria-label').toLowerCase().replace(/ /g,'-'));
    history.replaceState(null,'',url);
  });
  dialog.append(header);
  if (player.armorySlug) {
    const pageLayout = raidElement('div',null,'character-page-layout');
    const pageContent = raidElement('div',null,'character-page-content');
    pageContent.append(...panels.map(({panel})=>panel));
    pageLayout.append(tabs,pageContent);
    dialog.append(pageLayout);
    const requestedTab = new URLSearchParams(location.search).get('tab');
    const requestedPanel = panels.find(({panel})=>panel.getAttribute('aria-label').toLowerCase().replace(/ /g,'-') === (requestedTab === 'journey' ? 'lifetime' : requestedTab))?.panel;
    selectPanel(requestedPanel ?? content);
  } else {
    overview.replaceChildren();
    dialog.append(review ?? raidElement('p','This character was added manually and has no linked Armory profile.','raid-card'));
  }
  dialog.addEventListener('scroll',()=>{
    dialog.querySelector('.character-item-tooltip:popover-open')?.hidePopover();
  });
  document.querySelector('body > main').append(dialog);
  if (!player.armorySlug) return;
  armoryRequest('?name='+encodeURIComponent(player.armorySlug)).then(({character})=>{
    if (!dialog.open) return;
    const profile = renderArmoryProfile(character);
    overview.replaceChildren(profile.overview);
    equipment.replaceChildren(profile.equipment);
    equipment.hidden = content.hidden;
    content.replaceChildren(plannerLink,equipment);
    statisticsPanel.replaceChildren(profile.statistics);

    professions.replaceChildren(profile.professions);
    talents.replaceChildren(renderCharacterTalents(character));
    const meta = identity.querySelector('.inspector-meta');
    meta.textContent = [player.spec,[character.race,character.className || player.class_name].filter(Boolean).join(' '),
      character.guild && '<'+character.guild+'>'].filter(Boolean).join(' · ');
    if (character.ruleset) identity.append(raidElement('p',character.ruleset,'character-profile-realm'));
    if (character.level != null) setLevel(character.level);
    if (character.portrait) {
      const portrait = raidElement('img',null,'character-page-portrait');
      portrait.src = character.portrait;
      portrait.alt = '';
      portrait.addEventListener('error',()=>portrait.remove(),{once:true});
      heading.prepend(portrait);
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
    overview.replaceChildren(raidElement('p',error.message));
    for (const panel of [statisticsPanel,achievementsPanel,lifetimePanel]) panel.replaceChildren(raidElement('p','Character data is unavailable. Return to Guild Hall and try again.'));
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
      const actions = raidElement('div',null,'profile-link-actions');
      const view = raidElement('button','View Character');
      view.type = 'button';
      view.addEventListener('click',()=>openCharacterSheet({...entry,character:entry.name,armorySlug:entry.slug}));
      actions.append(view,unlink);
      row.append(title,actions); content.append(row);
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

export function renderCharacterAchievements(data) {
  const root = raidElement('section',null,'character-achievements');
  if (!Array.isArray(data?.items)) {
    root.append(raidElement('p','Achievement data is unavailable from Blizzard.','character-data-note'));
    return root;
  }
  const items = data.items;
  const earned = items.filter(item=>item.earned).length;
  root.append(raidElement('h3',earned+' of '+items.length+' achievements earned'));
  root.append(raidElement('p','Some achievements are account-wide and may have been earned on another character.','character-data-note'));
  if (data.partial) root.append(raidElement('p','Some achievement definitions could not be loaded. Counts include the available records.','character-data-note'));
  const tabs = raidElement('nav',null,'character-achievement-tabs');
  tabs.setAttribute('aria-label','Achievement categories');
  const content = raidElement('div',null,'character-achievement-groups');
  const categoryNames = ['All',...new Set(items.map(item=>item.category))];
  function select(category) {
    for (const button of tabs.children) button.setAttribute('aria-pressed',String(button.dataset.category === category));
    content.replaceChildren();
    const selected = items.filter(item=>category === 'All' || item.category === category);
    const groups = new Map();
    for (const item of selected) {
      const key = item.category+' / '+item.group;
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(item);
    }
    for (const group of groups.values()) {
      const section = raidElement('section',null,'character-achievement-group');
      const heading = raidElement('header');
      heading.append(raidElement('h4',group[0].group),raidElement('span',group.filter(item=>item.earned).length+' / '+group.length));
      section.append(heading);
      const list = raidElement('ul');
      for (const item of [...group].sort((a,b)=>Number(b.earned)-Number(a.earned))) {
        const row = raidElement('li',null,item.earned ? 'is-earned' : 'is-incomplete');
        const icon = raidElement('span',null,'character-achievement-image');
        const image = raidElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.src = typeof item.icon === 'string' && /^https:\/\/(?:render(?:-[a-z]+)?\.worldofwarcraft\.com|wow\.zamimg\.com)\//i.test(item.icon) ? item.icon : 'https://wow.zamimg.com/images/wow/icons/medium/achievement_general.jpg';
        image.addEventListener('error',()=>{ image.remove();icon.textContent='◇'; },{once:true});
        icon.append(image);
        const copy = raidElement('div',null,'character-achievement-copy');
        copy.append(raidElement('strong',item.name),raidElement('p',item.description));
        const state = raidElement('div',null,'character-achievement-progress');
        if (item.earned) {
          const completed = item.completedAt ? new Date(item.completedAt) : null;
          const date = completed && Number.isFinite(completed.getTime()) ? raidElement('time',new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(completed)) : raidElement('span','Earned');
          if (date.tagName === 'TIME') date.dateTime = completed.toISOString();
          state.append(date);
        } else {
          const total = Math.max(1,item.total ?? 1),current = Math.min(total,Math.max(0,item.current ?? 0));
          const bar = raidElement('progress');
          bar.max = total;
          bar.value = current;
          bar.setAttribute('aria-label',item.name+': '+current+' of '+total);
          state.append(raidElement('span',current.toLocaleString()+' / '+total.toLocaleString()),bar);
        }
        row.append(icon,copy,state);
        list.append(row);
      }
      section.append(list);
      content.append(section);
    }
    if (!selected.length) content.append(raidElement('p','No achievements reported in this category.','character-data-note'));
  }
  for (const category of categoryNames) {
    const group = items.filter(item=>category === 'All' || item.category === category);
    const button = raidElement('button');
    button.type = 'button';
    button.dataset.category = category;
    button.append(raidElement('span',category),raidElement('span',group.filter(item=>item.earned).length+'/'+group.length,'character-achievement-tab-count'));
    button.addEventListener('click',()=>select(category));
    tabs.append(button);
  }
  root.append(tabs,content);
  select('All');
  return root;
}

export function renderCharacterLifetime(data) {
  const root = raidElement('section',null,'character-lifetime');
  if (!Array.isArray(data)) {
    root.append(raidElement('p','Lifetime statistics are unavailable from Blizzard.','character-data-note'));
    return root;
  }
  const format = value => value == null ? '—' : new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(value);
  const find = (id,pattern) => (id == null ? undefined : data.find(row=>row.id === id)?.value) ?? data.find(row=>pattern?.test(row.name))?.value ?? null;
  const metricCards = raidElement('div',null,'character-lifetime-metrics');
  const bosses = data.filter(row=>/boss kills/i.test(row.group));
  for (const [label,value] of [['Quests completed',find(98,/^quests completed$/i)],['Kills',find(1197,/^total kills$/i)],['Bosses killed',bosses.length ? bosses.reduce((sum,row)=>sum+row.value,0) : null],['Exalted reputations',find(null,/^total (?:factions|reputations) at exalted$/i)],['Need rolls',find(1044,/need rolls made/i)],['Duels won',find(null,/^duels won$/i)]]) {
    const card = raidElement('div',null,'character-lifetime-card');
    card.append(raidElement('span',label),raidElement('strong',format(value)));
    metricCards.append(card);
  }
  root.append(metricCards);
  const total = find(60,/^total deaths$/i);
  const deathSection = raidElement('section',null,'character-lifetime-section');
  const heading = raidElement('header');
  heading.append(raidElement('h3','Deaths'),raidElement('span',format(total)+' in total'));
  deathSection.append(heading);
  const deathTypes = [['Other players',find(1501,/^total deaths from other players$/i),'#dc6947'],['Dungeons and raids',find(321,/^total raid and dungeon deaths$/i),'#239e83'],['Falling',find(114,/deaths from falling/i),'#d8a328'],['Fire and lava',find(null,/deaths from (?:fire|lava)/i),'#ce5688'],['Drowning',find(112,/deaths from drowning/i),'#65a65b'],['Fatigue',find(null,/deaths from (?:fatigue|exhaustion)/i),'#9282cf']];
  const known = deathTypes.reduce((sum,[,value])=>sum+(value ?? 0),0);
  const causes = [['Monsters & other',total == null ? null : Math.max(0,total-known),'#4a8ed8'],...deathTypes];
  const bar = raidElement('div',null,'character-death-bar');
  bar.setAttribute('role','img');
  bar.setAttribute('aria-label',total == null ? 'Death statistics unavailable' : causes.map(([label,value])=>label+': '+format(value)).join(', '));
  for (const [label,value,color] of causes) if (total > 0 && value > 0) {
    const segment = raidElement('span');segment.style.width = Math.min(100,value/total*100)+'%';segment.style.background = color;segment.title=label+': '+format(value);bar.append(segment);
  }
  const legend = raidElement('dl',null,'character-death-legend');
  for (const [label,value,color] of causes) {
    const row = raidElement('div');const dot = raidElement('span',null,'character-death-dot');dot.style.background=color;
    const term = raidElement('dt');term.append(dot,document.createTextNode(label));
    row.append(term,raidElement('dd',format(value)+(total > 0 && value != null ? ' · '+(value/total*100).toFixed(value/total<.01 ? 1 : 0)+'%' : '')));legend.append(row);
  }
  deathSection.append(bar,legend);
  root.append(deathSection);
  const table = (label,rows) => {
    const section = raidElement('section',null,'character-lifetime-section');
    if (label) section.append(raidElement('h3',label));
    const list = raidElement('dl',null,'character-lifetime-table');
    for (const [name,value] of rows) {const row = raidElement('div');row.append(raidElement('dt',name),raidElement('dd',typeof value === 'string' ? value : format(value)));list.append(row);}
    section.append(list);return section;
  };
  const played=find(839,/^battlegrounds played$/i),won=find(840,/^battlegrounds won$/i);
  const bgDeathCounters=data.filter(row=>/deaths.*battlegrounds/i.test(row.group) && /^deaths in /i.test(row.name));
  const bgKills=find(382,/^battleground honorable kills$/i),bgDeaths=find(null,/^battleground deaths$/i) ?? (bgDeathCounters.length ? bgDeathCounters.reduce((sum,row)=>sum+row.value,0) : played === 0 ? 0 : null);
  const worldKills=find(381,/^world (?:pvp )?honorable kills$/i),playerDeaths=find(1501,/^total deaths from other players$/i);
  const worldDeaths=playerDeaths != null && bgDeaths != null ? Math.max(0,playerDeaths-bgDeaths) : null;
  const pvp=raidElement('section',null,'character-lifetime-section');pvp.append(raidElement('h3','PvP'));
  const pvpCards=raidElement('div',null,'character-lifetime-pvp');
  for (const [label,kills,deaths] of [['Battlegrounds K/D',bgKills,bgDeaths],['World PvP K/D',worldKills,worldDeaths]]) {
    const card=raidElement('div',null,'character-lifetime-card');
    const ratio=kills == null || deaths == null || deaths === 0 ? '—' : (kills/deaths).toFixed(2);
    card.append(raidElement('span',label),raidElement('strong',ratio),raidElement('small',format(kills)+' honorable kills / '+format(deaths)+' deaths'));pvpCards.append(card);
  }
  pvp.append(pvpCards,table('',[['Battlegrounds played',played],['Battlegrounds won',won],['Win rate',played > 0 && won != null ? (won/played*100).toFixed(1)+'%' : null]]));
  root.append(pvp);
  const columns=raidElement('div',null,'character-lifetime-columns');
  columns.append(table('Travel',[['Flight paths taken',find(349,/flight paths taken/i)],['Times hearthed',find(353,/times hearthed/i)],['Mage portals taken',find(null,/^mage portals taken$/i)],['Summons accepted',find(2277,/summons accepted/i)],['Times camped',find(64222,/times camped/i)]]),table('Consumables',[['Food eaten',find(347,/food eaten/i)],['Beverages drunk',find(346,/beverages consumed/i)],['Health potions',find(345,/health potions consumed/i)],['Mana potions',find(922,/mana potions consumed/i)],['Elixirs',find(923,/elixirs consumed/i)],['Bandages used',find(344,/bandages used/i)],['Healthstones used',find(812,/healthstones used/i)]]));
  root.append(columns,raidElement('p','Lifetime counters come from Blizzard. — indicates a value not reported.','character-data-note'));
  return root;
}
