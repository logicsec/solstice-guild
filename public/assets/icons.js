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

/** Original Solstice class, specialization, profession and role outline symbols. */
export function guildIcon(kind, name, className = '') {
  const slug = String(name ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const icon = tablerIcon('solstice-'+kind+'-'+slug,'guild-symbol'+(className ? ' '+className : ''));
  icon.dataset.iconKind = kind;
  icon.dataset.iconName = name;
  const title = document.createElementNS(icon.namespaceURI,'title');title.textContent = name;
  icon.prepend(title);
  return icon;
}
