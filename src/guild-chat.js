const cache = new Map();
const viewHistory = (1n << 10n) | (1n << 16n);

function getCached(key, load) {
  const existing = cache.get(key);
  if (existing?.expires > Date.now()) return existing.result;
  if (cache.size >= 512) cache.delete(cache.keys().next().value);
  const entry = { expires: Date.now() + 12000 };
  entry.result = load().catch(error => {
    if (cache.get(key) === entry) cache.delete(key);
    throw error;
  });
  cache.set(key, entry);
  return entry.result;
}

export function canReadGuildChat(guild, channel, member, userId) {
  if (guild.owner_id === userId) return true;
  const roles = new Set(member.roles);
  let permissions = 0n;
  for (const role of guild.roles) {
    if (role.id === guild.id || roles.has(role.id)) permissions |= BigInt(role.permissions);
  }
  if (permissions & (1n << 3n)) return true;
  if (!Array.isArray(channel.permission_overwrites)) return false;
  const overwrites = channel.permission_overwrites;
  const everyone = overwrites.find(entry => entry.type === 0 && entry.id === guild.id);
  if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
  let allow = 0n;
  let deny = 0n;
  for (const entry of overwrites) {
    if (entry.type !== 0 || !roles.has(entry.id)) continue;
    allow |= BigInt(entry.allow);
    deny |= BigInt(entry.deny);
  }
  permissions = (permissions & ~deny) | allow;
  const personal = overwrites.find(entry => entry.type === 1 && entry.id === userId);
  if (personal) permissions = (permissions & ~BigInt(personal.deny)) | BigInt(personal.allow);
  return (permissions & viewHistory) === viewHistory;
}

export async function guildChatApi(request, env, userId) {
  const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (request.method !== 'GET') return reply({ error: 'Guild Chat is read-only.' }, 405);
  const { GUILD_CHAT_BOT_TOKEN: token, GUILD_CHAT_CHANNEL_ID: channelId, DISCORD_GUILD_ID: guildId } = env;
  if (!token || ![channelId, guildId, userId].every(id => /^\d{17,20}$/.test(id ?? ''))) {
    return reply({ error: 'Guild chat is not connected yet.' }, 503);
  }
  const scope = guildId + ':' + channelId;
  const get = path => getCached(scope + path, async () => {
    const response = await fetch('https://discord.com/api/v10' + path, {
      headers: { Authorization: 'Bot ' + token }, redirect: 'error', signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw Object.assign(new Error('Discord request failed'), { status: response.status });
    return response.json();
  });
  try {
    const [guild, channel, member] = await Promise.all([
      get('/guilds/' + guildId), get('/channels/' + channelId), get('/guilds/' + guildId + '/members/' + userId),
    ]);
    if (channel.guild_id !== guildId || channel.type !== 0 || !canReadGuildChat(guild, channel, member, userId)) {
      return reply({ error: 'You need access to the linked Discord channel to view guild chat.' }, 403);
    }
    const messages = await get('/channels/' + channelId + '/messages?limit=75');
    return reply({ messages: messages.filter(message => message.application_id === '1384671873593512078' &&
      (message.flags & (1 << 16)) && typeof message.content === 'string' && message.content.trim())
      .map(message => ({
        id: message.id,
        author: message.member?.nick || message.author?.global_name || message.author?.username || 'Guild member',
        content: message.content.slice(0, 2000),
        timestamp: message.timestamp,
      })).reverse() });
  } catch (error) {
    if (error.status === 404) return reply({ error: 'The linked Discord channel or membership is unavailable.' }, 403);
    return reply({ error: 'Guild chat is temporarily unavailable.' }, 502);
  }
}
