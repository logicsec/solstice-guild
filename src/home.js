import { armorySpecs, linkedRosterProfiles, publicRosterProfile } from './armory.js';
import { articleMarkup, startArticleEditor } from './article-editor.js';
import { raidReserves } from './reserves.js';
import { sameOriginWrite } from './auth.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const articleCategories = ['Guild news', 'Raid recaps', 'Guides', 'Events'];
const categoryLabel = category => category.replace(/\b[a-z]/gi, initial => initial.toUpperCase());
const categoryLink = category => '/?category=' + encodeURIComponent(category) + '#chronicle';
const dateLabel = date => new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'America/New_York' }).format(new Date(date));
const loginLink = next => '/auth/discord?next=' + encodeURIComponent(next);
export const solsticeMark = '<svg class="solstice-shield" aria-hidden="true" viewBox="0 0 60 70"><path d="M30 3C23 9 13 12 5 12c-1 23 3 38 25 54 22-16 26-31 25-54-8 0-18-3-25-9Z" fill="#171717" stroke="#6f6047" stroke-width="2.5"/><g fill="none" stroke="#82765e" stroke-width="2" stroke-linecap="round"><path d="M16 48C9 42 9 31 14 23c3-5 7-8 12-10M44 48c7-6 7-17 2-25-3-5-7-8-12-10M16 48c4 4 9 6 14 6s10-2 14-6"/></g><g fill="#9a8a6b"><path d="m14 25 7 2-6 4Zm-2 8 7 1-6 4Zm2 8 7-1-5 5Zm5 7 6-3-3 6Zm15-33-7 2 6 4Zm2 8-7 1 6 4Zm-2 8-7-1 5 5Zm-5 7-6-3 3 6Z"/></g><path d="M23 53c3 3 5 4 7 4s4-1 7-4" fill="none" stroke="#82765e" stroke-width="2" stroke-linecap="round"/></svg>';
const faviconSvg = solsticeMark.replace(
  '<svg class="solstice-shield" aria-hidden="true" viewBox="0 0 60 70">',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 0 70 70">',
);
export const solsticeFavicon = '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,' + encodeURIComponent(faviconSvg) + '">';
export const solsticeLockup = solsticeMark + '<span class="solstice-wordmark"><strong>Solstice</strong><small>Alliance Guild</small></span>';

export function canEditArticles(env, session) {
  return Boolean(session && (env.CMS_ADMIN_DISCORD_IDS ?? '').split(',').map(id => id.trim()).includes(session.discord_id));
}

