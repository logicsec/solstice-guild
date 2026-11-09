import { sameOriginWrite } from './auth.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const dateLabel = date => new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(date));
const loginLink = next => '/auth/discord?next=' + encodeURIComponent(next);
export const solsticeMark = '<svg class="solstice-shield" aria-hidden="true" viewBox="0 0 60 70"><path d="M30 3C23 9 13 12 5 12c-1 23 3 38 25 54 22-16 26-31 25-54-8 0-18-3-25-9Z" fill="#0c1b31" stroke="#d4a85d" stroke-width="3.5"/><g fill="#edbb65"><path d="m30 13 3 19h-6Zm-14 8 10 13-5 3Zm28 0-5 16-5-3ZM8 30l13 8-2 4Zm44 0-11 12-2-4Z"/><path d="M20 44a10 10 0 0 1 20 0Zm-7 4c10-5 24-5 34 0l-2 3c-11-4-19-4-30 0Z"/></g></svg>';
export const solsticeLockup = solsticeMark + '<span class="solstice-wordmark"><strong>Solstice</strong><small>Alliance Guild</small></span>';

export function canEditArticles(env, session) {
  return Boolean(session && (env.CMS_ADMIN_DISCORD_IDS ?? '').split(',').map(id => id.trim()).includes(session.discord_id));
}

