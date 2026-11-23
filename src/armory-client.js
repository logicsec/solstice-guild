import { tablerIcon } from '../public/assets/icons.js';
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
    for (const [slots,column] of [[leftSlots,left],[rightSlots,right]]) {
      for (const [key,label] of slots) {
        appendSlot(column,label,equipped.get(key));
        equipped.delete(key);
      }
    }
    for (const [key,label] of weaponSlots) {
      const item = equipped.get(key);
      if (item) appendSlot(key === 'RANGED' ? right : left,label,item);
      equipped.delete(key);
    }
    for (const item of equipped.values()) appendSlot(right,item.slot,item);
    sheet.append(left,right);
  } else sheet.append(raidElement('p','No equipment data available.'));
  const overview = raidElement('section',null,'profile-overview');
  const facts = raidElement('div',null,'raid-stats');
  raidStats(facts,[['Achievements',character.achievementCount ?? '—'],['Item Level',character.itemLevel ?? 'Unavailable'],['Equipped Items',character.gear?.length ?? 'Unavailable']]);
  overview.append(facts);
  const professions = raidElement('div',null,'character-profession-list');
  for (const entry of character.professions ?? []) {
    const rank = entry.skill != null ? entry : (entry.tiers ?? []).find(tier=>tier.skill != null);
    const secondary = entry.category === 'secondary' || ['Cooking','Fishing','First Aid'].includes(entry.name);
    const row = raidElement('div',null,'character-profession-row'+(secondary ? ' is-secondary' : ''));
    const heading = raidElement('div');
    heading.append(raidElement('strong',entry.name),raidElement('span',rank ? rank.skill+' / '+(rank.maxSkill ?? '—') : 'Not reported'));
    row.append(heading);
    if (rank?.maxSkill > 0) {
      const bar = raidElement('progress');bar.max=rank.maxSkill;bar.value=Math.max(0,Math.min(rank.skill,rank.maxSkill));bar.setAttribute('aria-label',entry.name+': '+rank.skill+' of '+rank.maxSkill);row.append(bar);
    }
    professions.append(row);
  }
  if (!character.professions?.length) professions.append(raidElement('p','No profession data available.','character-data-note'));
  const statistics = raidElement('section',null,'character-stats-tables');
  const columns = Array.from({length:4},()=>raidElement('div',null,'character-stat-column'));
  for (const group of character.statGroups ?? []) {
    const card = raidElement('section',null,'character-stat-table');
    card.append(raidElement('h3',group.name));
    const rows = raidElement('dl');
    const advanced = raidElement('dl');
    for (const item of group.rows) {
      const row = raidElement('div');
      row.dataset.statLabel = item.label;
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
  const compact = raidElement('section',null,'character-compact-stats');
  const resources = raidElement('div',null,'character-stat-resources');
  const findRow = label => [...statistics.querySelectorAll('[data-stat-label]')].find(row=>row.dataset.statLabel === label);
  for (const label of ['Health','Mana']) {
    const row = findRow(label);
    if (row) { const tile = raidElement('div');tile.append(raidElement('small',label),raidElement('strong',row.querySelector('dd').textContent));resources.append(tile); }
  }
  compact.append(resources);
  const caster = ['Mage','Priest','Warlock','Druid','Shaman','Paladin'].includes(character.className);
  for (const [title,labels] of [
    ['Attributes',['Strength','Agility','Stamina','Intellect','Spirit']],
    [caster ? 'Spell' : 'Melee',caster ? ['Spell Power','Spell Healing','Spell Crit','Mana Regen','Mana Regen (Combat)'] : ['Attack Power','Main Hand Damage','Main Hand Speed','Melee Crit']],
    ['Defense',['Armor','Defense','Dodge']]
  ]) {
    const group = raidElement('section');group.append(raidElement('h3',title));const rows = raidElement('dl');
    for (const label of labels) { const row = findRow(label);if (row) { const copy = row.cloneNode(true);copy.querySelector('dt').textContent = label === 'Spell Healing' ? 'Healing' : label === 'Mana Regen (Combat)' ? 'Regen in combat' : label;rows.append(copy); } }
    if (rows.children.length) { group.append(rows);compact.append(group); }
  }
  const more = raidElement('details',null,'character-stat-more');more.append(raidElement('summary','All stats'),statistics);compact.append(more);
  return {overview,equipment:sheet,professions,statistics:compact};
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
    level.textContent = value == null ? '' : 'Lvl '+value;
    level.hidden = value == null;
    if (value != null) level.setAttribute('aria-label','Level '+value);
  }
  setLevel(player.level);
  const headerModel = raidElement('div',null,'character-header-model');
  const badges = raidElement('div',null,'character-header-badges');
  const rulesetBadge = raidElement('span',player.ruleset || 'Normal');
  badges.append(raidElement('span','Warcraft Forever'),rulesetBadge);
  identity.prepend(badges);
  title.append(level);
  const freshness = raidElement('div',null,'character-header-freshness');
  const freshnessText = raidElement('span','Loading Armory…');
  const refreshButton = raidElement('button','Refresh');refreshButton.type='button';refreshButton.addEventListener('click',()=>location.reload());
  freshness.append(freshnessText,refreshButton);identity.append(freshness);
  heading.append(headerModel,identity);
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
  const plannerLink = raidElement('a','Gear Planner','raid-primary character-planner-button');
  plannerLink.setAttribute('aria-label','Plan gear for '+player.character);
  plannerLink.href = '/gear-planner?character='+encodeURIComponent(player.character);

  content.append(equipment);
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
  const talents = raidElement('div');
  talents.append(raidElement('p','Loading talents…'));
  const statisticsPanel = raidElement('aside',null,'character-gear-stats');
  statisticsPanel.setAttribute('aria-label','Character stats');
  const equipmentLayout = raidElement('div',null,'character-equipment-layout');
  equipmentLayout.append(equipment,statisticsPanel);
  content.replaceChildren(equipmentLayout);
  const achievementsPanel = raidElement('div');
  const lifetimePanel = raidElement('div');
  const reputationPanel = raidElement('div');
  reputationPanel.tabIndex = 0;
  for (const panel of [statisticsPanel,achievementsPanel,lifetimePanel,reputationPanel]) panel.append(raidElement('p','Loading character data…'));
  const sections = [['Gear',content,'Equipped items'],['Talents',talents,'Spec builds'],['Professions',professions,'Skills & trades'],['Reputation',reputationPanel,'Faction standings'],['Achievements',achievementsPanel,'Earned & in progress'],['Activity',lifetimePanel,'Statistics & boss kills'],...(review ? [['Raid Review',review,'Readiness & evidence']] : [])];
  const panels = sections.map(([label,panel])=>{
    const section = raidElement('section',null,'character-page-section');
    section.id = 'character-'+label.toLowerCase().replace(/ /g,'-');
    const cardHeader = raidElement('header',null,'character-section-header');
    cardHeader.append(characterSectionIcon(label),raidElement('h2',label === 'Gear' ? 'Equipment' : label,'character-section-heading'));
    if (label === 'Gear') cardHeader.append(plannerLink);
    if (label === 'Gear') {
      section.classList.add('character-equipment-section');
      const gearCard = raidElement('div',null,'character-equipment-card');
      gearCard.append(cardHeader,equipment);
      equipmentLayout.replaceChildren(gearCard,statisticsPanel);
      section.append(panel);
    } else section.append(cardHeader,panel);
    panel.classList.add('character-page-panel');
    panel.setAttribute('aria-label',label);
    panel.setAttribute('role','region');
    return {panel,section};
  });
  const loadedSections = new Set();
  async function loadSection(selected) {
    const section = selected === achievementsPanel ? 'achievements' : selected === lifetimePanel ? 'lifetime' : selected === reputationPanel ? 'reputations' : null;
    if (!section || loadedSections.has(section)) return;
    loadedSections.add(section);
    selected.replaceChildren(raidElement('p','Loading '+section+' from Blizzard…','character-data-note'));
    try {
      const data = await armoryRequest('?name='+encodeURIComponent(player.armorySlug)+'&section='+section);
      if (!dialog.isConnected) return;
      selected.replaceChildren(section === 'achievements' ? renderCharacterAchievements(data.achievements) : section === 'reputations' ? renderCharacterReputations(data.reputations) : renderCharacterLifetime(data.lifetime));
    } catch (error) {
      loadedSections.delete(section);
      const retry = raidElement('button','Retry');
      retry.type = 'button';
      retry.addEventListener('click',()=>loadSection(selected));
      selected.replaceChildren(raidElement('p',error.message,'character-data-note'),retry);
    }
  }
  dialog.append(header);
  if (player.armorySlug) {
    const pageLayout = raidElement('div',null,'character-page-layout');
    const pageContent = raidElement('div',null,'character-page-content');
    pageContent.append(...panels.map(({section})=>section));
    const paired = raidElement('div',null,'character-profession-reputation-pair');
    const professionSection = panels.find(item=>item.panel === professions).section;
    const reputationSection = panels.find(item=>item.panel === reputationPanel).section;
    pageContent.insertBefore(paired,professionSection);
    paired.append(professionSection,reputationSection);
    pageLayout.append(pageContent);
    dialog.append(pageLayout);
    const requestedTab = new URLSearchParams(location.search).get('tab');
    const requestedPanel = panels.find(({panel})=>panel.getAttribute('aria-label').toLowerCase().replace(/ /g,'-') === (['journey','lifetime'].includes(requestedTab) ? 'activity' : requestedTab === 'stats' ? 'gear' : requestedTab))?.panel;
    loadSection(requestedPanel ?? content);
  } else {
    overview.replaceChildren();
    dialog.append(review ?? raidElement('p','This character was added manually and has no linked Armory profile.','raid-card'));
  }
  dialog.addEventListener('scroll',()=>{
    dialog.querySelector('.character-item-tooltip:popover-open')?.hidePopover();
  });
  const main = document.querySelector('body > main');
  const siteShell = document.getElementById('raidPanel');
  const sidebar = siteShell?.querySelector('.raid-sidebar');
  if (siteShell) {
    siteShell.hidden = false;
    siteShell.querySelector('.raid-content').append(dialog);
    if (sidebar && !sidebar.dataset.characterNavigation) {
      sidebar.dataset.characterNavigation = 'true';
      sidebar.addEventListener('click',event=>{
        const item = event.target.closest('[data-raid-view]');
        if (!item) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        location.href = '/?tool=raid&view='+encodeURIComponent(item.dataset.raidView);
      },true);
    }
    const topbar = document.querySelector('.guild-topbar');
    if (topbar && !topbar.dataset.characterNavigation) {
      topbar.dataset.characterNavigation = 'true';
      topbar.addEventListener('click',event=>{
        const item = event.target.closest('#raidTab,#auctionTab,#professionTab');
        if (!item) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        location.href = '/?tool='+({raidTab:'raid',auctionTab:'auction',professionTab:'profession'})[item.id];
      },true);
    }
    document.getElementById('raidTab').setAttribute('aria-pressed','true');
    document.getElementById('auctionTab').setAttribute('aria-pressed','false');
  } else main.append(dialog);
  if (player.armorySlug) {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries=>{
        if (!dialog.isConnected) { observer.disconnect(); return; }
        for (const entry of entries) if (entry.isIntersecting) {
          const item = panels.find(item=>item.section === entry.target);
          if (item) loadSection(item.panel);
        }
      },{rootMargin:'300px 0px'});
      for (const item of panels) observer.observe(item.section);
      window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
    } else {
      loadSection(achievementsPanel);
      loadSection(lifetimePanel);
      loadSection(reputationPanel);
    }
  }

  if (!player.armorySlug) return;
  armoryRequest('?name='+encodeURIComponent(player.armorySlug)).then(({character})=>{
    if (!dialog.open) return;
    const profile = renderArmoryProfile(character);
    overview.replaceChildren(profile.overview);
    equipment.replaceChildren(profile.equipment);
    equipment.hidden = content.hidden;
    content.replaceChildren(equipmentLayout);
    const statsHeader = raidElement('header',null,'character-section-header');
    statsHeader.append(characterSectionIcon('Stats'),raidElement('h3','Stats'));
    statisticsPanel.replaceChildren(statsHeader,profile.statistics);

    professions.replaceChildren(profile.professions);
    talents.replaceChildren(renderCharacterTalents(character));
    const params = new URLSearchParams(location.search);
    const requested = params.get('tab');
    const target = panels.find(({section,panel})=>location.hash === '#'+section.id || requested && panel.getAttribute('aria-label').toLowerCase() === (requested === 'stats' ? 'gear' : ['journey','lifetime'].includes(requested) ? 'activity' : requested));
    if (target) requestAnimationFrame(()=>target.section.scrollIntoView({block:'start'}));
    const meta = identity.querySelector('.inspector-meta');
    meta.textContent = [player.spec,[character.race,character.className || player.class_name].filter(Boolean).join(' '),
      character.guild && '<'+character.guild+'>'].filter(Boolean).join(' · ');
    rulesetBadge.textContent = character.ruleset || 'Normal';
    freshnessText.textContent = ['Item level '+(character.itemLevel ?? '—'),character.lastLogin ? 'Last seen '+new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(character.lastLogin)) : null,'Updated just now'].filter(Boolean).join(' · ');
    if (character.level != null) setLevel(character.level);
    const thumbnail = character.render || character.portrait;
    if (thumbnail) {
      const image = raidElement('img');image.src=thumbnail;image.alt=character.name+' character render';
      if (character.render && character.renderStyle === 'main-raw') image.className = 'character-model-raw';
      image.addEventListener('error',()=>{image.remove();headerModel.textContent=character.className || '';},{once:true});headerModel.replaceChildren(image);
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
    for (const panel of [statisticsPanel,achievementsPanel,lifetimePanel,reputationPanel]) panel.replaceChildren(raidElement('p','Character data is unavailable. Return to Guild Hall and try again.'));
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
        image.addEventListener('error',()=>{ image.remove();icon.replaceChildren(tablerIcon('trophy')); },{once:true});
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
  const root=raidElement('section',null,'character-activity');
  const header=raidElement('header',null,'activity-header');
  header.append(characterSectionIcon('Activity'),raidElement('h3','Activity'));
  root.append(header);
  if (!Array.isArray(data)) { root.append(raidElement('p','Activity statistics are unavailable from Blizzard.','character-data-note'));return root; }
  const rows=data.filter(row=>row.id != null);
  const number=value=>value == null ? '—' : new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(value);
  const find=id=>rows.find(row=>row.id===id);
  const body=raidElement('div',null,'activity-body');
  const summary=raidElement('div',null,'activity-summary');
  for(const [label,id,tone] of [['Total kills',1197,''],['Killing blows',1487,''],['Deaths',60,'red'],['Quests completed',98,'gold'],['Dungeons entered',932,'purple'],['Flight paths',349,'blue'],['Hearthstones',353,'blue']]) {
    const card=raidElement('div',null,'activity-summary-card');
    const title=raidElement('span',label);title.title=label;
    const value=raidElement('strong',number(find(id)?.value));
    if(tone)value.className='activity-value-'+tone;
    card.append(title,value);summary.append(card);
  }
  body.append(summary);
  const highlights=raidElement('div',null,'activity-highlights');
  for(const [label,value] of [['Most killed',find(1336)?.description],['Most killing blows in',find(1489)?.description],['Kills per death',find(1197)?.value != null && find(60)?.value > 0 ? number(find(1197).value/find(60).value) : null]]) {
    const entry=raidElement('span',label+': ');entry.append(raidElement('strong',value || '—'));highlights.append(entry);
  }
  body.append(highlights);
  const bosses=rows.filter(row=>/boss kills/i.test(row.group) && row.value>0);
  const bossSection=raidElement('section',null,'activity-boss-section');
  bossSection.append(raidElement('h4','Dungeon boss kills'));
  const badges=raidElement('div',null,'activity-boss-badges');
  for(const boss of bosses) {
    const match=boss.name.match(/^(.*?)(?: kills)?\s*\((.*?)\)$/i);
    const badge=raidElement('div',null,'activity-boss-badge');
    const skull=tablerIcon('skull','activity-boss-skull');skull.setAttribute('aria-hidden','true');
    badge.append(skull,raidElement('strong',match?.[1] ?? boss.name),...(match ? [raidElement('span',match[2])] : []),raidElement('b','×'+number(boss.value)));
    badges.append(badge);
  }
  if(!bosses.length)badges.append(raidElement('p','No boss kills reported.','activity-empty'));
  bossSection.append(badges);body.append(bossSection);
  const all=raidElement('section',null,'activity-all');
  all.append(raidElement('h4','All statistics'));
  const controls=raidElement('div',null,'activity-controls');
  const categories=raidElement('nav',null,'activity-categories');categories.setAttribute('aria-label','Activity categories');
  const search=raidElement('input');search.type='search';search.placeholder='Filter statistics…';search.setAttribute('aria-label','Filter activity statistics');
  const results=raidElement('div',null,'activity-stat-groups');
  const categoryOf=row=>row.group.split(' / ')[0];
  const names=[...new Set(rows.map(categoryOf))];
  const order=['Character','Player vs. Player','Dungeons & Raids','Kills','Deaths','Quests','Skills','Travel','Social'];
  names.sort((a,b)=>(order.indexOf(a)<0 ? 99 : order.indexOf(a))-(order.indexOf(b)<0 ? 99 : order.indexOf(b)));
  let selected=names.includes('Character') ? 'Character' : names[0];
  const live=raidElement('span',null,'activity-result-status');live.setAttribute('role','status');
  function draw() {
    for(const button of categories.children)button.setAttribute('aria-pressed',String(button.dataset.category===selected));
    const query=search.value.trim().toLowerCase();
    const matching=rows.filter(row=>categoryOf(row)===selected && (!query || [row.name,row.group,row.description].filter(Boolean).join(' ').toLowerCase().includes(query)));
    const groups=new Map();
    for(const row of matching) {if(!groups.has(row.group))groups.set(row.group,[]);groups.get(row.group).push(row);}
    results.replaceChildren();
    for(const [name,values] of groups) {
      const section=raidElement('section',null,'activity-stat-group');
      if(name.includes(' / '))section.append(raidElement('h4',name.split(' / ').at(-1)));
      const list=raidElement('dl');
      for(const row of values) {const entry=raidElement('div');entry.append(raidElement('dt',row.name),raidElement('dd',row.description || number(row.value)));list.append(entry);}
      section.append(list);results.append(section);
    }
    live.textContent=matching.length+' statistics';
    if(!matching.length)results.append(raidElement('p','No matching statistics.','activity-empty'));
  }
  for(const name of names) {
    const button=raidElement('button');button.type='button';button.dataset.category=name;
    button.append(raidElement('span',name),raidElement('span',String(rows.filter(row=>categoryOf(row)===name).length),'activity-category-count'));
    button.addEventListener('click',()=>{selected=name;draw();});categories.append(button);
  }
  search.addEventListener('input',draw);
  controls.append(categories,search);all.append(controls,results,live);body.append(all);root.append(body);draw();
  return root;
}

export function renderCharacterReputations(data) {
 const root=raidElement('div',null,'character-reputations');
 if(!Array.isArray(data) || !data.length) {root.append(raidElement('p',data ? 'No faction reputations reported.' : 'Reputation data is unavailable.','character-data-note'));return root;}
 for(const item of data) {
  const row=raidElement('div',null,'character-reputation-row');
  row.dataset.tier=String(item.tier);
  const heading=raidElement('div',null,'character-reputation-heading');
  heading.append(raidElement('strong',item.name),raidElement('span',item.standing));
  row.append(heading);
  if(item.max>0 && item.value!=null) {
   const bar=raidElement('progress');bar.max=item.max;bar.value=Math.min(item.max,Math.max(0,item.value));bar.setAttribute('aria-label',item.name+': '+item.standing+', '+item.value+' of '+item.max);
   row.append(bar,raidElement('small',item.value.toLocaleString()+' / '+item.max.toLocaleString()));
  }
  root.append(row);
 }
 return root;
}

export function characterSectionIcon(name) {
 const icons = {Gear:['shield','primary'],Talents:['wand','purple'],Professions:['flask','purple'],Reputation:['users','primary'],Achievements:['trophy','warning'],Activity:['script','warning'],'Raid Review':['shield-check','danger'],Stats:['chart-line','success']};
 const [symbol,color] = icons[name] ?? icons.Gear;
 const icon = tablerIcon(symbol,'character-section-icon');icon.style.color='var(--theme-'+color+')';return icon;
}
