export function adventureRules() {
  const classes = {
    Warrior: { health: 38, power: 6, skill: 'Heroic Strike', utility: 'Shield Block', spell: 13, resource: 'Rage' },
    Mage: { health: 30, power: 7, skill: 'Fireball', utility: 'Frost Nova', spell: 17, resource: 'Mana' },
    Paladin: { health: 35, power: 6, skill: 'Judgement', utility: 'Holy Light', spell: 14, resource: 'Holy Power' },
  };
  const zones = [
    { name: 'Elwynn Forest', quest: 'Clear the Forest', enemy: 'Forest Wolf', health: 17, damage: 4, level: 1, reward: 'Militia Blade' },
    { name: 'Westfall', quest: 'Defias Trouble', enemy: 'Defias Highwayman', health: 29, damage: 6, level: 2, reward: 'Westfall Steel' },
    { name: 'The Deadmines', quest: 'The Defias Kingpin', enemy: 'Edwin VanCleef', health: 58, damage: 9, level: 3, reward: 'Cruel Barb', boss: true },
  ];
  const weapons = { 'Training Weapon': 0, 'Militia Blade': 2, 'Westfall Steel': 4, 'Cruel Barb': 7 };
  const maxHealth = hero => classes[hero.className].health + (hero.level - 1) * 7 + (hero.talent === 'Fortitude' ? 10 : 0);
  const create = className => ({
    className, level: 1, xp: 0, gold: 0, potions: 2, health: classes[className].health,
    energy: 3, talent: null, weapon: 'Training Weapon', bag: ['Training Weapon'], kills: [0, 0, 0],
    claimed: [false, false, false], zone: 0, enemy: null, log: [],
  });
  function act(hero, action, option) {
    const spec = classes[hero.className];
    const zone = zones[hero.zone];
    const report = message => { hero.log.unshift(message); hero.log.length = Math.min(6, hero.log.length); };
    if (action === 'rest') {
      if (hero.enemy) return;
      hero.health = maxHealth(hero); hero.energy = 3;
      report('You rested at the inn.');
      return;
    }
    if (action === 'travel') {
      if (!hero.enemy && zones[option] && hero.level >= zones[option].level) hero.zone = option;
      return;
    }
    if (action === 'talent') {
      if (!hero.enemy && hero.level >= 2 && !hero.talent && ['Might', 'Fortitude'].includes(option)) {
        hero.talent = option;
        if (option === 'Fortitude') hero.health += 10;
        report('Learned ' + option + '.');
      }
      return;
    }
    if (action === 'equip') {
      if (!hero.enemy && Object.hasOwn(weapons, option) && hero.bag.includes(option)) hero.weapon = option;
      return;
    }
    if (action === 'buy') {
      if (!hero.enemy && hero.gold >= 5) { hero.gold -= 5; hero.potions++; report('Bought a healing potion.'); }
      return;
    }
    if (action === 'claim') {
      if (hero.enemy || hero.claimed[hero.zone] || hero.kills[hero.zone] < (zone.boss ? 1 : 3)) return;
      hero.claimed[hero.zone] = true;
      hero.bag.push(zone.reward); hero.gold += 10;
      report('Quest complete. You earned ' + zone.reward + ' and 10 gold.');
      return;
    }
    if (action === 'hunt') {
      if (hero.enemy || hero.health <= 0 || (zone.boss && hero.kills[hero.zone])) return;
      hero.enemy = { health: zone.health, turn: 0 };
      hero.energy = 3;
      report(zone.enemy + ' approaches.');
      return;
    }
    if (!hero.enemy) return;
    if (action === 'flee') {
      hero.enemy = null;
      report('You retreated to camp.');
      return;
    }
    const bonus = weapons[hero.weapon] + (hero.level - 1) * 2 + (hero.talent === 'Might' ? 3 : 0);
    if (action === 'attack') {
      hero.enemy.health -= spec.power + bonus;
      hero.energy = Math.min(3, hero.energy + 1);
      report('You hit for ' + (spec.power + bonus) + ' damage.');
    } else if (action === 'skill' && hero.energy > 0) {
      hero.energy--;
      hero.enemy.health -= spec.spell + bonus;
      report(spec.skill + ' hits for ' + (spec.spell + bonus) + ' damage.');
    } else if (action === 'utility' && hero.energy > 0 && (hero.className !== 'Paladin' || hero.health < maxHealth(hero))) {
      hero.energy--;
      if (hero.className === 'Mage') {
        hero.enemy.health -= 4 + bonus;
        hero.enemy.frozen = true;
      } else if (hero.className === 'Paladin') {
        hero.health = Math.min(maxHealth(hero), hero.health + 14);
      }
      report('You use ' + spec.utility + '.');
    } else if (action === 'potion' && hero.potions > 0 && hero.health < maxHealth(hero)) {
      hero.potions--;
      hero.health = Math.min(maxHealth(hero), hero.health + 18);
      report('You drink a healing potion.');
    } else if (action !== 'guard') return;

    if (hero.enemy.health <= 0) {
      hero.enemy = null;
      hero.kills[hero.zone]++;
      const xp = zone.boss ? 40 : 10;
      hero.xp += xp; hero.gold += zone.boss ? 20 : 3;
      report('Defeated ' + zone.enemy + '. +' + xp + ' XP.');
      if (hero.level < 5 && hero.xp >= 30) {
        hero.xp -= 30; hero.level++; hero.health = maxHealth(hero);
        report('Reached level ' + hero.level + '. Health restored.');
      }
      return;
    }
    hero.enemy.turn++;
    const heavy = zone.boss && hero.enemy.turn % 3 === 0;
    const frozen = hero.enemy.frozen;
    hero.enemy.frozen = false;
    const shielded = action === 'utility' && hero.className === 'Warrior';
    const hit = frozen || shielded ? 0 : action === 'guard' ? 1 : zone.damage + (heavy ? 9 : 0);
    hero.health = Math.max(0, hero.health - hit);
    report((heavy ? 'VanCleef uses Cleave' : zone.enemy + ' strikes') + ' for ' + hit + ' damage.');
    if (!hero.health) {
      hero.enemy = null;
      report('You fell in battle. Rest at the inn to recover.');
    }
  }
  return { classes, zones, weapons, maxHealth, create, act };
}

