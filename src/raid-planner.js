export function normalizeGroupPlan(plan, size, classes, roles) {
  if (!Array.isArray(plan) || plan.length > size) return null;
  const names = new Set();
  const groups = new Map();
  const result = [];
  for (const player of plan) {
    const name = typeof player?.name === 'string' ? player.name.trim() : '';
    const key = name.toLowerCase();
    const group = player?.group;
    if (!name || name.length > 61 || names.has(key) || !classes.includes(player.className) || !roles.includes(player.role) ||
      (group !== null && (!Number.isInteger(group) || group < 1 || group > Math.ceil(size / 5)))) return null;
    names.add(key);
    if (group !== null) {
      const count = (groups.get(group) ?? 0) + 1;
      if (count > Math.min(5, size - (group - 1) * 5)) return null;
      groups.set(group, count);
    }
    result.push({ name, className: player.className, role: player.role, group });
  }
  return result;
}

export function createGroupPlanner(root, initialRoster = []) {
  const buffs = [
    ['Stats','Blessing of Kings','Paladin','Raid','spell_magic_magearmor'],
    ['Stamina','Power Word: Fortitude','Priest','Raid','spell_holy_wordfortitude'],
    ['Stats','Mark of the Wild','Druid','Raid','spell_nature_regeneration'],
    ['Intellect','Arcane Intellect','Mage','Raid','spell_holy_magicalsentry'],
    ['Attack Power','Blessing of Might','Paladin','Raid','spell_holy_fistofjustice'],
    ['Mana Regen','Blessing of Wisdom','Paladin','Raid','spell_holy_sealofwisdom'],
    ['Threat','Blessing of Salvation','Paladin','Raid','spell_holy_sealofsalvation'],
    ['Utility','Paladin Aura','Paladin','Group','spell_holy_devotionaura'],
  ];
  let players = [];
  let className = '';
  let size = 10;
  let roster = initialRoster;
  let selected = null;
  const make = raidElement;
  function button(label, run) {
    const node = make('button', label);
    node.type = 'button';
    node.addEventListener('click', run);
    return node;
  }
  function panel(title, tag = 'section') {
    const node = make(tag, null, 'group-plan-panel');
    node.append(make('h4', title));
    return node;
  }
  function addFromRoster(className, group = null) {
    if (players.length >= size) return;
    const available = roster.filter(entry => entry.class_name === className && !players.some(player => player.name.toLowerCase() === entry.name.toLowerCase()));
    const dialog = document.createElement('dialog');
    dialog.className = 'group-plan-dialog';
    const heading = make('h3', 'Add '+className);
    const select = make('select');
    select.add(new Option('Choose a saved character', ''));
    for (const entry of available) select.add(new Option(entry.name+' · '+entry.role, entry.name));
    const manual = make('input');
    manual.placeholder = 'Or enter a character name';
    manual.maxLength = 61;
    const role = make('select');
    for (const value of raidRoles) role.add(new Option(value, value));
    role.value = { Warrior:'Tank', Paladin:'Healer', Priest:'Healer', Rogue:'Melee DPS' }[className] ?? 'Ranged DPS';
    const error = make('p');
    const confirm = button('Add character', () => {
      const saved = available.find(entry => entry.name === select.value);
      const name = saved?.name || manual.value.trim();
      if (!name || players.some(player => player.name.toLowerCase() === name.toLowerCase())) {
        error.textContent = name ? 'That character is already in the plan.' : 'Choose a saved character or enter a name.';
        return;
      }
      players.push({ name, className, role: saved?.role || role.value, group });
      dialog.close(); dialog.remove(); draw();
    });
    const cancel = button('Cancel', () => { dialog.close(); dialog.remove(); });
    dialog.append(heading, select, manual, role, confirm, cancel, error);
    root.append(dialog);
    dialog.showModal();
  }
  function groups() {
    return Array.from({length: Math.ceil(size / 5)}, (_, index) => index + 1);
  }
  function capacity(group) {
    return Math.min(5, size - (group - 1) * 5);
  }
  function optimize() {
    const buckets = groups().map(group => ({ group, players: [] }));
    for (const role of raidRoles) {
      for (const player of players.filter(entry => entry.role === role)) {
        const available = buckets.filter(bucket => bucket.players.length < capacity(bucket.group));
        available.sort((a, b) =>
          a.players.filter(entry => entry.role === role).length - b.players.filter(entry => entry.role === role).length ||
          a.players.filter(entry => entry.className === player.className).length - b.players.filter(entry => entry.className === player.className).length ||
          a.players.length - b.players.length);
        const bucket = available[0];
        player.group = bucket?.group ?? null;
        bucket?.players.push(player);
      }
    }
    draw();
  }
  function move(player, group) {
    if (group !== null && player.group !== group && players.filter(p => p.group === group).length >= capacity(group)) return;
    player.group = group;
    selected = null;
    draw();
  }
  function destination(card, group) {
    card.tabIndex = 0;
    card.setAttribute('aria-label', group === null ? 'Move selected character to Unassigned' : 'Move selected character to Group '+group);
    const activate = () => { if (selected) move(selected, group); };
    card.addEventListener('click', activate);
    card.addEventListener('keydown', event => {
      if (event.target === card && ['Enter',' '].includes(event.key)) { event.preventDefault(); activate(); }
    });
    card.addEventListener('dragover', event => { event.preventDefault(); card.classList.add('group-plan-drop-target'); });
    card.addEventListener('dragleave', () => card.classList.remove('group-plan-drop-target'));
    card.addEventListener('drop', event => {
      event.preventDefault(); card.classList.remove('group-plan-drop-target');
      const name = event.dataTransfer.getData('application/x-solstice-player');
      const player = players.find(p => p.name === name);
      if (player) return move(player, group);
      const droppedClass = event.dataTransfer.getData('text/plain');
      if (raidClasses.includes(droppedClass) && (group === null || players.filter(p => p.group === group).length < capacity(group))) addFromRoster(droppedClass, group);
    });
  }
  function row(player) {
    const node = make('div', null, 'group-plan-player');
    const saved = roster.find(entry => entry.name.toLowerCase() === player.name.toLowerCase());
    const identity = button('', event => {
      event.stopPropagation();
      const focusIndex = [...root.querySelectorAll('.group-plan-identity')].indexOf(identity);
      selected = selected === player ? null : player;
      draw();
      root.querySelectorAll('.group-plan-identity')[focusIndex]?.focus();
    });
    identity.className = 'group-plan-identity';
    identity.setAttribute('aria-pressed', String(selected === player));
    identity.setAttribute('aria-label', 'Select '+player.name+' to move to another group');
    if (saved?.level) identity.append(make('span', String(saved.level), 'group-plan-level'));
    const icons = characterIcons(player.className, saved?.spec);
    const watermark = icons.children[1]?.cloneNode();
    const info = make('span', null, 'group-plan-name');
    info.append(make('strong', player.name), make('small', player.role));
    identity.append(icons, info);
    if (watermark) { watermark.className = 'group-plan-watermark'; watermark.alt = ''; identity.append(watermark); }
    const remove = button('×', event => {
      event.stopPropagation(); players = players.filter(entry => entry !== player);
      if (selected === player) selected = null;
      draw();
    });
    remove.className = 'group-plan-remove';
    remove.setAttribute('aria-label', 'Remove '+player.name);
    node.draggable = true;
    node.addEventListener('dragstart', event => {
      event.dataTransfer.setData('application/x-solstice-player', player.name);
      event.dataTransfer.effectAllowed = 'move';
    });
    node.classList.toggle('is-selected', selected === player);
    node.append(identity, remove);
    return node;
  }
  function draw() {
    const heading = make('header', null, 'group-plan-heading');
    const title = make('div');
    title.append(make('h3', 'Group Planner'), make('p', 'Forever · '+size+' players'));
    const optimizeButton = button('Auto-Optimize', optimize);
    const clear = button('Clear All', () => {
      if (window.confirm('Clear all planned characters?')) { players = []; selected = null; draw(); }
    });
    optimizeButton.disabled = clear.disabled = !players.length;
    heading.append(title, optimizeButton, clear);

    const main = make('div', null, 'group-plan-layout');
    const board = make('div', null, 'group-plan-stack');
    const sidebar = make('div', null, 'group-plan-stack');
    const raidGroups = panel('Raid Groups');
    const grid = make('div', null, 'group-plan-grid');
    for (const group of groups()) {
      const assigned = players.filter(player => player.group === group);
      const card = panel('Group '+group+' · '+assigned.length+'/'+capacity(group));
      card.dataset.group = group;
      destination(card, group);
      card.append(...assigned.map(row));
      for (let slot = assigned.length; slot < capacity(group); slot++) card.append(make('div', 'Empty', 'group-plan-empty'));
      grid.append(card);
    }
    raidGroups.append(grid);

    const pending = players.filter(player => player.group === null);
    const unassigned = panel('Unassigned ('+pending.length+')');
    destination(unassigned, null);
    if (pending.length) unassigned.append(...pending.map(row));
    else unassigned.append(make('p', players.length ? 'All planned characters have a group.' : 'Add characters to start planning.'));

    const add = panel('Add Characters');
    const classes = make('div', null, 'group-plan-classes');
    for (const name of raidClasses) {
      const choice = button(name, () => addFromRoster(name));
      choice.draggable = true;
      choice.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', name));
      choice.setAttribute('aria-pressed', String(name === className));
      classes.append(choice);
    }
    add.append(classes);
    add.append(make('p', roster.length ? 'Drag a class onto a group, or click a class to choose a character.' : 'No saved characters found. Click a class to enter a name manually.'));

    const composition = panel('Composition');
    const counts = make('dl', null, 'group-plan-counts');
    for (const [index, role] of raidRoles.entries()) {
      counts.append(make('dt', role), make('dd', players.filter(player => player.role === role).length+'/'+roleSlotFields[index].value));
    }
    counts.append(make('dt', 'Total'), make('dd', players.length+'/'+size));
    composition.append(counts);

    const issues = panel('Issues & Recommendations');
    const covered = buff => players.some(player => player.className === buff[2]);
    for (const buff of buffs.slice(0,4).filter(buff => !covered(buff))) {
      issues.append(make('p', 'Missing '+buff[1]+' coverage. Add a '+buff[2]+'.', 'group-plan-warning'));
    }
    if (pending.length) issues.append(make('p', 'Assign '+pending.length+' remaining characters to groups.', 'group-plan-warning'));
    if (issues.childElementCount === 1) issues.append(make('p', 'Core class coverage is present.'));
    const analysis = make('div', null, 'group-plan-analysis');
    const categories = panel('Buff Categories');
    const list = panel('Raid & Group Buffs');
    list.append(make('p', 'Coverage is estimated from planned classes. Confirm spells and talents in game.'));
    for (const category of new Set(buffs.map(buff => buff[0]))) {
      const entries = buffs.filter(buff => buff[0] === category);
      const details = make('details');
      details.append(make('summary', category+' · '+entries.filter(covered).length+'/'+entries.length));
      for (const buff of entries) details.append(make('p', buff[1]+' · '+buff[2]));
      categories.append(details);
    }
    for (const buff of buffs) {
      const [ , spell, provider, scope, icon] = buff;
      const entry = make('div', null, 'group-plan-buff');
      const image = make('img');
      image.src = 'https://wow.zamimg.com/images/wow/icons/medium/'+icon+'.jpg';
      image.alt = '';
      const state = scope === 'Group' ? groups().filter(group => players.some(player => player.group === group && player.className === provider)).length+'/'+groups().length+' groups' :
        covered(buff) ? 'Covered' : 'Missing';
      entry.append(image, make('span', spell), make('small', scope+' · '+state));
      list.append(entry);
    }
    analysis.append(categories,list);
    board.append(raidGroups,unassigned,issues,analysis);
    sidebar.append(add,composition);
    main.append(board,sidebar);
    const hint = make('p', selected ? 'Select a destination group for '+selected.name+'. Tap the character again to cancel.' : 'Drag characters between groups, or tap a character then its destination.', 'group-plan-move-hint');
    hint.setAttribute('role', 'status');
    root.replaceChildren(heading,hint,main);
  }
  return {
    draw,
    players: () => players,
    resize(nextSize) {
      size = nextSize;
      for (const player of players) if (player.group > Math.ceil(size / 5)) player.group = null;
    },
    setRoster(nextRoster) { roster = Array.isArray(nextRoster) ? nextRoster : []; draw(); },
    reset() {
      players = [];
      selected = null;
      className = '';
      size = 10;
    },
  };
}