function shell(title, body, { session, editor, next = '/?tool=raid', raidView = false, hall = '/?tool=raid' } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Solstice, an Alliance guild in World of Warcraft: Forever."><title>${escape(title)} · Solstice Guild</title>${solsticeFavicon}<link rel="stylesheet" href="/assets/home.css?v=mobile-layout-3"><script src="/assets/mobile-tables.js?v=1" defer></script></head><body>
  <header class="site-header"><a class="brand" href="/">${solsticeLockup}</a>
  <button class="site-menu-toggle" type="button" aria-expanded="false" aria-controls="site-navigation" hidden>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    Menu
  </button>
  <nav id="site-navigation" aria-label="Main navigation">${raidView ? '' : '<a class="journal-link" href="/#chronicle">Chronicle</a>'}${editor ? '<a href="/cms">Article Editor</a>' : ''}
  ${session ? '<a class="button discord" href="' + escape(hall) + '">Guild Hall</a>' : '<a class="button discord" href="' + escape(loginLink(next)) + '">Sign in with Discord</a>'}</nav></header>
  ${body}
  ${raidView ? '' : `<footer><a class="brand" href="/">${solsticeLockup}</a><span>World of Warcraft: Forever · US Normal Alliance</span></footer>`}
  <script>
    (() => {
      const navigation = document.getElementById('site-navigation');
      const header = navigation.closest('.site-header');
      const toggle = header.querySelector('.site-menu-toggle');
      const close = () => toggle.setAttribute('aria-expanded', 'false');
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') !== 'true'));
      });
      header.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
        close();
        toggle.focus();
      });
      navigation.addEventListener('click', event => {
        if (!event.target.closest('a')) return;
        if (toggle.getAttribute('aria-expanded') === 'true') toggle.focus({ preventScroll: true });
        close();
      });
      document.addEventListener('pointerdown', event => {
        if (!header.contains(event.target)) close();
      });
      matchMedia('(max-width: 760px)').addEventListener('change', close);
    })();
  </script>
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
  const requestedCategory = params.get('category');
  const category = articleCategories.includes(requestedCategory) ? requestedCategory : null;
  const { results } = await env.DB.prepare(`SELECT id, title, summary, published_at, body, body_format, category
    FROM articles WHERE published_at IS NOT NULL AND (? IS NULL OR category = ?)
    ORDER BY published_at DESC LIMIT 12`).bind(category,category).all();
  const cards = results.map((article, index) => {
    const link = '/chronicle/' + escape(article.id);
    const { cover } = articleContent(article);
    return `<article class="news-card chronicle-card${index === 0 ? ' chronicle-feature' : ''}"><a class="chronicle-card-link" href="${link}">
      ${cover ? `<div class="chronicle-card-cover">${cover}</div>` : ''}
      <div class="chronicle-card-copy"><p class="chronicle-card-meta"><span class="text-link">${escape(categoryLabel(article.category))}</span> <time datetime="${escape(article.published_at)}">${dateLabel(article.published_at)}</time></p>
      <h3>${escape(article.title)}</h3>
      ${article.summary ? `<p>${escape(article.summary)}</p>` : ''}
      ${index === 0 ? '<span class="text-link">Read article <span aria-hidden="true">→</span></span>' : ''}</div>
    </a></article>`;
  }).join('');
  return html(shell('Home', `<main class="guild-home">
  <section class="home-banner" aria-labelledby="home-title"><div class="home-banner-content"><div class="home-banner-copy">
    <p class="eyebrow">World of Warcraft: Forever <span>·</span> US Normal Alliance</p>
    <h1 id="home-title">Solstice</h1>
    <p class="home-intro">An Alliance guild for the people you want beside you in Azeroth.</p>
    ${notice ? '<p class="notice" role="status">' + escape(notice) + '</p>' : ''}
    <a class="button outline home-chronicle-link" href="#chronicle">Read the Chronicle <span aria-hidden="true">↓</span></a>
    </div>
    <aside class="home-about" aria-labelledby="about-title">
      ${solsticeMark}
      <p class="eyebrow">Alliance guild</p><h2 id="about-title">Life In Solstice</h2>
      <p>We raid together, help each other get ready, and share what we learn along the way.</p>
      <dl><div><dt>Game</dt><dd>WoW Forever</dd></div><div><dt>Server</dt><dd>US Normal</dd></div><div><dt>Faction</dt><dd>Alliance</dd></div></dl>
    </aside>
  </div></section>
  <section class="chronicle home-journal" id="chronicle" aria-labelledby="chronicle-title">
      <p class="eyebrow">From the guild</p><h2 id="chronicle-title">The Chronicle</h2>
      <p class="section-intro">Raid stories, announcements, and news from Solstice.</p>
      <nav class="chronicle-filters" aria-label="Chronicle categories">
        ${[null, ...articleCategories].map(label => `<a href="${label ? categoryLink(label) : '/#chronicle'}"${label === category ? ' aria-current="true"' : ''}>${escape(categoryLabel(label ?? 'All Posts'))}</a>`).join('')}
      </nav>
      <div class="news-grid chronicle-grid">${cards || (category ? '<p class="empty">No posts in this category yet.</p>' : '<p class="empty">Guild news and raid recaps will appear here as they’re published.</p>')}</div>
  </section>
  </main>`, { session, editor: canEditArticles(env, session), next }));
}

