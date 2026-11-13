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

export function createGroupPlanner(root) {
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
  function row(player) {
    const node = make('div', null, 'group-plan-player');
    const identity = make('div');
    identity.append(make('strong', player.name), make('small', player.className+' · '+player.role));
    const select = make('select');
    select.setAttribute('aria-label', 'Group for '+player.name);
    select.add(new Option('Unassigned', ''));
    for (const group of groups()) {
      const option = new Option('Group '+group, group);
      option.disabled = group !== player.group && players.filter(entry => entry.group === group).length >= capacity(group);
      select.add(option);
    }
    select.value = player.group ?? '';
    select.addEventListener('change', () => { player.group = Number(select.value) || null; draw(); });
    const remove = button('×', () => { players = players.filter(entry => entry !== player); draw(); });
    remove.setAttribute('aria-label', 'Remove '+player.name);
    node.append(identity, select, remove);
    return node;
  }
  function draw() {
    const heading = make('header', null, 'group-plan-heading');
    const title = make('div');
    title.append(make('h3', 'Group Planner'), make('p', 'Forever · '+size+' players'));
    const optimizeButton = button('Auto-Optimize', optimize);
    const clear = button('Clear All', () => {
      if (window.confirm('Clear all planned characters?')) { players = []; draw(); }
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
      card.append(...assigned.map(row));
      for (let slot = assigned.length; slot < capacity(group); slot++) card.append(make('div', 'Empty', 'group-plan-empty'));
      grid.append(card);
    }
    raidGroups.append(grid);

    const pending = players.filter(player => player.group === null);
    const unassigned = panel('Unassigned ('+pending.length+')');
    if (pending.length) unassigned.append(...pending.map(row));
    else unassigned.append(make('p', players.length ? 'All planned characters have a group.' : 'Add characters to start planning.'));

    const add = panel('Add Characters');
    const classes = make('div', null, 'group-plan-classes');
    for (const name of raidClasses) {
      const choice = button(name, () => { className = name; draw(); root.querySelector('.group-plan-name')?.focus(); });
      choice.setAttribute('aria-pressed', String(name === className));
      classes.append(choice);
    }
    add.append(classes);
    if (players.length >= size) add.append(make('p', 'The plan is full.'));
    else if (className) {
      const name = make('input', null, 'group-plan-name');
      name.placeholder = 'Character name';
      name.setAttribute('aria-label', 'Character name');
      name.maxLength = 61;
      const role = make('select');
      role.setAttribute('aria-label', 'Planned role');
      for (const value of raidRoles) role.add(new Option(value, value));
      const defaults = { Warrior:'Tank', Paladin:'Healer', Priest:'Healer', Rogue:'Melee DPS' };
      role.value = defaults[className] ?? 'Ranged DPS';
      const message = make('p');
      message.setAttribute('role', 'status');
      const addPlayer = () => {
        const value = name.value.trim();
        if (!value || players.some(player => player.name.toLowerCase() === value.toLowerCase())) {
          message.textContent = value ? 'That character is already in the plan.' : 'Enter a character name.';
          name.focus();
          return;
        }
        players.push({ name: value, className, role: role.value, group: null });
        draw();
        root.querySelector('.group-plan-name')?.focus();
      };
      name.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); addPlayer(); }
      });
      add.append(name, role, button('Add '+className, addPlayer), message);
    } else add.append(make('p', 'Select a class to add a character.'));

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
    root.replaceChildren(heading,main);
  }
  return {
    draw,
    players: () => players,
    resize(nextSize) {
      size = nextSize;
      for (const player of players) if (player.group > Math.ceil(size / 5)) player.group = null;
    },
    reset() {
      players = [];
      className = '';
      size = 10;
    },
  };
}
