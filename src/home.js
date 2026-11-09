import { sameOriginWrite } from './auth.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const dateLabel = date => new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(date));
const loginLink = next => '/auth/discord?next=' + encodeURIComponent(next);
const mark = '<svg aria-hidden="true" viewBox="0 0 48 48" width="35" height="35" fill="none" stroke="currentColor" stroke-width="2"><circle cx="24" cy="24" r="8"/><path d="M24 2v12m0 20v12M2 24h12m20 0h12M8 8l9 9m14 14 9 9M8 40l9-9m14-14 9-9"/><circle cx="24" cy="24" r="19" opacity=".35"/></svg>';

export function canEditArticles(env, session) {
  return Boolean(session && (env.CMS_ADMIN_DISCORD_IDS ?? '').split(',').map(id => id.trim()).includes(session.discord_id));
}

function shell(title, body, { session, editor, next = '/?tool=auction' } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Solstice, an Alliance guild in World of Warcraft: Forever."><title>${escape(title)} · Solstice Guild</title><link rel="stylesheet" href="/assets/home.css"></head><body>
  <header class="site-header"><a class="brand" href="/">${mark}<span>Solstice<small>Alliance Guild</small></span></a>
  <nav aria-label="Main navigation"><a class="journal-link" href="/#chronicle">Chronicle</a>${editor ? '<a href="/cms">Article editor</a>' : ''}
  ${session ? '<a class="button discord" href="/?tool=auction">Guild Hall</a>' : '<a class="button discord" href="' + escape(loginLink(next)) + '">Sign in with Discord <span aria-hidden="true">↗</span></a>'}</nav></header>
  ${body}
  <footer><a class="brand" href="/">${mark}<span>Solstice</span></a><span>World of Warcraft: Forever · US Normal Alliance</span></footer>
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
  const next = params.has('tool') || params.has('raid') ? '/?' + params : '/?tool=auction';
  const notice = { membership: 'Use a Discord account that belongs to the Solstice server.', expired: 'Your sign-in expired. Please try again.', unavailable: 'Discord sign-in is temporarily unavailable.' }[login];
  const { results } = await env.DB.prepare('SELECT id, title, summary, published_at FROM articles WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 12').bind().all();
  const cards = results.map(article => `<article class="news-card"><p class="eyebrow">${dateLabel(article.published_at)}</p><h3><a href="/chronicle/${escape(article.id)}">${escape(article.title)}</a></h3><p>${escape(article.summary)}</p><a class="text-link" href="/chronicle/${escape(article.id)}">Read article <span aria-hidden="true">→</span></a></article>`).join('');
  return html(shell('Home', `<main>
  <section class="hero"><div class="hero-inner"><div class="hero-copy"><p class="eyebrow"><span class="sun-dot"></span> World of Warcraft: Forever</p><h1>Solstice</h1><p class="hero-lede">Meet where the light breaks.</p><p class="hero-description">An Alliance guild for raiders, crafters, and the friends you make along the way.</p>
  ${notice ? '<p class="notice" role="status">' + escape(notice) + '</p>' : ''}
  <div class="actions"><a class="button gold" href="${session ? '/?tool=auction' : escape(loginLink(next))}">${session ? 'Enter the Guild Hall' : 'Sign in with Discord'} <span aria-hidden="true">→</span></a><a class="button outline" href="#chronicle">Read the Chronicle</a></div></div>
  <aside class="guild-panel"><p class="eyebrow">The Guild Hall</p><h2>Plan the next adventure</h2><ul><li><span>01</span><div><strong>Raid Planner</strong><small>Plan events, sign up, and see your group.</small></div></li><li><span>02</span><div><strong>Auction House</strong><small>Search current US Normal Alliance prices.</small></div></li><li><span>03</span><div><strong>Professions</strong><small>Price ingredients and compare crafting margins.</small></div></li></ul></aside></div></section>
  <section class="paths" aria-labelledby="paths-title"><p class="eyebrow">Life in Solstice</p><h2 id="paths-title">Find your place in the guild</h2>
  <div class="path-grid"><article><span class="medallion" aria-hidden="true">⚔</span><h3>Raid together</h3><p>See what’s coming up, sign up with your character, and check your group before raid night.</p></article>
  <article><span class="medallion" aria-hidden="true">⚒</span><h3>Craft with purpose</h3><p>Look up materials and compare crafting costs before spending your gold.</p></article>
  <article><span class="medallion" aria-hidden="true">✦</span><h3>Keep up with the guild</h3><p>Read announcements and raid recaps in the Guild Chronicle.</p></article></div></section>
  <section class="chronicle" id="chronicle"><p class="eyebrow">News from Solstice</p><h2>The Guild Chronicle</h2><p class="section-intro">Raid recaps, guild announcements, and stories from Azeroth.</p><div class="news-grid">${cards || '<p class="empty">There are no published articles yet.</p>'}</div></section>
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