export async function publicRaidPage(env, id, roles, session, requested) {
  const db = env.DB;
  const next = '/raid/' + id;
  const respond = (title, body, status) => {
    const response = html(shell(title, body, { next, session, raidView:true, hall:'/?tool=raid&view=detail&raid='+id }),status);
    response.headers.set('X-Robots-Tag','noindex, nofollow');
    return response;
  };
  const { results } = await db.prepare(`SELECT r.title, r.starts_at, r.size, r.state, r.owner, r.instance,
      r.reserve_limit, r.reserves_locked, json_extract(r.settings, '$.softReserve') AS reserve_url,
      json_extract(r.settings, '$.roles') AS role_targets, s.member, s.character, s.class_name, s.role, s.group_no
    FROM raids r LEFT JOIN raid_signups s ON s.raid_id = r.id AND s.status = 'Going'
    WHERE r.id = ?
    ORDER BY s.group_no IS NULL, s.group_no, s.character COLLATE NOCASE`).bind(id).all();
  const raid = results[0];
  if (!raid) return respond('Raid unavailable',
    '<main class="article-page"><h1>Raid unavailable</h1><p>This raid link may be outdated.</p><a class="text-link" href="/">Back to Solstice</a></main>',404);
  const roster = results.filter(row=>row.character != null);
  const reserves = await raidReserves(db,id);
  const reserveRows = reserves.map(row=>`<tr><th scope="row">${escape(row.character)}</th><td>${row.items.map(escape).join(' · ')}</td></tr>`).join('');
  const external = typeof raid.reserve_url === 'string' && /^https:\/\//i.test(raid.reserve_url) ?
    `<a class="text-link" href="${escape(raid.reserve_url)}" rel="noreferrer">Open external soft reserves</a>` : '';
  const targets = JSON.parse(raid.role_targets || 'null');
  const date = new Intl.DateTimeFormat('en-US',{
    dateStyle:'full', timeStyle:'short', timeZone:'America/New_York',
  }).format(new Date(raid.starts_at));
  const composition = roles.map(role=>{
    const count = roster.filter(player=>player.role === role).length;
    const target = targets?.[role];
    return `<div class="news-card"><dt>${escape(role)}</dt><dd>${count}${Number.isInteger(target) ? ' / '+target : ''}</dd></div>`;
  }).join('');
  const profiles = roster.length ? await linkedRosterProfiles(db,id) : new Map();
  const rows = (await Promise.all(roster.map(async player=>{
    const link = profiles.get(player.member);
    const profile = await publicRosterProfile(env,link?.slug);
    const specs = Object.hasOwn(armorySpecs,player.class_name) ? armorySpecs[player.class_name] : null;
    const spec = specs?.find(([name])=>name.toLowerCase() === (link?.spec ?? '').toLowerCase());
    const icon = name => `<img src="https://wow.zamimg.com/images/wow/icons/medium/${escape(name)}.jpg" alt="" width="28" height="28" loading="lazy">`;
    const metadata = [player.class_name,spec?.[0],player.role,profile?.level != null ? 'Level '+profile.level : ''].filter(Boolean);
    return `<li class="news-card public-raider">
      <div class="public-raider-identity">
        ${specs ? `<span class="public-raider-icons">${icon('classicon_'+player.class_name.toLowerCase())}${spec ? icon(spec[2]) : ''}</span>` : ''}
        <div><strong data-wow-class="${escape(player.class_name)}">${escape(player.character)}</strong>
          <p>${metadata.map(escape).join(' · ')}</p>
        </div>
      </div>
      ${profile?.guild ? `<span class="public-raider-guild">&lt;${escape(profile.guild)}&gt;</span>` : ''}
      <span class="public-raider-group">${player.group_no == null ? 'Unassigned' : 'Group '+escape(player.group_no)}</span>
    </li>`;
  }))).join('');
  return respond(raid.title,`<main class="guild-home public-raid">
    <section class="home-banner public-raid-banner raid-banner" data-raid-instance="${escape(raid.instance)}"><div class="home-banner-content">
      <p class="eyebrow">Solstice raid · Guest view</p><h1>${escape(raid.title)}</h1>
      <p><time datetime="${escape(raid.starts_at)}">${escape(date)} Eastern</time> · ${escape(raid.state)}</p>
      <p>${roster.length} of ${escape(raid.size)} slots filled</p>
      <p>Anyone with the link can view this roster. Solstice Discord members can RSVP in the Guild Hall.</p>
    </div></section>
    <div class="chronicle home-journal public-raid-sections">
      <section class="public-raid-section" aria-labelledby="raid-composition">
        <h2 id="raid-composition">Raid Composition</h2>
        <dl class="news-grid public-raid-composition">${composition}</dl>
      </section>
      <section class="public-raid-section" aria-labelledby="confirmed-roster">
        <h2 id="confirmed-roster">Confirmed Roster</h2>
        ${rows ? `<ul class="public-raider-list">${rows}</ul>` : '<p class="empty">No players have been confirmed yet.</p>'}
      </section>
      <section class="public-raid-section" aria-labelledby="loot-reserves">
        <h2 id="loot-reserves">Loot Reserves</h2>
        <div class="news-card public-raid-reserve-info">
          <p class="public-raid-reserve-status">${raid.reserves_locked ? 'Locked' : raid.state === 'Cancelled' ? 'Closed' : 'Coming Soon'} · ${raid.reserve_limit} per player</p>
          <p>Automatic raid loot and reserve selection are coming soon.</p>
          ${requested ? '<p role="status">Guest request sent for organizer approval.</p>' : ''}
          ${external}
        </div>
        ${reserveRows ? `<div class="news-card public-raid-table"><table aria-label="Raid loot reserves">
          <thead><tr><th scope="col">Character</th><th scope="col">Reserved items</th></tr></thead>
          <tbody>${reserveRows}</tbody></table></div>` : ''}
      </section>
    </div>
  </main>`);
}