function shell(title, body, { session, editor, next = '/?tool=raid' } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Solstice, an Alliance guild in World of Warcraft: Forever."><title>${escape(title)} · Solstice Guild</title><link rel="stylesheet" href="/assets/home.css?v=c9e17ea99e24"></head><body>
  <header class="site-header"><a class="brand" href="/">${solsticeLockup}</a>
  <nav aria-label="Main navigation"><a class="journal-link" href="/#chronicle">Chronicle</a>${editor ? '<a href="/cms">Article editor</a>' : ''}
  ${session ? '<a class="button discord" href="/?tool=raid">Guild Hall</a>' : '<a class="button discord" href="' + escape(loginLink(next)) + '">Sign in with Discord</a>'}</nav></header>
  ${body}
  <footer><a class="brand" href="/">${solsticeLockup}</a><span>World of Warcraft: Forever · US Normal Alliance</span></footer>
  </body></html>`;
}
function html(body, status = 200) {
  return new Response(body, { status, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'same-origin',
  } });
}

export async function publicHome(env, url, session) {
  const params = new URLSearchParams(url.search);
  const login = params.get('login');
  params.delete('login');
  const next = params.has('tool') || params.has('raid') ? '/?' + params : '/?tool=raid';
  const notice = { membership: 'Use a Discord account that belongs to the Solstice server.', expired: 'Your sign-in expired. Please try again.', unavailable: 'Discord sign-in is temporarily unavailable.' }[login];
  const { results } = await env.DB.prepare('SELECT id, title, summary, published_at FROM articles WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 12').bind().all();
  const cards = results.map(article => `<article class="news-card"><p class="eyebrow">${dateLabel(article.published_at)}</p><h3><a href="/chronicle/${escape(article.id)}">${escape(article.title)}</a></h3><p>${escape(article.summary)}</p><a class="text-link" href="/chronicle/${escape(article.id)}">Read article <span aria-hidden="true">→</span></a></article>`).join('');
  return html(shell('Home', `<main class="guild-home">
  <section class="home-banner" aria-labelledby="home-title"><div class="home-banner-content"><div class="home-banner-copy">
    <p class="eyebrow">World of Warcraft: Forever <span>·</span> US Normal Alliance</p>
    <h1 id="home-title">Solstice</h1>
    <p class="home-intro">An Alliance guild for the people you want beside you in Azeroth.</p>
    ${notice ? '<p class="notice" role="status">' + escape(notice) + '</p>' : ''}
    <a class="button outline" href="#chronicle">Read the Chronicle <span aria-hidden="true">↓</span></a>
    </div>
    <aside class="home-about" aria-labelledby="about-title">
      ${solsticeMark}
      <p class="eyebrow">Alliance guild</p><h2 id="about-title">Life in Solstice</h2>
      <p>We raid together, help each other get ready, and share what we learn along the way.</p>
      <dl><div><dt>Game</dt><dd>WoW Forever</dd></div><div><dt>Server</dt><dd>US Normal</dd></div><div><dt>Faction</dt><dd>Alliance</dd></div></dl>
    </aside>
  </div></section>
  <section class="chronicle home-journal" id="chronicle" aria-labelledby="chronicle-title">
      <p class="eyebrow">From the guild</p><h2 id="chronicle-title">The Chronicle</h2>
      <p class="section-intro">Raid stories, announcements, and news from Solstice.</p>
      <div class="news-grid">${cards || '<p class="empty">Guild news and raid recaps will appear here as they’re published.</p>'}</div>
  </section>
  </main>`, { session, editor: canEditArticles(env, session), next }));
}

export async function articlePage(env, id, session) {
  const article = await env.DB.prepare('SELECT * FROM articles WHERE id = ? AND published_at IS NOT NULL').bind(id).first();
  if (!article) return html(shell('Article unavailable', '<main class="article-page"><h1>Article unavailable</h1><a href="/#chronicle">Back to the Chronicle</a></main>', { session }), 404);
  const paragraphs = article.body.split(/\r?\n\s*\r?\n/).map(paragraph => '<p>' + escape(paragraph) + '</p>').join('');
  return html(shell(article.title, `<main class="article-page"><a class="text-link" href="/#chronicle">← Back to the Chronicle</a><p class="eyebrow">${dateLabel(article.published_at)}</p><h1>${escape(article.title)}</h1><p class="article-summary">${escape(article.summary)}</p><div class="article-body">${paragraphs}</div></main>`, { session, editor: canEditArticles(env, session) }));
}

export async function cmsPage(request, env, url, session) {
  if (!canEditArticles(env, session)) return new Response('The article editor is restricted to configured guild editors.', { status: 403 });
  if (request.method === 'POST') {
    if (!sameOriginWrite(request, url)) return new Response('Invalid origin.', { status: 403 });
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    const action = String(data.get('action') ?? '');
    const title = String(data.get('title') ?? '').trim();
    const summary = String(data.get('summary') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    if (!['draft','publish'].includes(action) || !title || title.length > 110 || summary.length > 240 || !body || body.length > 16000) {
      return new Response('Enter a title and article body within the editor limits.', { status: 400 });
    }
    const now = new Date().toISOString();
    if (id) {
      const result = await env.DB.prepare('UPDATE articles SET title = ?, summary = ?, body = ?, published_at = CASE WHEN ? THEN COALESCE(published_at, ?) ELSE NULL END, updated_at = ? WHERE id = ?')
        .bind(title, summary, body, Number(action === 'publish'), now, now, id).run();
      if (!result.meta.changes) return new Response('Article unavailable.', { status: 404 });
    } else {
      await env.DB.prepare('INSERT INTO articles (id,title,summary,body,published_at,updated_at) VALUES (?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), title, summary, body, action === 'publish' ? now : null, now).run();
    }
    return new Response(null, { status: 303, headers: { Location: '/cms', 'Cache-Control': 'no-store' } });
  }
  if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 });
  const id = url.searchParams.get('edit');
  const article = id ? await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first() : null;
  if (id && !article) return new Response('Article unavailable.', { status: 404 });
  const { results } = await env.DB.prepare('SELECT id,title,published_at FROM articles ORDER BY updated_at DESC LIMIT 100').bind().all();
  return html(shell('Article editor', `<main class="article-page editor"><p class="eyebrow">Guild Chronicle</p><h1>Article editor</h1>
  <div class="editor-grid"><form method="post" action="/cms" enctype="multipart/form-data"><h2>${article ? 'Edit article' : 'New article'}</h2><input type="hidden" name="id" value="${escape(article?.id)}">
  <label>Title<input required name="title" maxlength="110" value="${escape(article?.title)}"></label>
  <label>Summary<input name="summary" maxlength="240" value="${escape(article?.summary)}"></label>
  <label>Article<textarea required name="body" maxlength="16000" rows="13">${escape(article?.body)}</textarea></label>
  <p>Use a blank line to start a new paragraph. Saving as a draft takes a published article offline.</p>
  <div class="actions"><button class="button gold" name="action" value="publish">Publish article</button><button class="button outline" name="action" value="draft">Save as draft</button></div></form>
  <aside><h2>Articles</h2><a class="text-link" href="/cms">+ New article</a><ul>${results.map(row => '<li><a href="/cms?edit=' + escape(row.id) + '">' + escape(row.title) + '</a><small>' + (row.published_at ? 'Published' : 'Draft') + '</small></li>').join('') || '<li>No articles yet.</li>'}</ul></aside></div></main>`, { session, editor: true }));
}
