import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import worker from './index.js';
import { authReady } from './auth.js';
import { openSqlite } from './sqlite.js';

const { PUBLIC_ORIGIN, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID } = process.env;
const origin = new URL(PUBLIC_ORIGIN ?? 'https://solsticeguild.net');
if (origin.protocol !== 'https:' || origin.href !== origin.origin + '/' || origin.username || origin.password) {
  throw new Error('PUBLIC_ORIGIN must be an HTTPS origin with no path.');
}
if (!/^\d+$/.test(DISCORD_CLIENT_ID ?? '') || !authReady({ DB: true, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID })) {
  throw new Error('Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_GUILD_ID.');
}
const DB = openSqlite(process.env.SQLITE_PATH ?? '/data/solstice.sqlite');
const env = { DB, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID };
const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('ok');
    return;
  }
  try {
    // Derive OAuth and same-origin checks from trusted configuration, never a proxy header.
    const url = new URL(origin.origin + (req.url?.startsWith('/') ? req.url : '/'));
    const headers = new Headers();
    for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
    const method = req.method ?? 'GET';
    let body;
    if (method !== 'GET' && method !== 'HEAD') {
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        bytes += chunk.length;
        if (bytes > 32768) {
          res.writeHead(413, { Connection: 'close' }).end('Request too large');
          return;
        }
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks);
    }
    const response = await worker.fetch(new Request(url, { method, headers, body }), env);
    const cookies = response.headers.getSetCookie();
    for (const [name, value] of response.headers) if (name !== 'set-cookie') res.setHeader(name, value);
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.statusCode = response.status;
    if (method === 'HEAD' || !response.body) res.end();
    else await pipeline(Readable.fromWeb(response.body), res);
  } catch {
    if (!res.headersSent) res.writeHead(500).end('Solstice Guild request failed');
    else res.destroy();
  }
});
server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => DB.close()));