function articleContent(article) {
  const content = articleMarkup(article.body, article.body_format, escape);
  const cover = content.match(/<img [^>]+>/)?.[0] ?? '';
  return { cover, content: cover ? content.replace(cover, '') : content };
}

export async function articlePage(env, id, session) {
  const article = await env.DB.prepare('SELECT * FROM articles WHERE id = ? AND published_at IS NOT NULL').bind(id).first();
  if (!article) return html(shell('Article Unavailable', '<main class="article-page chronicle-article"><h1>Article Unavailable</h1><a href="/#chronicle">Back to the Chronicle</a></main>', { session }), 404);
  const [{ results: recent }, { results: counts }] = await Promise.all([
    env.DB.prepare(`SELECT id, title, published_at, body, body_format FROM articles
      WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 3`).bind().all(),
    env.DB.prepare(`SELECT category, COUNT(*) AS total FROM articles
      WHERE published_at IS NOT NULL GROUP BY category`).bind().all(),
  ]);
  const { cover, content } = articleContent(article);
  const byline = article.publisher_name ? `<span>Published by <strong>${escape(article.publisher_name)}</strong></span>` : '';
  return html(shell(article.title, `<main class="article-page chronicle-article">
    <a class="text-link" href="/#chronicle">← Back to the Chronicle</a>
    <div class="chronicle-reading-layout"><article>
      ${cover ? `<div class="chronicle-article-cover">${cover}</div>` : ''}
      <header class="chronicle-article-header">
        <a class="text-link" href="${categoryLink(article.category)}">${escape(categoryLabel(article.category))}</a>
        <h1>${escape(article.title)}</h1>
        ${article.summary ? `<p class="article-summary">${escape(article.summary)}</p>` : ''}
        <p class="chronicle-article-meta">${byline}<time datetime="${escape(article.published_at)}">${dateLabel(article.published_at)}</time></p>
      </header>
      <div class="article-body">${content}</div>
    </article>
    <aside class="chronicle-sidebar" aria-label="Explore the Chronicle">
      <section class="news-card"><h2>Recent Posts</h2><ul>${recent.map(post => {
        const thumbnail = articleContent(post).cover;
        return `<li><a class="chronicle-recent" href="/chronicle/${escape(post.id)}"${post.id === id ? ' aria-current="page"' : ''}>
          ${thumbnail ? `<span class="chronicle-thumbnail">${thumbnail}</span>` : ''}
          <span><time datetime="${escape(post.published_at)}">${dateLabel(post.published_at)}</time><strong>${escape(post.title)}</strong></span>
        </a></li>`;
      }).join('')}</ul></section>
      <section class="news-card"><h2>Categories</h2><ul>${articleCategories.map(category =>
        `<li><a class="chronicle-category" href="${categoryLink(category)}"><span>${escape(categoryLabel(category))}</span><span>${counts.find(row => row.category === category)?.total ?? 0}</span></a></li>`
      ).join('')}</ul></section>
    </aside></div>
  </main>`, { session, editor: canEditArticles(env, session) }));
}

