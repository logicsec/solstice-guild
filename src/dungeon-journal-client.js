export function renderDungeonJournal(root, entries, questSource) {
  const library = raidElement('section', null, 'raid-card journal-library');
  const controls = raidElement('div', null, 'raid-actions');
  const query = raidElement('input');
  query.type = 'search';
  query.placeholder = 'Find a dungeon, boss, or quest';
  query.setAttribute('aria-label', 'Search the dungeon journal');
  const level = raidElement('select');
  level.setAttribute('aria-label', 'Filter by level range');
  level.append(new Option('All Levels', ''), ...[10,20,30,40,50].map(n => new Option(n + '–' + (n + 9), n)), new Option('Raids', 'raid'));
  const chooser = raidElement('select');
  chooser.setAttribute('aria-label', 'Choose an instance');
  controls.append(query, level, chooser);
  const display = raidElement('div');
  library.append(controls, display);
  root.append(library);
  const base = 'https://www.wowhead.com/forever';
  let selected = 'excavation-site-wetlands';
  let tab = 'Map';
  let faction = 'Alliance';
  function link(text, url) {
    const anchor = raidElement('a', text);
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }
  function reference(entry, message, url = entry.guide) {
    const line = raidElement('p', message + ' ');
    line.append(link('Open Wowhead Guide ↗', url));
    return line;
  }
  function choose() {
    const term = query.value.trim().toLowerCase();
    const start = Number(level.value);
    const found = entries.filter(entry => {
      if (level.value === 'raid' && !entry.raid) return false;
      if (start && (!entry.levels || entry.levels[1] < start || entry.levels[0] > start + 9)) return false;
      return [entry.name, entry.zone, ...(entry.bosses ?? []).map(boss => boss.name),
        ...entry.quests.flatMap(quest => [quest.name,...quest.prerequisites.map(step => step.name)])]
        .some(name => name?.toLowerCase().includes(term));
    });
    chooser.replaceChildren(...found.map(entry => new Option(entry.name, entry.id)));
    if (!found.length) {
      chooser.disabled = true;
      display.replaceChildren(raidElement('p', 'No matching instances.'));
      return;
    }
    chooser.disabled = false;
    if (!found.some(entry => entry.id === selected)) {
      selected = found[0].id;
      tab = found[0].raid ? 'Attunement' : 'Map';
    }
    chooser.value = selected;
    draw();
  }
  function draw() {
    const entry = entries.find(item => item.id === selected);
    display.replaceChildren();
    const header = raidElement('div', null, 'journal-header');
    header.append(raidElement('p', entry.raid ? 'Raid Attunement' : 'Dungeon Reference', 'eyebrow'), raidElement('h3', entry.name));
    const meta = [entry.levels && 'Levels ' + entry.levels.join('–'), entry.zone, entry.minimum && 'Minimum level ' + entry.minimum].filter(Boolean);
    if (meta.length) header.append(raidElement('p', meta.join(' · ')));
    display.append(header);
    const tabs = raidElement('nav', null, 'raid-actions journal-tabs');
    tabs.setAttribute('aria-label', 'Dungeon journal sections');
    for (const title of ['Map','Bosses','Quests','Attunement']) {
      const button = raidElement('button', title);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(tab === title));
      button.addEventListener('click', () => { tab = title; draw(); display.querySelector('[aria-pressed="true"]')?.focus(); });
      tabs.append(button);
    }
    display.append(tabs);
    const body = raidElement('div', null, 'journal-body');
    display.append(body);

    if (tab === 'Map') {
      if (entry.positions) {
        const map = raidElement('div', null, 'journal-map');
        map.setAttribute('aria-label', 'Approximate Wetlands encounter positions');
        for (const [name,x,y] of entry.positions) {
          const point = raidElement('span', name, 'journal-map-point');
          point.style.left = x + '%';
          point.style.top = y + '%';
          map.append(point);
        }
        body.append(map, raidElement('p', 'Encounter schematic · Approximate positions'));
      }
      if (entry.entrances?.length) body.append(raidElement('p', 'Entrance coordinates: ' + entry.entrances.join(' / ')));
      if (entry.zoneUrl) body.append(link('Open Instance Map & Details ↗', entry.zoneUrl));
      body.append(reference(entry, entry.positions || entry.entrances?.length ? 'For location details, see the source guide.' : 'Entrance details are in the source guide.'));
    }
    if (tab === 'Bosses') {
      if (entry.instanceBosses) body.append(raidElement('p', 'Encounter list for the full instance.'));
      for (const boss of entry.bosses ?? []) {
        const card = raidElement('section', null, 'raid-card');
        const title = raidElement('h4');
        title.append(link(boss.name, base + '/npc=' + boss.id));
        if (boss.level) title.append(' · Level ' + boss.level);
        card.append(title);
        if (boss.loot?.length) {
          const drops = raidElement('ul');
          for (const item of boss.loot) {
            const row = raidElement('li');
            row.append(link(item.name, base + '/item=' + item.id));
            drops.append(row);
          }
          card.append(drops);
        }
        body.append(card);
      }
      if (entry.zoneUrl) body.append(link('Open Instance Loot & NPCs ↗', entry.zoneUrl));
      body.append(reference(entry, entry.bosses?.length ? 'See the guide for encounter strategies.' : 'Open the source guide for encounter references.'));
    }
    if (tab === 'Quests') {
      const side = raidElement('select');
      side.setAttribute('aria-label', 'Quest faction');
      side.append(...['Alliance','Horde','All Factions'].map(name => new Option(name)));
      side.value = faction;
      side.addEventListener('change', () => { faction = side.value; draw(); display.querySelector('[aria-label="Quest faction"]')?.focus(); });
      body.append(side);
      const quests = entry.quests.filter(quest => !quest.faction || faction === 'All Factions' || faction === quest.faction);
      for (const quest of quests) {
        const card = raidElement('details', null, 'raid-card');
        const tags = [quest.level && 'Level ' + quest.level, quest.faction, quest.chain && 'Quest chain'].filter(Boolean);
        card.append(raidElement('summary', [quest.name,...tags].join(' · ')));
        if (quest.giver) {
          const start = raidElement('p', 'Quest giver ');
          start.append(link(quest.giver.name, base + '/npc=' + quest.giver.id));
          if (quest.coords) start.append(' · ' + quest.coords);
          card.append(start);
        } else if (quest.coords) card.append(raidElement('p', 'Coordinates ' + quest.coords));
        if (quest.prerequisites.length) {
          card.append(raidElement('p', 'Prerequisite quests'));
          const list = raidElement('ol');
          for (const step of quest.prerequisites) {
            const row = raidElement('li');
            row.append(link(step.name, base + '/quest=' + step.id));
            list.append(row);
          }
          card.append(list);
        }
        card.append(link('Open Quest & Full Chain ↗', base + '/quest=' + quest.id));
        body.append(card);
      }
      if (!quests.length) body.append(raidElement('p', 'No quest entries are documented for this selection.'));
      if (!entry.raid) body.append(reference(entry, 'See quest locations and chain notes in the source.', questSource));
    }
    if (tab === 'Attunement') {
      const attunement = entry.attunement;
      if (attunement) {
        const title = raidElement('h4');
        title.append(link(attunement.name, base + '/item=' + attunement.item));
        body.append(title, raidElement('p', attunement.note));
        if (attunement.steps?.length) {
          const list = raidElement('ol');
          for (const step of attunement.steps) {
            const row = raidElement('li');
            row.append(link(step.name, base + '/quest=' + step.id));
            list.append(row);
          }
          body.append(list);
        }
      } else body.append(raidElement('p', 'The source does not list an entry attunement for this instance.'));
      body.append(reference(entry, 'Check the source for entry details.'));
    }
  }
  query.addEventListener('input', choose);
  level.addEventListener('change', choose);
  chooser.addEventListener('change', () => { selected = chooser.value; tab = selected === 'onyxias-lair' ? 'Attunement' : 'Map'; draw(); });
  choose();
}
