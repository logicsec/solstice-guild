/** Tabler Icons, MIT. Local SVG sprite and license are bundled in assets. */
export function tablerIcon(name, className = '') {
  const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
  icon.setAttribute('viewBox','0 0 24 24');
  icon.setAttribute('class','tabler-icon'+(className ? ' '+className : ''));
  icon.setAttribute('fill','none');
  icon.setAttribute('stroke','currentColor');
  icon.setAttribute('stroke-width','1.75');
  icon.setAttribute('stroke-linecap','round');
  icon.setAttribute('stroke-linejoin','round');
  icon.setAttribute('aria-hidden','true');
  const use = document.createElementNS(icon.namespaceURI,'use');
  use.setAttribute('href','/assets/tabler-icons.svg#'+name);
  icon.append(use);
  return icon;
}