export async function cmsPage(request, env, url, session) {
  if (!canEditArticles(env, session)) return new Response('The article editor is restricted to configured guild editors.', { status: 403 });
  if (request.method === 'POST') {
    if (!sameOriginWrite(request, url)) return new Response('Invalid origin.', { status: 403 });
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    const action = String(data.get('action') ?? '');
    if (action === 'delete') {
      if (!id) return new Response('Article Unavailable.', { status: 404 });
      const result = await env.DB.prepare('DELETE FROM articles WHERE id = ?').bind(id).run();
      if (!result.meta.changes) return new Response('Article Unavailable.', { status: 404 });
      return new Response(null, { status: 303, headers: { Location: '/cms', 'Cache-Control': 'no-store' } });
    }
    const title = String(data.get('title') ?? '').trim();
    const summary = String(data.get('summary') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    const category = String(data.get('category') ?? 'Guild news');
    if (!articleCategories.includes(category)) return new Response('Choose a valid category.', { status: 400 });
    const format = data.get('body_format') === 'rich' ? 'rich' : 'plain';
    if (!['draft','publish'].includes(action) || !title || title.length > 110 || summary.length > 240 || !body || body.length > 16000) {
      return new Response('Enter a title and article body within the editor limits.', { status: 400 });
    }
    const now = new Date().toISOString();
    const publishing = action === 'publish';
    if (id) {
      const result = await env.DB.prepare(`UPDATE articles SET title = ?, summary = ?, body = ?, body_format = ?, category = ?,
        publisher_name = CASE WHEN ? AND published_at IS NULL THEN ? ELSE publisher_name END,
        published_at = CASE WHEN ? THEN COALESCE(published_at, ?) ELSE NULL END, updated_at = ? WHERE id = ?`)
        .bind(title, summary, body, format, category, Number(publishing), session.display_name, Number(publishing), now, now, id).run();
      if (!result.meta.changes) return new Response('Article Unavailable.', { status: 404 });
    } else {
      await env.DB.prepare('INSERT INTO articles (id,title,summary,body,body_format,category,publisher_name,published_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), title, summary, body, format, category, publishing ? session.display_name : null, publishing ? now : null, now).run();
    }
    return new Response(null, { status: 303, headers: { Location: '/cms', 'Cache-Control': 'no-store' } });
  }
  if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 });
  const id = url.searchParams.get('edit');
  const article = id ? await env.DB.prepare('SELECT * FROM articles WHERE id = ?').bind(id).first() : null;
  if (id && !article) return new Response('Article Unavailable.', { status: 404 });
  const { results } = await env.DB.prepare('SELECT id,title,published_at FROM articles ORDER BY updated_at DESC LIMIT 100').bind().all();
  return html(shell('Article Editor', `<main class="article-page editor"><p class="eyebrow">Guild Chronicle</p><h1>Article Editor</h1>
  <div class="editor-grid"><form method="post" action="/cms" enctype="multipart/form-data"><h2>${article ? 'Edit Article' : 'New Article'}</h2><input type="hidden" name="id" value="${escape(article?.id)}">
  <label>Title<input required name="title" maxlength="110" value="${escape(article?.title)}"></label>
  <label for="articleCategory">Category</label>
  <select id="articleCategory" name="category">${articleCategories.map(category =>
    `<option value="${escape(category)}"${category === (article?.category ?? 'Guild news') ? ' selected' : ''}>${escape(categoryLabel(category))}</option>`
  ).join('')}</select>
  <label for="articleSummary">Summary</label><textarea id="articleSummary" name="summary" maxlength="240" rows="2">${escape(article?.summary)}</textarea>
  <input type="hidden" name="body_format" value="${escape(article?.body_format ?? 'plain')}">
  <label for="articleBody" id="articleBodyLabel">Article</label>
  <div id="articleTools" class="editor-tools" role="group" aria-label="Article formatting" hidden>
    <button type="button" data-command="bold">Bold</button>
    <button type="button" data-command="italic">Italic</button>
    <button type="button" data-command="formatBlock" data-value="h2">Heading</button>
    <button type="button" data-command="formatBlock" data-value="p">Paragraph</button>
    <button type="button" data-command="insertUnorderedList">Bullet list</button>
    <button type="button" data-command="insertOrderedList">Numbered list</button>
    <button type="button" data-command="image">Add image</button>
  </div>
  <div id="articleContent" class="article-body editor-content" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="articleBodyLabel" hidden>${article ? articleMarkup(article.body, article.body_format, escape) : ''}</div>
  <p id="articleImageStatus" class="editor-note" role="status"></p>
  <textarea id="articleBody" required name="body" maxlength="16000" rows="13">${escape(article?.body)}</textarea>
  <p class="editor-note">Saving as a draft takes a published article offline.</p>
  <div class="actions"><button class="button gold" name="action" value="publish">Publish article</button><button class="button outline" name="action" value="draft">Save as draft</button>${article ? '<button type="button" class="button editor-delete" id="openArticleDelete">Delete article</button>' : ''}</div></form>
  ${article ? `<dialog id="articleDelete" class="editor-delete-dialog" aria-labelledby="articleDeleteTitle">
    <h2 id="articleDeleteTitle">Delete This Article?</h2>
    <p>“${escape(article.title)}” will be permanently removed.</p>
    <form method="post" action="/cms" class="actions">
      <input type="hidden" name="id" value="${escape(article.id)}">
      <button class="button outline" type="button" id="cancelArticleDelete" autofocus>Cancel</button>
      <button class="button editor-delete" name="action" value="delete">Delete article</button>
    </form>
  </dialog>` : ''}
  <aside><h2>Articles</h2><a class="text-link" href="/cms">+ New Article</a><ul>${results.map(row => '<li><a href="/cms?edit=' + escape(row.id) + '">' + escape(row.title) + '</a><small>' + (row.published_at ? 'Published' : 'Draft') + '</small></li>').join('') || '<li>No articles yet.</li>'}</ul></aside></div><script>(${startArticleEditor.toString()})();</script></main>`, { session, editor: true }));
}
