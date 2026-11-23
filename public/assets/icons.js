/** Tabler Icons, MIT. Local SVG sprite and license are bundled in assets. */
export function tablerIcon(name, className = '') {
  const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
  icon.setAttribute('viewBox','0 0 24 24');
  icon.setAttribute('width','18');icon.setAttribute('height','18');
  icon.setAttribute('class','tabler-icon'+(className ? ' '+className : ''));
  icon.setAttribute('fill','none');
  icon.setAttribute('stroke','currentColor');
  icon.setAttribute('stroke-width','1.75');
  icon.setAttribute('stroke-linecap','round');
  icon.setAttribute('stroke-linejoin','round');
  icon.setAttribute('aria-hidden','true');
  const use = document.createElementNS(icon.namespaceURI,'use');
  use.setAttribute('href','/assets/tabler-icons.svg?v=theme-3#'+name);
  icon.append(use);
  return icon;
}

/** WoW class/spec artwork from forever-icons; Solstice outlines for other identities. */
export function guildIcon(kind, name, className = '', ownerClass = '') {
  const artwork = {"class":{"Druid":0,"Hunter":1,"Mage":2,"Paladin":3,"Priest":4,"Rogue":5,"Shaman":6,"Warlock":7,"Warrior":8},"spec":{"Druid:Balance":9,"Druid:Feral Combat":10,"Druid:Restoration":11,"Hunter:Beast Mastery":12,"Hunter:Marksmanship":13,"Hunter:Survival":14,"Mage:Arcane":15,"Mage:Fire":16,"Mage:Frost":17,"Paladin:Holy":18,"Paladin:Protection":19,"Paladin:Retribution":20,"Priest:Discipline":21,"Priest:Holy":22,"Priest:Shadow":23,"Rogue:Assassination":24,"Rogue:Combat":25,"Rogue:Subtlety":26,"Shaman:Elemental":27,"Shaman:Enhancement":28,"Shaman:Restoration":29,"Warlock:Affliction":30,"Warlock:Demonology":31,"Warlock:Destruction":32,"Warrior:Arms":33,"Warrior:Fury":34,"Warrior:Protection":35}};
  const key = kind === 'spec' ? ownerClass+':'+name : name;
  const index = artwork[kind]?.[key];
  if (Number.isInteger(index)) {
    const icon = document.createElement('span');
    icon.className = 'guild-symbol forever-icon'+(className ? ' '+className : '');
    icon.dataset.iconKind = kind;icon.dataset.iconName = name;
    icon.title = name;icon.setAttribute('aria-hidden','true');
    icon.style.backgroundPosition = (index % 6 * 20)+'% '+(Math.floor(index / 6) * 20)+'%';
    return icon;
  }
  const slug = String(name ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const icon = tablerIcon('solstice-'+kind+'-'+slug,'guild-symbol'+(className ? ' '+className : ''));
  icon.dataset.iconKind = kind;
  icon.dataset.iconName = name;
  const title = document.createElementNS(icon.namespaceURI,'title');title.textContent = name;
  icon.prepend(title);
  return icon;
}