export function renderGuildAdventure(root) {
  const rules = adventureRules();
  const saveKey = 'solstice.guild-adventure.v1';
  let hero;
  try {
    const saved = JSON.parse(localStorage.getItem(saveKey));
    if (saved && Object.hasOwn(rules.classes, saved.className) && rules.zones[saved.zone] && Array.isArray(saved.log)) hero = saved;
  } catch {}
  const el = (tag, text, className) => raidElement(tag, text, className);
  const shell = el('section', null, 'guild-adventure');
  const status = el('p', '', 'adventure-status');
  status.setAttribute('role', 'status');
  const content = el('div');
  root.append(shell);
  shell.append(content, status);
  function save() {
    try { localStorage.setItem(saveKey, JSON.stringify(hero)); } catch {}
  }
  function button(text, callback, disabled = false) {
    const control = el('button', text);
    control.type = 'button';
    control.disabled = disabled;
    control.addEventListener('click', callback);
    return control;
  }
  function command(text, action, option, disabled) {
    const control = button(text, () => {
      rules.act(hero, action, option);
      save();
      draw();
      const next = [...content.querySelectorAll('button')].find(node => node.dataset.action === action && !node.disabled);
      (next ?? content.querySelector('h3'))?.focus();
    }, disabled);
    control.dataset.action = action;
    return control;
  }
  function meter(text, value, max, type) {
    const box = el('div', null, 'adventure-meter ' + type);
    box.append(el('span', text + ' · ' + value + '/' + max));
    const bar = el('progress');
    bar.setAttribute('aria-label', text);
    bar.max = max; bar.value = value;
    box.append(bar);
    return box;
  }
  function draw() {
    content.replaceChildren();
    if (!hero) {
      content.append(el('h3', 'Choose your class'));
      const choices = el('div', null, 'adventure-actions');
      for (const name of Object.keys(rules.classes)) {
        choices.append(button(name, () => {
          hero = rules.create(name);
          save(); draw();
          content.querySelector('h3').focus();
        }));
      }
      content.append(choices);
      status.textContent = '';
      return;
    }
    const zone = rules.zones[hero.zone];
    const spec = rules.classes[hero.className];
    const heading = el('h3', zone.name);
    heading.tabIndex = -1;
    content.append(heading, el('p', 'Level ' + hero.level + ' ' + hero.className + ' · ' + hero.gold + ' gold · ' + hero.potions + ' potions'));
    const meters = el('div', null, 'adventure-meters');
    meters.append(meter('Health', hero.health, rules.maxHealth(hero), 'health'),
      meter('XP', hero.level === 5 ? 30 : hero.xp, 30, 'xp'));
    content.append(meters);
    const scene = el('section', null, 'adventure-scene');
    if (hero.enemy) {
      scene.append(el('h4', zone.enemy), meter('Enemy health', hero.enemy.health, zone.health, 'enemy'),
        el('p', spec.resource + ' · ' + hero.energy + '/3'));
      if (zone.boss && (hero.enemy.turn + 1) % 3 === 0) scene.append(el('p', 'VanCleef is preparing Cleave. Guard to reduce the damage.', 'adventure-warning'));
    } else {
      const goal = zone.boss ? 1 : 3;
      scene.append(el('h4', zone.quest), el('p', hero.claimed[hero.zone] ? 'Quest complete · ' + zone.reward :
        'Defeat ' + zone.enemy + ' · ' + Math.min(hero.kills[hero.zone], goal) + '/' + goal));
    }
    const actions = el('div', null, 'adventure-actions');
    if (hero.enemy) {
      actions.append(command('Attack', 'attack'), command(spec.skill, 'skill', null, hero.energy === 0),
        command(spec.utility, 'utility', null, hero.energy === 0 || (hero.className === 'Paladin' && hero.health === rules.maxHealth(hero))),
        command('Guard', 'guard'), command('Healing Potion', 'potion', null, !hero.potions || hero.health === rules.maxHealth(hero)),
        command('Retreat', 'flee'));
    } else {
      const ready = hero.kills[hero.zone] >= (zone.boss ? 1 : 3) && !hero.claimed[hero.zone];
      actions.append(command(zone.boss ? 'Challenge VanCleef' : 'Find a fight', 'hunt', null, !hero.health || (zone.boss && Boolean(hero.kills[hero.zone]))),
        command('Rest at the inn', 'rest', null, hero.health === rules.maxHealth(hero)),
        command('Buy potion · 5 gold', 'buy', null, hero.gold < 5));
      if (ready) actions.append(command('Claim quest reward', 'claim'));
    }
    scene.append(actions);
    content.append(scene);
    if (!hero.enemy) {
      const travel = el('section', null, 'adventure-scene');
      travel.append(el('h4', 'Travel'));
      const places = el('div', null, 'adventure-actions');
      rules.zones.forEach((place, i) => places.append(command(place.name + (hero.level < place.level ? ' · Lv ' + place.level : ''),
        'travel', i, hero.zone === i || hero.level < place.level)));
      travel.append(places, el('h4', 'Equipment'));
      const bag = el('div', null, 'adventure-actions');
      for (const weapon of hero.bag) {
        const equipped = hero.weapon === weapon;
        bag.append(command(weapon + (equipped ? ' · Equipped' : ' · +' + rules.weapons[weapon] + ' damage'),
          'equip', weapon, equipped));
      }
      travel.append(bag);
      if (hero.level >= 2) {
        travel.append(el('h4', 'Talent'));
        const talents = el('div', null, 'adventure-actions');
        if (hero.talent) talents.append(el('p', hero.talent));
        else talents.append(command('Might · +3 damage', 'talent', 'Might'), command('Fortitude · +10 health', 'talent', 'Fortitude'));
        travel.append(talents);
      }
      content.append(travel);
    }
    if (hero.log.length) {
      const log = el('details', null, 'adventure-log');
      log.append(el('summary', 'Adventure log'));
      const messages = el('ol');
      for (const message of hero.log) messages.append(el('li', message));
      log.append(messages); content.append(log);
    }
    status.textContent = hero.log[0] ?? '';
  }
  draw();
}
