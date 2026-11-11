export function renderGuildChat(root, isCurrent) {
  const panel = raidElement('section', null, 'raid-card');
  const header = raidElement('div', null, 'guild-chat-header');
  const refresh = raidElement('button', 'Refresh');
  refresh.type = 'button';
  header.append(raidElement('h3', 'In-Game Guild Chat'), refresh);
  const status = raidElement('p', 'Loading chat…', 'guild-chat-status');
  status.setAttribute('role', 'status');
  const feed = raidElement('ol', null, 'guild-chat-feed');
  feed.tabIndex = 0;
  feed.setAttribute('aria-label', 'Recent guild messages');
  panel.append(header, status, feed);
  root.append(panel);
  let latest;
  let timer;
  async function load() {
    if (!isCurrent() || refresh.disabled) return;
    clearTimeout(timer);
    if (document.hidden) {
      timer = setTimeout(load, 15000);
      return;
    }
    refresh.disabled = true;
    try {
      const { messages } = await guildRequest('/api/guild-chat');
      if (!isCurrent()) return;
      const next = JSON.stringify(messages);
      if (latest !== next) {
        const follow = latest === undefined || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
        feed.replaceChildren(...messages.map(message => {
          const row = raidElement('li', null, 'guild-chat-message');
          const meta = raidElement('div', null, 'guild-chat-meta');
          const date = new Date(message.timestamp);
          const time = raidElement('time', date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
          time.dateTime = message.timestamp;
          meta.append(raidElement('strong', message.author), time);
          const content = raidElement('p');
          for (const part of message.parts ?? [{ text: message.content }]) {
            if (!part.url) {
              content.append(document.createTextNode(part.text));
              continue;
            }
            const link = raidElement('a', part.text);
            link.href = part.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            content.append(link);
          }
          row.append(meta, content);
          return row;
        }));
        if (follow) feed.scrollTop = feed.scrollHeight;
        latest = next;
      }
      status.textContent = messages.length ? 'Read-only · Refreshes every 15 seconds' : 'No recent messages from WoW guild chat.';
    } catch (error) {
      if (isCurrent()) {
        if ([401, 403].includes(error.status)) {
          feed.replaceChildren();
          latest = undefined;
        }
        status.textContent = error.message;
      }
    } finally {
      refresh.disabled = false;
      if (isCurrent()) timer = setTimeout(load, 15000);
    }
  }
  refresh.addEventListener('click', load);
  void load();
}

