const base = 'https://www.wowhead.com/forever';
const known = new Map([
  ['shadowgem', base + '/item=1210'],
  ['reverence', base + '/item=254696'],
  ['holy conduit', base + '/spell=1237268'],
]);
export function linkGuildMessages(messages) {
  const pattern = /(?:\|c[\da-f]{8})?\|H(item|spell|enchant|talent|achievement|quest):(\d{1,10})(?::[^|\r\n]*)?\|h\[([^\[\]\r\n]{1,100})\]\|h(?:\|r)?|\[[^\[\]\r\n]*\]\(<?https?:\/\/[^\s)]+>?\)|\[([^\[\]\r\n]{2,100})\]/gi;
  return messages.map(message => {
    const parts = [];
    let offset = 0;
    for (const match of message.content.matchAll(pattern)) {
      const [raw, kind, id, nativeName, label] = match;
      const name = (nativeName ?? label)?.trim();
      if (!name || !/\p{L}/u.test(name) || /[<>|]/.test(name)) continue;
      if (offset < match.index) parts.push({ text: message.content.slice(offset, match.index) });
      const link = kind && Number(id) > 0
        ? { url: base + '/' + (kind.toLowerCase() === 'enchant' ? 'spell' : kind.toLowerCase()) + '=' + id }
        : { url: known.get(name.toLowerCase()) ?? base + '/search?q=' + encodeURIComponent(name) };
      parts.push({ text: '[' + name + ']', url: link.url });
      offset = match.index + raw.length;
    }
    if (offset < message.content.length) parts.push({ text: message.content.slice(offset) });
    return { ...message, parts };
  });
}

