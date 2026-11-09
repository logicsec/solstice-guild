const sessionCookie = '__Host-solstice-session';
const flowCookie = '__Host-solstice-oauth';
const sessionSeconds = 8 * 60 * 60;
const encoder = new TextEncoder();

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
}

async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), n => n.toString(16).padStart(2, '0')).join('');
}

function cookie(request, name) {
  return request.headers.get('Cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(name + '='))?.slice(name.length + 1);
}

function setCookie(name, value, seconds) {
  return name + '=' + value + '; Path=/; Max-Age=' + seconds + '; Secure; HttpOnly; SameSite=Lax';
}

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

function safeReturn(value, origin) {
  if (!value || value.length > 512 || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname !== '/') return '/';
    return url.pathname + url.search;
  } catch { return '/'; }
}

function errorPage(message, status) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export function authReady(env) {
  return Boolean(env?.DB && env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && /^\d+$/.test(env.DISCORD_GUILD_ID ?? ''));
}

export async function sessionFor(request, env) {
  const token = cookie(request, sessionCookie);
  if (!/^[a-f0-9]{64}$/.test(token ?? '')) return null;
  return env.DB.prepare('SELECT discord_id, display_name FROM discord_sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await hash(token), Date.now()).first();
}

export async function discordAuth(request, env, url) {
  const callback = url.origin + '/auth/discord/callback';
  if (url.pathname === '/auth/logout') {
    if (request.method !== 'POST') return errorPage('Method not allowed.', 405);
    if (request.headers.get('Origin') !== url.origin) return errorPage('Invalid origin.', 403);
    const token = cookie(request, sessionCookie);
    if (/^[a-f0-9]{64}$/.test(token ?? '')) {
      await env.DB.prepare('DELETE FROM discord_sessions WHERE token_hash = ?').bind(await hash(token)).run();
    }
    return redirect('/', [setCookie(sessionCookie, '', 0)]);
  }
  if (request.method !== 'GET') return errorPage('Method not allowed.', 405);
  if (url.pathname === '/auth/discord') {
    const state = randomToken();
    const next = safeReturn(url.searchParams.get('next'), url.origin);
    const authorize = new URL('https://discord.com/oauth2/authorize');
    authorize.search = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID, redirect_uri: callback, response_type: 'code',
      scope: 'identify guilds.members.read', state,
    });
    return redirect(authorize.href, [setCookie(flowCookie, state + '.' + encodeURIComponent(next), 600)]);
  }
  if (url.pathname !== '/auth/discord/callback') return errorPage('Not found.', 404);
  const flow = cookie(request, flowCookie);
  const delimiter = flow?.indexOf('.') ?? -1;
  const code = url.searchParams.get('code');
  if (!code || delimiter !== 64 || flow.slice(0, delimiter) !== url.searchParams.get('state')) {
    return redirect('/?login=expired', [setCookie(flowCookie, '', 0)]);
  }
  const next = safeReturn(decodeURIComponent(flow.slice(delimiter + 1)), url.origin);
  const clearFlow = setCookie(flowCookie, '', 0);
  const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callback,
      client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET }),
  });
  if (!tokenResponse.ok) return redirect('/?login=expired', [clearFlow]);
  const { access_token: accessToken } = await tokenResponse.json();
  if (!accessToken) return redirect('/?login=expired', [clearFlow]);
  const response = await fetch('https://discord.com/api/v10/users/@me/guilds/' + env.DISCORD_GUILD_ID + '/member', {
    headers: { Authorization: 'Bearer ' + accessToken }, signal: AbortSignal.timeout(10000),
  });
  if (response.status === 403 || response.status === 404) return redirect('/?login=membership', [clearFlow]);
  if (!response.ok) return redirect('/?login=unavailable', [clearFlow]);
  const member = await response.json();
  if (!/^\d+$/.test(member.user?.id ?? '')) return redirect('/?login=unavailable', [clearFlow]);
  const session = randomToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM discord_sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('INSERT INTO discord_sessions (token_hash, discord_id, display_name, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await hash(session), member.user.id, member.nick || member.user.global_name || member.user.username || 'Guild member', now + sessionSeconds * 1000),
  ]);
  return redirect(next, [clearFlow, setCookie(sessionCookie, session, sessionSeconds)]);
}
