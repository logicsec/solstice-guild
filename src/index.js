import { armoryApi, linkedRosterProfiles } from './armory.js';
import { changePrep, prepTasks, prepCategories, schedulePrep } from './prep.js';
import { renderTonight } from './tonight.js';
import { renderArmory, renderArmoryProfile } from './armory-client.js';
import { articlePage, cmsPage, publicHome, solsticeLockup } from './home.js';
import { authReady, discordAuth, sameOriginWrite, sessionFor } from './auth.js';

const auctionCategories = [
  ['weapon', 'Weapons', 'weapons'],
  ['armor', 'Armor'],
  ['container', 'Containers', 'containers'],
  ['consumable', 'Consumables', 'consumables'],
  ['trade-goods', 'Trade Goods'],
  ['projectile', 'Projectiles', 'projectiles'],
  ['quiver', 'Quivers', 'quivers'],
  ['recipe', 'Recipes', 'recipes'],
  ['reagent', 'Reagents', 'reagents'],
  ['miscellaneous', 'Miscellaneous'],
  ['quest', 'Quest Items'],
  ['key', 'Keys'],
  ['wow-token', 'WoW Tokens'],
];

const professionTiles = [
  ['Blacksmithing', 'M4 9h16l-3 4h-3v5h4v2H6v-2h4v-5H7z'],
  ['Enchanting', 'M5 19 16 8m1-5v4m5 1h-4M8 4v5M5 7h6'],
  ['Leatherworking', 'M7 4 4 8l3 4-2 5 4 3 3-2 3 2 4-3-2-5 3-4-3-4-5 2z'],
  ['Alchemy', 'M9 3h6m-5 0v7l-5 7a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-7V3M8 15h8'],
  ['Mining', 'm5 20 12-14M7 4c6-2 11 1 14 7M7 4l-2 2'],
  ['Tailoring', 'M7 5h10M7 19h10M9 5v14m6-14v14M9 9l6-2m-6 6 6-2m-6 6 6-2'],
  ['Engineering', 'M12 3v3m0 12v3m9-9h-3M6 12H3m15-6-2 2m-8 8-2 2M6 6l2 2m8 8 2 2M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z'],
  ['First Aid', 'M9 4h6v5h5v6h-5v5H9v-5H4V9h5z'],
  ['Cooking', 'M4 11h16l-2 8H6zM3 11h18M8 8c-2-2 2-2 0-4m5 4c-2-2 2-2 0-4'],
];

const raidClasses = ['Druid', 'Hunter', 'Mage', 'Paladin', 'Priest', 'Rogue', 'Warlock', 'Warrior'];
const raidRoles = ['Tank', 'Healer', 'Melee DPS', 'Ranged DPS'];
const readinessChecks = [['access','Raid access'],['gear','Gear'],['enchants','Enchants'],['supplies','Supplies']];
const readinessValues = ['Unreviewed', 'Ready', 'Blocked', 'Not applicable'];
const raidStatuses = ['Going', 'Tentative', 'Bench', 'Declined'];

async function raidApi(request, db, url, user) {
  const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!user) return reply({ error: 'Sign in to use Raid Planner.' }, 401);
  if (!db) return reply({ error: 'Raid storage is unavailable.' }, 503);
  const id = url.pathname === '/api/raid-characters' ? null : url.pathname.split('/')[3];
  if (id && !/^[0-9a-f-]{36}$/.test(id)) return reply({ error: 'Raid not found.' }, 404);
  const post = request.method === 'POST';
  let input = {};
  if (post) {
    if (!sameOriginWrite(request, url) || !request.headers.get('Content-Type')?.startsWith('application/json')) {
      return reply({ error: 'Invalid request origin.' }, 403);
    }
    try { input = await request.json(); } catch { return reply({ error: 'Invalid form.' }, 400); }
    if (!input || typeof input !== 'object') return reply({ error: 'Invalid form.' }, 400);
  } else if (request.method !== 'GET') return reply({ error: 'Method not allowed.' }, 405);
  const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  if (url.pathname === '/api/raid-characters') {
    if (!post) {
      const result = await db.prepare('SELECT name, class_name, spec, role FROM raid_characters WHERE member = ? ORDER BY name').bind(user).all();
      const linked = await db.prepare('SELECT name, class_name, role FROM armory_links WHERE member = ? ORDER BY name').bind(user).all();
      const names = new Set(linked.results.map(row=>row.name.toLowerCase()));
      return reply({ characters: result.results, signupCharacters: [...linked.results.map(row=>({...row,spec:''})),
        ...result.results.filter(row=>!names.has(row.name.toLowerCase()))] });
    }
    const name = clean(input.name, 30);
    const spec = clean(input.spec, 30);
    if (!name || !raidClasses.includes(input.className) || !raidRoles.includes(input.role)) return reply({ error: 'Enter a character name, class and role.' }, 400);
    await db.prepare('INSERT INTO raid_characters (member, name, class_name, spec, role) VALUES (?, ?, ?, ?, ?) ON CONFLICT (member, name) DO UPDATE SET class_name = excluded.class_name, spec = excluded.spec, role = excluded.role').bind(user, name, input.className, spec, input.role).run();
    return reply({ ok: true });
  }
  if (!id) {
    if (!post) {
      if (url.searchParams.get('discover') === '1') {
        const result = await db.prepare("SELECT id, title, starts_at, size, state, (owner = ?) AS organizer FROM raids WHERE json_extract(settings, '$.listed') = 1 AND state = 'Open' AND starts_at > ? ORDER BY starts_at LIMIT 100").bind(user, new Date().toISOString()).all();
        return reply({ raids: result.results });
      }
      const result = await db.prepare('SELECT id, title, starts_at, size, state, (owner = ?) AS organizer FROM raids WHERE owner = ? OR id IN (SELECT raid_id FROM raid_signups WHERE member = ?) ORDER BY starts_at DESC LIMIT 100').bind(user, user, user).all();
      return reply({ raids: result.results });
    }
    const title = clean(input.title, 80);
    const notes = clean(input.notes, 1000);
    const size = Number(input.size);
    const starts = new Date(input.startsAt);
    if (!title || ![10,20,40].includes(size) || !Number.isFinite(+starts) || +starts <= Date.now()) {
      return reply({ error: 'Enter a raid title, a future start time, and a valid size.' }, 400);
    }
    const roles = Object.fromEntries(raidRoles.map(role => [role, Number(input.slots?.[role] ?? 0)]));
    const slotValues = Object.values(roles);
    if (slotValues.some(value => !Number.isInteger(value) || value < 0) || (input.slots && slotValues.reduce((sum, value) => sum + value, 0) !== size)) {
      return reply({ error: 'Role slots must add up to the raid size.' }, 400);
    }
    const reserve = clean(input.softReserve, 400);
    if (reserve && !/^https:\/\/[^\s]+$/i.test(reserve)) return reply({ error: 'Use an HTTPS soft-reserve link.' }, 400);
    const settings = JSON.stringify({
      roles: input.slots ? roles : null, review: input.review === true, waitlist: input.waitlist === true,
      listed: input.listed === true, requirements: clean(input.requirements, 500), softReserve: reserve,
    });
    const dates = input.dates ?? [input.startsAt];
    if (!Array.isArray(dates) || !dates.length || dates.length > 12 || dates[0] !== input.startsAt ||
      dates.some((value, index) => !Number.isFinite(+new Date(value)) || (index && +new Date(value) - +new Date(dates[index-1]) < 6 * 86400000))) {
      return reply({ error: 'Invalid repeat schedule.' }, 400);
    }
    const ids = dates.map(() => crypto.randomUUID());
    const statements = dates.map((value, index) => db.prepare('INSERT INTO raids (id, owner, title, starts_at, size, notes, settings) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(ids[index], user, title, new Date(value).toISOString(), size, notes, settings));
    if (statements.length === 1) await statements[0].run();
    else await db.batch(statements);
    return reply({ id: ids[0], count: ids.length }, 201);
  }
  const raid = await db.prepare('SELECT * FROM raids WHERE id = ?').bind(id).first();
  if (!raid) return reply({ error: 'Raid not found.' }, 404);
  const organizer = raid.owner === user;
  const settings = JSON.parse(raid.settings || '{}');
  if (!post) {
    const signups = await db.prepare('SELECT member, character, class_name, role, status, group_no, assignment, readiness, readiness_note, reviewed_at FROM raid_signups WHERE raid_id = ? ORDER BY character COLLATE NOCASE').bind(id).all();
    const mine = signups.results.find(row => row.member === user);
    const participant = organizer || Boolean(mine);
    const profiles = participant && url.searchParams.has('armory') ? await linkedRosterProfiles(db,id) : new Map();
    const prep = participant && url.searchParams.has('prep') ? await prepTasks(db,id) : [];
    const roster = signups.results.map(({ member, readiness, ...row }) => ({
      ...row, readiness: JSON.parse(readiness || '{}'), ...(organizer ? { member } : {}), ...(profiles.has(member) ? { armorySlug: profiles.get(member) } : {}),
    }));
    const { owner, ...event } = raid;
    return reply({ event: { ...event, settings }, organizer, roster, prep, mine: mine ? { character: mine.character, class_name: mine.class_name, role: mine.role, status: mine.status } : null });
  }
  if (typeof input.action === 'string' && input.action.startsWith('prep-')) {
    if (!organizer) return reply({ error:'Only the raid organizer can manage preparation.' },403);
    return changePrep(db,id,input,reply);
  }
  if (['state', 'review', 'assignment'].includes(input.action)) {
    if (!organizer) return reply({ error: 'Only the raid organizer can do this.' }, 403);
    if (input.action === 'state') {
      if (!['Open', 'Locked', 'Cancelled'].includes(input.state)) return reply({ error: 'Invalid raid state.' }, 400);
      await db.prepare('UPDATE raids SET state = ? WHERE id = ?').bind(input.state, id).run();
    } else if (input.action === 'assignment') {
      await db.prepare('UPDATE raid_signups SET assignment = ? WHERE raid_id = ? AND member = ?').bind(clean(input.assignment, 160), id, clean(input.member, 250)).run();
    } else {
      if (!['Going', 'Bench', 'Waitlist', 'Declined'].includes(input.status)) return reply({ error: 'Invalid review status.' }, 400);
      await db.prepare("UPDATE raid_signups SET status = ?, group_no = CASE WHEN ? = 'Going' THEN group_no ELSE NULL END WHERE raid_id = ? AND member = ?").bind(input.status, input.status, id, clean(input.member, 250)).run();
    }
    return reply({ ok: true });
  }
  if (input.action === 'readiness') {
    if (!organizer) return reply({ error: 'Only the raid organizer can review readiness.' }, 403);
    const member = clean(input.member, 250);
    const character = clean(input.character, 61);
    const checks = Object.fromEntries(readinessChecks.map(([key]) => [key, input.checks?.[key]]));
    if (!member || !character || Object.values(checks).some(value => !readinessValues.includes(value))) {
      return reply({ error: 'Select a valid status for each check.' }, 400);
    }
    const result = await db.prepare('UPDATE raid_signups SET readiness = ?, readiness_note = ?, reviewed_at = ? WHERE raid_id = ? AND member = ? AND character = ?')
      .bind(JSON.stringify(checks), clean(input.note, 400), new Date().toISOString(), id, member, character).run();
    if (!result.meta.changes) return reply({ error: 'This sign-up changed. Reopen the raid before reviewing.' }, 409);
    return reply({ ok: true });
  }
  if (input.action === 'assign') {
    if (!organizer) return reply({ error: 'Only the raid organizer can assign groups.' }, 403);
    const group = input.group === null ? null : Number(input.group);
    const member = clean(input.member, 250);
    if (!member || (group !== null && (!Number.isInteger(group) || group < 1 || group > raid.size / 5))) return reply({ error: 'Invalid assignment.' }, 400);
    const result = await db.prepare(`UPDATE raid_signups SET group_no = ? WHERE raid_id = ? AND member = ? AND status = 'Going'
      AND (? IS NULL OR (SELECT COUNT(*) FROM raid_signups WHERE raid_id = ? AND group_no = ? AND member <> ?) < 5)`)
      .bind(group, id, member, group, id, group, member).run();
    if (!result.meta.changes) return reply({ error: 'Group is full or the signup is no longer going.' }, 409);
    return reply({ ok: true });
  }
  if (input.action !== 'signup') return reply({ error: 'Unknown action.' }, 400);
  const character = clean(input.character, 61);
  if (!character || !raidClasses.includes(input.className) || !raidRoles.includes(input.role) || !raidStatuses.includes(input.status)) {
    return reply({ error: 'Enter a character, class, role, and RSVP.' }, 400);
  }
  const roleLimit = settings.roles?.[input.role] ?? raid.size;
  const result = await db.prepare(`INSERT INTO raid_signups (raid_id, member, character, class_name, role, status)
    SELECT id, ?, ?, ?, ?, CASE
      WHEN ? <> 'Going' THEN ?
      WHEN ? THEN 'Pending'
      WHEN ? AND ((SELECT COUNT(*) FROM raid_signups WHERE raid_id = raids.id AND status = 'Going' AND member <> ?) >= size
        OR (SELECT COUNT(*) FROM raid_signups WHERE raid_id = raids.id AND status = 'Going' AND role = ? AND member <> ?) >= ?) THEN 'Waitlist'
      ELSE 'Going' END
    FROM raids WHERE id = ? AND state = 'Open'
    ON CONFLICT (raid_id, member) DO UPDATE SET character = excluded.character, class_name = excluded.class_name, role = excluded.role,
    status = excluded.status,
    readiness = CASE WHEN excluded.character = raid_signups.character AND excluded.class_name = raid_signups.class_name THEN raid_signups.readiness ELSE '{}' END,
    readiness_note = CASE WHEN excluded.character = raid_signups.character AND excluded.class_name = raid_signups.class_name THEN raid_signups.readiness_note ELSE '' END,
    reviewed_at = CASE WHEN excluded.character = raid_signups.character AND excluded.class_name = raid_signups.class_name THEN raid_signups.reviewed_at ELSE NULL END,
    group_no = CASE WHEN excluded.status = 'Going' AND excluded.role = raid_signups.role THEN raid_signups.group_no ELSE NULL END`)
    .bind(user, character, input.className, input.role, input.status, input.status, Number(Boolean(settings.review)), Number(Boolean(settings.waitlist)),
      user, input.role, user, roleLimit, id).run();
  if (!result.meta.changes) return reply({ error: 'Sign-ups are closed for this raid.' }, 409);
  return reply({ ok: true });
}

const page = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Solstice Guild</title>
<style>
:root{color-scheme:dark;--bg:#111112;--panel:#1a1817;--raised:#24211f;--line:#423b35;--muted:#bdb4aa;--ink:#f9f6f2;--gold:#ffbd0a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif}
main{max-width:1280px;margin:auto;min-height:100vh;background:#191817;border-inline:1px solid #292725}
h1,h2,p{margin:0}h2{font-size:18px}a{color:var(--gold)}small,footer,p{color:var(--muted)}
button,input,select{font:inherit;color:inherit;background:#181615;border:1px solid var(--line);border-radius:3px;padding:8px 11px}
button,summary{cursor:pointer}button:hover,summary:hover{border-color:var(--gold)}button:disabled{opacity:.45;cursor:default}
:focus-visible{outline:2px solid var(--gold);outline-offset:2px}label{display:block;font-weight:600;margin-bottom:5px}
.masthead{display:flex;align-items:center;gap:11px;padding:12px 22px;background:var(--raised);border-bottom:1px solid #100f0f}
.crest{width:37px;flex:none;color:var(--gold)}.masthead strong{display:block;text-transform:uppercase;font-size:17px;letter-spacing:.12em;line-height:1.1}
.masthead small{font-size:10px;text-transform:uppercase;letter-spacing:.13em}
nav{display:flex;background:#211f1f;border-bottom:1px solid #080808;padding-inline:14px}
nav button{border:0;border-radius:0;border-inline-end:1px solid #111;padding:9px 15px;background:transparent;font-weight:700;font-size:13px}
nav [aria-pressed=true]{color:var(--gold);box-shadow:inset 0 -2px var(--gold);background:#181717}
.hero{position:relative;display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;padding:30px 24px;border-bottom:1px solid #534020;background:radial-gradient(ellipse at 90% -40%,#645026 0%,transparent 67%),linear-gradient(115deg,#242526,#121312 72%);isolation:isolate;overflow:hidden}
.hero::before{content:"";position:absolute;inset:0;z-index:-1;background:repeating-linear-gradient(132deg,transparent 0 23px,#ffffff08 24px,transparent 25px 36px);mask-image:linear-gradient(90deg,transparent 25%,#000)}
.eyebrow{color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
.hero h1{font-size:clamp(29px,5vw,46px);letter-spacing:-.035em;line-height:1.05;margin:6px 0 9px}
.hero-stats{display:flex;gap:1px;border:1px solid #5b4931;background:#5b4931;border-radius:4px;overflow:hidden}
.hero-stats div{padding:9px 13px;background:#181615;min-width:105px}.hero-stats span{display:block;color:var(--muted);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.hero-stats strong{color:var(--ink);font-size:15px;white-space:nowrap}
.board{margin:16px 16px 0;background:var(--panel);border:1px solid var(--line);border-radius:4px}
.auction-toolbar,.toolbar{display:flex;align-items:end;gap:8px;flex-wrap:wrap;padding:10px;background:var(--raised);border-bottom:1px solid var(--line)}
.auction-toolbar{align-items:center}.auction-toolbar input{flex:1;min-width:125px}.market-tag{padding:7px 9px;border:1px solid var(--line);border-radius:3px;font-weight:700;white-space:nowrap;font-size:12px}
.search{flex:1;min-width:200px}.search input{width:100%}.search-button{background:var(--gold);color:#1c1400;font-weight:800;min-width:90px;border-color:var(--gold)}.search-button:hover{background:#ffd354}
.filters{position:relative}.filters summary{padding:7px 10px;background:#181615;border:1px solid var(--line);border-radius:3px;white-space:nowrap}.filters>div{position:absolute;right:0;top:calc(100% + 5px);z-index:2;background:var(--raised);border:1px solid var(--line);padding:10px;border-radius:3px}
.auction-layout{display:grid;grid-template-columns:164px minmax(0,1fr);min-height:420px}
.categories{background:#171616;border-right:1px solid var(--line);padding:10px 8px}
.categories h2{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);margin:3px 5px 9px}
#category{display:grid;gap:3px}.categories button{width:100%;text-align:left;padding:5px 8px;background:var(--raised);font-size:13px}.categories button[aria-pressed=true]{background:#352a13;color:var(--gold);border-color:#98700d}
.results{min-width:0}.status,.pager{padding:10px 13px}.status{font-size:12px}.scroll{overflow:auto}
table{border-collapse:collapse;width:100%;white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}
th,td{padding:7px 12px;border-top:1px solid #37312c}th{background:#24211f;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.035em}
td:first-child,th:first-child{text-align:left}tbody tr:nth-child(even){background:#211e1c}tbody tr:hover{background:#2c251c}
td button{border:0;padding:0;color:var(--ink);background:none;text-align:left}td button:hover{color:var(--gold);text-decoration:underline}.price{color:var(--gold)}
.pager{display:flex;align-items:center;gap:12px;border-top:1px solid var(--line)}footer{padding:14px 16px;font-size:12px}
dialog{max-width:540px;width:calc(100% - 34px);border:1px solid var(--line);border-radius:4px;padding:20px;background:var(--panel);color:var(--ink)}
dialog::backdrop{background:#000b}dialog form{float:right}.history{display:grid;grid-template-columns:1fr 1fr;gap:12px}.metric{border-top:1px solid var(--line);padding:10px 0}.metric strong{display:block;color:var(--gold);margin-top:5px}
.craft-section{padding:13px}.craft-section p{margin-top:4px}.toggle{margin:0;padding:8px 0}.positive{color:#aadea7}.negative{color:#f4a89e}details ul{margin:8px 0;padding-left:20px;white-space:normal}
@media(max-width:640px){.hero{grid-template-columns:1fr;gap:14px;padding:19px 14px}.hero-stats{justify-self:start}.hero-stats div{min-width:0}.masthead{padding-inline:14px}.board{margin:10px 8px 0}.auction-layout{grid-template-columns:1fr}.categories{border-right:0;border-bottom:1px solid var(--line)}#category{display:flex;overflow:auto;padding-bottom:4px}.categories button{width:auto;flex:none}}

.profession-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px;margin-top:14px}
.profession-grid button{display:grid;justify-items:center;gap:8px;padding:12px 5px;color:var(--ink);background:#22201e;font-size:12px;font-weight:700}
.profession-grid button[aria-pressed=true]{background:#342912;border-color:var(--gold);color:var(--gold)}
.profession-grid svg{width:37px;height:37px;padding:6px;border:1px solid #6c542d;border-radius:5px;background:radial-gradient(circle at top,#574021,#231b13);color:var(--gold)}
.recipe-list{display:grid;gap:5px;padding:0 12px 10px}.recipe-card{background:var(--raised);border:1px solid var(--line);border-radius:4px}
.recipe-card[open]{border-color:#806021}.recipe-card summary{list-style:none;display:grid;grid-template-columns:minmax(100px,1fr) repeat(4,minmax(57px,auto)) 13px;gap:12px;align-items:center;padding:8px 11px}
.recipe-card summary::-webkit-details-marker{display:none}.recipe-card summary::after{content:"▾";color:var(--gold)}.recipe-card[open] summary::after{transform:rotate(180deg)}
.recipe-metric{font-size:12px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.recipe-metric small{display:block;font-size:10px;text-transform:uppercase}
.recipe-card ul{border-top:1px solid var(--line);margin:0;padding:8px 12px 8px 29px;color:var(--muted)}.recipe-card p{padding:8px 12px}
.category-group{display:grid;gap:3px}.subcategory-list{display:grid;gap:3px;padding:2px 0 3px 12px}.subcategory-list button{font-size:12px;background:#1d1b19}
.category-group[aria-expanded=false] .subcategory-list{display:none}
@media(max-width:640px){.recipe-card summary{grid-template-columns:repeat(4,minmax(0,1fr)) 12px;gap:5px}.recipe-card summary strong{grid-column:1/-1}.recipe-metric{text-align:left}.category-group{flex:none;align-content:start}.subcategory-list{padding-left:0}}
.item-label{display:inline-flex;align-items:center;gap:7px;vertical-align:middle}
.item-icon{display:inline-grid;place-items:center;position:relative;width:25px;height:25px;flex:none;border:1px solid #64533c;border-radius:4px;background:#28231c;color:#d8af53}
.item-icon::before{content:"◇";font-size:14px}.item-icon img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:3px}

.item-label[href]{text-decoration:none}.item-label[href]:hover,.item-label[href]:focus-visible{text-decoration:underline}

[hidden]{display:none!important}.guild-nav{align-items:center;gap:15px}.guild-nav summary{padding:9px 12px;color:var(--gold);font-weight:750;cursor:pointer}.guild-nav details{position:relative}.guild-nav details>div{position:absolute;top:100%;left:0;z-index:5;min-width:160px;background:var(--panel);border:1px solid var(--line);box-shadow:0 8px 18px #0009}.guild-nav button{display:block;width:100%;text-align:left}
.raid-shell{display:grid;grid-template-columns:190px minmax(0,1fr);min-height:580px;background:radial-gradient(at top right,#13232a,#0b1315 55%);color:#eef6f5}.raid-sidebar{padding:18px 10px;border-right:1px solid #253336;background:#091114}.raid-sidebar button{display:block;width:100%;text-align:left;margin:5px 0;background:transparent;border-color:transparent}.raid-sidebar button[aria-current=true]{background:#163338;color:#a1f2f1}.raid-content{padding:22px clamp(12px,3vw,36px);min-width:0}.raid-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.raid-heading h2{font-size:26px}.raid-primary{display:inline-block;background:#e6f3f2;color:#102225;border:0;font-weight:750;padding:8px 12px;border-radius:5px;text-decoration:none}.raid-card,.raid-stats>div{background:#111d21;border:1px solid #2d4145;border-radius:7px;padding:14px;margin:10px 0}.raid-card h3{margin:0 0 8px}.raid-form label{margin:9px 0}.raid-form label :is(input,select,textarea){display:block;width:100%;margin-top:4px;background:#0c1518;border-color:#42575b}.raid-form textarea{min-height:70px;color:inherit;font:inherit;padding:8px}.raid-form{max-width:740px}.raid-actions,.raid-steps{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.raid-actions input{flex:1;min-width:120px}.raid-steps span{flex:1;border-bottom:2px solid #42575b;padding:6px}.raid-steps span[aria-current=step]{border-color:#64d7d4;color:#a1f2f1}.raid-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:8px}.raid-stats strong{display:block;color:#a1f2f1}.raid-stats>div{margin:4px 0}.raid-row{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;border-top:1px solid #2d4145;padding:9px 0}.raid-row button{background:transparent}.raid-row small{display:block}.raid-shell p{color:#aabdbf}.raid-content #raidMessage{margin:8px 0}
@media(max-width:680px){.raid-shell{grid-template-columns:1fr}.raid-sidebar{display:flex;flex-wrap:wrap;align-items:center;gap:5px;border-right:0;border-bottom:1px solid #253336}.raid-sidebar button{width:auto}.raid-sidebar .eyebrow{width:100%}}
.raid-form .raid-check input{display:inline-block;width:auto;margin:0 6px 0 0}.raid-row .raid-actions{margin:0}.raid-row input{max-width:230px}.guild-account{margin-left:auto;display:flex;align-items:center;gap:8px;padding-right:8px}.guild-account form{margin:0}.guild-account button{white-space:nowrap}.guild-account span{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style>
<script>const whTooltips = { colorLinks: false, iconizeLinks: false, renameLinks: false };</script>
<script src="https://wow.zamimg.com/js/tooltips.js" defer></script>
<link rel="stylesheet" href="/assets/home.css?v=070924b38e38"></head><body class="guild-app"><main>
<div class="guild-topbar"><header class="masthead"><a class="brand" href="/">${solsticeLockup}</a></header>
<nav class="guild-nav" aria-label="Guild tools"><a href="/">Home</a><details id="guildMenu"><summary>Guild tools</summary><div><button id="auctionTab" aria-pressed="true">Auction House</button><button id="professionTab" aria-pressed="false">Professions</button><button id="raidTab" aria-pressed="false">Raid Planner</button></div></details><span id="currentTool">Auction House</span><div class="guild-account"><span id="guildIdentity"></span><form method="post" action="/auth/logout"><button>Sign out</button></form></div></nav></div>
<section id="marketHero" class="hero" aria-labelledby="marketTitle">
<div><div class="eyebrow">Solstice guild tools</div><h1 id="marketTitle">Solstice Market Board</h1><p>US Normal Alliance Auction House and crafting prices</p></div>
<div class="hero-stats" aria-label="Market snapshot"><div><span>Priced items</span><strong id="pricedItems">—</strong></div><div><span>Source scan</span><strong id="scanTime">—</strong></div><div><span>Refresh</span><strong>10 min</strong></div></div>
</section>
<section id="auctionPanel" class="board" aria-label="Market listings">
<form id="searchForm" class="auction-toolbar" role="search" aria-label="Auction House search">
<span class="market-tag">Normal Alliance US</span>
<input id="query" type="search" aria-label="Item name or ID" placeholder="Search by item name or ID" autocomplete="off">
<details class="filters"><summary>Filter</summary><div><label for="sort">Sort by</label><select id="sort"><option value="name">Item name</option><option value="min">Lowest buyout</option><option value="quantity">Most units</option><option value="discount">Biggest discount vs. 30d</option></select></div></details>
<button type="submit" class="search-button">Search</button>
</form>
<div class="auction-layout">
<aside class="categories" aria-label="Auction House categories">
<h2>Categories</h2>
<div id="category"></div>
</aside>
<div class="results">
<p class="status" id="status" role="status">Loading the market feed…</p>
<div class="scroll"><table><thead><tr><th scope="col">Item</th><th scope="col">Lowest buyout</th><th scope="col">Scan median</th><th scope="col">7-day median</th><th scope="col">30-day median</th><th scope="col">Units listed</th></tr></thead><tbody id="rows"></tbody></table></div>
<div class="pager"><button id="previous">Previous</button><small id="count"></small><button id="next">Next</button></div>
</div></div>
</section>
<section id="professionPanel" class="board" aria-label="Professions" hidden>
<div class="craft-section"><div class="eyebrow">Solstice crafting</div><h2>Crafting Professions</h2><p>Choose a profession to browse recipes, margins, and materials on the Auction House.</p>
<div id="professionGrid" class="profession-grid" role="group" aria-label="Crafting professions"></div></div>
<div class="craft-section"><h2 id="recipeHeading">Blacksmithing Recipes</h2><p>Estimated profit per craft after AHledger’s 5% Auction House cut.</p></div>
<div class="toolbar">

<div class="search"><label for="craftQuery">Filter recipes and materials</label><input id="craftQuery" type="search" placeholder="Recipe or material name"></div>
<div><label for="craftSort">Sort recipes</label><select id="craftSort"><option value="profit">Profit</option><option value="cost">Cost</option><option value="name">Name</option><option value="skill">Skill</option></select></div>
<label class="toggle"><input id="profitable" type="checkbox"> Profitable crafts only</label>
<button id="refreshCraft">Refresh</button>
</div>
<p id="craftStatus" class="status" role="status">Choose a profession to see prices.</p>
<div id="craftRows" class="recipe-list"></div>
<div class="craft-section"><h2>Materials on the Auction House</h2><p>Listed reagents used by recipes in the selected profession. Buyouts and quantities are from the latest price table.</p></div>
<div class="scroll"><table><thead><tr><th scope="col">Material</th><th scope="col">Lowest unit buyout</th><th scope="col">Units listed</th><th scope="col">Recipes using it</th></tr></thead><tbody id="materialRows"></tbody></table></div>
</section>
<section id="raidPanel" class="raid-shell" hidden aria-label="Raid Planner">
<aside class="raid-sidebar"><nav aria-label="Raid planner"><div class="raid-nav-group"><div class="eyebrow">Guild workspace</div><label class="working-raid">Working raid<select id="workingRaid" disabled><option>Loading raids…</option></select></label><button data-raid-view="readiness"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8v9H3z M9 20v-6h6v6"/></svg>Raid readiness</button><button data-raid-view="roster"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M13 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm4-4a4 4 0 0 1 0 8"/></svg>Raid roster</button><button data-raid-view="tonight"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4l16 16m-4 0 4-4M20 4 4 20m0-4 4 4"/></svg>Tonight</button></div><div class="raid-nav-group"><div class="eyebrow">Personal</div><button data-raid-view="signups"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z M8 9h8m-8 5h8"/></svg>My sign-ups</button><button data-raid-view="calendar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v15H3z M7 3v6m10-6v6M3 11h18"/></svg>Calendar</button><button data-raid-view="characters"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/></svg>My characters</button></div><div class="raid-nav-group"><div class="eyebrow">Organize</div><button data-raid-view="manage"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-16 5h16m-16 5h16 M8 4v6m8-1v6m-6-1v6"/></svg>Manage raids</button><button data-raid-view="discover"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0zm-2 4 6 6"/></svg>Find a raid</button></div></nav></aside>
<div class="raid-content">
<header class="raid-heading"><div><h2 id="raidTitle">My sign-ups</h2><p id="raidSubtitle">World of Warcraft: Forever · US Normal Alliance</p></div><button id="newRaid" class="raid-primary">+ New raid</button></header>
<p id="raidMessage" role="status"></p><a id="raidSignIn" class="raid-primary" target="_top" hidden>Sign in with Discord</a>
<div id="raidList"></div>
<form id="characterForm" class="raid-card raid-form" hidden>
<h3>Add or update a character</h3><label>Name<input name="name" required maxlength="30"></label><label>Class<select name="className"></select></label><label>Specialization<input name="spec" maxlength="30" placeholder="Optional"></label><label>Role<select name="role"></select></label><button class="raid-primary">Save character</button></form>
<form id="raidCreate" class="raid-card raid-form" hidden>
<div class="raid-steps"><span>1 · Raid details</span><span>2 · Schedule &amp; roster</span><span>3 · Review</span></div>
<div data-step="0"><label>Raid title<input name="title" required maxlength="80" placeholder="Barrow Deeps — Monday"></label><label>Notes<textarea name="notes" maxlength="1000" placeholder="Loot rules, voice chat, and what to bring"></textarea></label></div>
<div data-step="1" hidden><div class="raid-schedule">
  <fieldset class="raid-date-field"><legend>Start date</legend>
    <details id="raidDatePicker"><summary id="raidSelectedDate">Choose a date</summary>
      <div class="raid-calendar">
        <div class="raid-calendar-month"><button type="button" id="raidPreviousMonth" aria-label="Previous month">‹</button><strong id="raidCalendarMonth" aria-live="polite"></strong><button type="button" id="raidNextMonth" aria-label="Next month">›</button></div>
        <div class="raid-calendar-week" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
        <div id="raidCalendarDays" class="raid-calendar-days"></div>
      </div>
    </details>
  </fieldset>
  <fieldset class="raid-time-field"><legend>Start time</legend><div class="raid-time-controls">
    <select id="raidHour" aria-label="Hour"></select><span aria-hidden="true">:</span><input id="raidMinute" aria-label="Minute" type="number" min="0" max="59" value="00" required>
    <select id="raidPeriod" aria-label="AM or PM"><option>AM</option><option selected>PM</option></select>
  </div></fieldset>
  <input type="hidden" name="startsAt">
</div><small id="raidTimezone"></small><label>Raid size<select name="size"><option>10</option><option>20</option><option>40</option></select></label><label>Weekly occurrences<input name="weeks" type="number" min="1" max="12" value="1" required></label><div id="raidRoleSlots" class="raid-stats"></div></div>
<div data-step="2" hidden><div id="raidReview"></div>
<label class="raid-check"><input name="review" type="checkbox"> Organizer approval required</label>
<label class="raid-check"><input name="waitlist" type="checkbox"> Waitlist when a role or roster is full</label>
<label class="raid-check"><input name="listed" type="checkbox"> Show in Find a raid</label>
<label>Requirements<input name="requirements" maxlength="500" placeholder="Minimum level, gear, consumables"></label>
<label>Soft-reserve URL<input name="softReserve" type="url" maxlength="400" placeholder="https://…"></label>
<p>Link-only by default. Each signed-in player can RSVP with one character per raid.</p></div>
<div class="raid-actions"><button type="button" id="raidBack">Back</button><button type="button" id="raidNext" class="raid-primary">Continue</button><button id="raidSubmit" class="raid-primary" hidden>Create raid</button></div>
</form>
<div id="raidDetail" hidden>
<div class="raid-card"><h3>Invite link</h3><div class="raid-actions"><input id="raidLink" readonly aria-label="Invite link"><button id="copyRaid" type="button">Copy link</button></div></div>
<div id="raidControls" class="raid-controls" role="group" aria-label="Raid actions"></div>
<div id="raidStats" class="raid-stats"></div>
<div id="raidRequirements" class="raid-card" hidden></div>
<form id="raidSignup" class="raid-card raid-form">
<h3>Your RSVP</h3><label>Saved character<select id="signupCharacter"><option value="">Enter manually</option></select></label>
<label>Character<input name="character" required maxlength="61"></label><label>Class<select name="className"></select></label><label>Role<select name="role"></select></label><label>Status<select name="status"><option>Going</option><option>Tentative</option><option>Bench</option><option>Declined</option></select></label><button class="raid-primary">Save RSVP</button></form>
<div class="raid-card"><p class="eyebrow">Raid workspace</p><h3>Roster &amp; readiness</h3>
<div id="readinessSummary" class="raid-stats"></div><p class="readiness-caption">Readiness is reviewed by the raid organizer. Counts cover players marked Going.</p>
<div class="roster-filters"><label>Find a character<input id="rosterSearch" type="search" placeholder="Name or class"></label>
<label>Role<select id="rosterRole"><option value="">All roles</option></select></label>
<label>Readiness<select id="rosterReadiness"><option value="">All readiness</option><option>Ready</option><option>Blocked</option><option>Unreviewed</option></select></label>
<label>Filter sign-ups<select id="rosterFilter"><option value="">All statuses</option><option>Going</option><option>Pending</option><option>Waitlist</option><option>Tentative</option><option>Bench</option><option>Declined</option></select></label></div><div id="raidRoster"></div></div>
<div class="raid-card"><h3>Group planner</h3><div id="raidGroups" class="raid-stats"></div></div>
</div>
</div></section>
<footer id="marketFooter"><a href="https://ahledger.com">Prices from AHledger</a> · Player-submitted scans · Feed checked every 10 minutes while open</footer>
<dialog id="detail"><form method="dialog"><button aria-label="Close details">Close</button></form><h2 id="detailTitle"></h2><div id="detailBody"></div></dialog>
<script>
const byId = id => document.getElementById(id);
const rows = byId('rows');
const status = byId('status');
const query = byId('query');
const sort = byId('sort');
const detail = byId('detail');
const names = new Map();
const itemIcons = new Map();
const itemQualities = new Map();
const itemCategories = new Map();
const itemSubcategories = new Map();
const subclassNames = {
  weapon: ['One-Handed Axes','Two-Handed Axes','Bows','Guns','One-Handed Maces','Two-Handed Maces','Polearms','One-Handed Swords','Two-Handed Swords','Warglaives','Staves',null,null,'Fist Weapons','Miscellaneous','Daggers','Thrown',null,'Crossbows','Wands','Fishing Poles'],
  armor: ['Miscellaneous','Cloth','Leather','Mail','Plate','Cosmetic','Shields','Librams','Idols','Totems'],
  container: ['Bags','Soul Bags','Herb Bags','Enchanting Bags','Engineering Bags','Gem Bags','Mining Bags','Leatherworking Bags','Inscription Bags','Tackle Boxes','Cooking Bags'],
  consumable: ['Consumables','Potions','Elixirs','Flasks','Scrolls','Food & Drink','Item Enhancements','Bandages','Other','Vantus Runes'],
  'trade-goods': ['Trade Goods','Parts','Explosives','Devices','Gems','Cloth','Leather','Metal & Stone','Cooking','Herbs','Elemental','Other','Enchanting','Materials','Item Enchantments','Weapon Enchantments','Inscription'],
  projectile: [null,null,'Arrows','Bullets'],
  quiver: [null,null,'Quivers','Ammo Pouches'],
  recipe: ['Books','Leatherworking','Tailoring','Engineering','Blacksmithing','Cooking','Alchemy','First Aid','Enchanting','Fishing','Jewelcrafting','Inscription'],
  miscellaneous: ['Junk','Reagents','Companion Pets','Holiday','Other','Mounts'],
};
const category = byId('category');
const auctionCategories = ${JSON.stringify(auctionCategories)};
const sidebarCategories = [
  ['', 'All categories'], ['weapon', 'Weapons'], ['armor', 'Armor'],
  ['container', 'Containers'], ['consumable', 'Consumables'], ['trade-goods', 'Trade Goods'],
  ['ammo', 'Ammo'], ['recipe', 'Recipes'], ['quest', 'Quest Items'], ['miscellaneous', 'Miscellaneous'],
];
const standardSubcategories = {
  weapon: ['One-Handed', 'Two-Handed', 'Ranged', 'Miscellaneous'],
  armor: ['Cloth', 'Leather', 'Mail', 'Plate', 'Shields', 'Librams', 'Idols', 'Totems', 'Miscellaneous'],
  container: ['Bags', 'Soul Bags', 'Herb Bags', 'Enchanting Bags', 'Engineering Bags', 'Gem Bags', 'Mining Bags', 'Leatherworking Bags'],
  consumable: ['Food & Drink', 'Potions', 'Elixirs', 'Flasks', 'Scrolls', 'Bandages', 'Item Enhancements', 'Other'],
  'trade-goods': ['Cloth', 'Leather', 'Metal & Stone', 'Herbs', 'Enchanting', 'Cooking', 'Elemental', 'Parts', 'Explosives', 'Devices', 'Gems', 'Other'],
  ammo: ['Arrows', 'Bullets', 'Quivers', 'Ammo Pouches'],
  recipe: ['Alchemy', 'Blacksmithing', 'Cooking', 'Enchanting', 'Engineering', 'First Aid', 'Fishing', 'Leatherworking', 'Tailoring', 'Books'],
  miscellaneous: ['Junk', 'Reagents', 'Companion Pets', 'Holiday', 'Mounts', 'Other'],
};

function auctionSubclass(categoryId, title, slot) {
  if (categoryId === 'weapon') {
    const kind = (title ?? '').toLowerCase();
    if (/fishing|miscellaneous/.test(kind)) return 'Miscellaneous';
    if (/^ranged|^thrown/i.test(slot ?? '') || /bow|gun|wand|thrown/.test(kind)) return 'Ranged';
    if (slot === 'TWOHWEAPON' || /two.hand|staff|stave|polearm/.test(kind)) return 'Two-Handed';
    if (/^WEAPON/.test(slot ?? '') || /one.hand|dagger|fist|warglaive/.test(kind)) return 'One-Handed';
    return title ? 'Miscellaneous' : null;
  }
  if (categoryId === 'reagent') return 'Reagents';
  if (categoryId === 'key' || categoryId === 'wow-token') return 'Other';
  if (!title) return null;
  const aliases = {
    bag: 'Bags', potion: 'Potions', elixir: 'Elixirs', flask: 'Flasks', scroll: 'Scrolls',
    bandage: 'Bandages', shield: 'Shields', libram: 'Librams', idol: 'Idols', totem: 'Totems',
    arrow: 'Arrows', bullet: 'Bullets', quiver: 'Quivers', 'ammo pouch': 'Ammo Pouches',
    book: 'Books', mount: 'Mounts', 'companion pet': 'Companion Pets',
    'food and drink': 'Food & Drink', 'metal and stone': 'Metal & Stone',
  };
  const lower = title.toLowerCase();
  const group = categoryId === 'projectile' || categoryId === 'quiver' ? 'ammo' : categoryId;
  return standardSubcategories[group]?.find(value => value.toLowerCase() === lower) ??
    (Object.hasOwn(aliases, lower) ? aliases[lower] : title);
}

let selectedCategory = '';
let selectedSubclass = '';
const categoryGroups = new Map();
for (const [id, title] of sidebarCategories) {
  const group = document.createElement('div');
  group.className = 'category-group';
  group.setAttribute('aria-expanded', 'false');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = title;
  const children = document.createElement('div');
  children.className = 'subcategory-list';
  button.addEventListener('click', () => {
    selectedCategory = id;
    selectedSubclass = '';
    renderCategories();
    pageIndex = 0;
    render();
  });
  group.append(button, children);
  categoryGroups.set(id, { group, button, children });
  category.append(group);
}

function renderCategories() {
  const found = new Map();
  for (const item of items) {
    const parent = listingCategory(item.id);
    const subclass = itemSubcategories.get(item.id);
    if (!parent || !subclass) continue;
    if (!found.has(parent)) found.set(parent, new Set());
    found.get(parent).add(subclass);
  }
  for (const [id, { group, button, children }] of categoryGroups) {
    const standard = standardSubcategories[id] ?? [];
    const additional = [...(found.get(id) ?? [])].filter(value => !standard.includes(value)).sort((a, b) => a.localeCompare(b));
    const options = [...standard, ...additional];
    const open = selectedCategory === id && options.length > 0;
    if (options.length) button.setAttribute('aria-expanded', String(open));
    group.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-pressed', String(selectedCategory === id && !selectedSubclass));
    children.replaceChildren();
    if (!open) continue;
    for (const subclass of options) {
      const option = document.createElement('button');
      option.type = 'button';
      option.textContent = subclass;
      option.setAttribute('aria-pressed', String(selectedSubclass === subclass));
      option.addEventListener('click', () => {
        selectedSubclass = subclass;
        for (const sibling of children.children) sibling.setAttribute('aria-pressed', String(sibling === option));
        button.setAttribute('aria-pressed', 'false');
        pageIndex = 0;
        render();
      });
      children.append(option);
    }
  }
}

function listingCategory(itemId) {
  const catalogCategory = itemCategories.get(itemId);
  if (catalogCategory === 'projectile' || catalogCategory === 'quiver') return 'ammo';
  if (['key', 'reagent', 'wow-token'].includes(catalogCategory)) return 'miscellaneous';
  return catalogCategory;
}
const format = new Intl.NumberFormat();
const pageSize = 40;
let items = [], scan = null, pageIndex = 0, loading = false, message = '', detailRequest = 0;
let lastFeedCheck = 0;
const refreshInterval = 10 * 60 * 1000;
let catalogState = 'Loading item names…';
renderCategories();
const professionTiles = ${JSON.stringify(professionTiles)};
let selectedProfession = professionTiles[0][0];
let craftData = null;
let craftRequest = 0;
const professionGrid = byId('professionGrid');
for (const [name, iconPath] of professionTiles) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-pressed', String(name === selectedProfession));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', iconPath);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  button.append(svg, name);
  button.addEventListener('click', () => {
    selectedProfession = name;
    for (const tile of professionGrid.children) tile.setAttribute('aria-pressed', String(tile === button));
    byId('recipeHeading').textContent = name + ' Recipes';
    loadCrafts();
  });
  professionGrid.append(button);
}

function setView(view) {
  byId('marketFooter').hidden = view === 'raid';
  const showProfessions = view === 'profession';
  const showRaids = view === 'raid';
  byId('raidPanel').hidden = !showRaids;
  byId('marketHero').hidden = showRaids;
  byId('raidTab').setAttribute('aria-pressed', String(showRaids));
  byId('currentTool').textContent = showRaids ? 'Raid Planner' : showProfessions ? 'Professions' : 'Auction House';
  byId('guildMenu').open = false;
  byId('auctionPanel').hidden = view !== 'auction';
  byId('professionPanel').hidden = !showProfessions;
  byId('auctionTab').setAttribute('aria-pressed', String(view === 'auction'));
  byId('professionTab').setAttribute('aria-pressed', String(showProfessions));
  if (showProfessions && !craftData && !craftRequest) loadCrafts();
}

async function loadCrafts() {
  const request = ++craftRequest;
  const selected = selectedProfession;
  craftData = null;
  renderCrafts();
  byId('craftStatus').textContent = 'Loading ' + selected + ' recipes…';
  try {
    const response = await fetch('/crafting/' + encodeURIComponent(selected));
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    if (request !== craftRequest) return;
    if (data.market !== 'forever.normal.alliance.us' || !Array.isArray(data.recipes)) {
      throw new Error('AHledger returned an unexpected recipe response');
    }
    craftData = data;
    renderCrafts();
  } catch (error) {
    if (request === craftRequest) byId('craftStatus').textContent = error.message + '. Use Refresh to try again.';
  }
}

function appendCell(row, value, className) {
  const cell = row.insertCell();
  cell.textContent = value;
  if (className) cell.className = className;
}

function renderCrafts() {
  const craftRows = byId('craftRows');
  const materialRows = byId('materialRows');
  craftRows.replaceChildren();
  materialRows.replaceChildren();
  if (!craftData) return;
  const search = byId('craftQuery').value.trim().toLowerCase();
  const matches = value => String(value ?? '').toLowerCase().includes(search);
  const listings = new Map(items.map(item => [item.id, item]));
  const materials = new Map();
  const recipes = craftData.recipes;
  for (const craft of recipes) {
    const used = new Set();
    for (const reagent of craft.reagents ?? []) {
      const id = Number(reagent.id);
      const listing = listings.get(id);
      if (!listing || listing.quantity <= 0 || listing.min == null || used.has(id)) continue;
      used.add(id);
      if (!materials.has(id)) materials.set(id, { name: reagent.name || label(id), listing, uses: 0 });
      materials.get(id).uses++;
    }
  }
  const visibleCrafts = recipes.filter(craft => {
    const profitable = Number.isFinite(craft.margin) && craft.margin > 0 && !craft.unpriced?.length;
    return (!byId('profitable').checked || profitable) &&
      (matches(craft.recipe?.name) || matches(craft.result?.name) || craft.reagents?.some(reagent => matches(reagent.name)));
  });
  const sortMode = byId('craftSort').value;
  const title = craft => craft.recipe?.name || craft.result?.name || 'Unknown recipe';
  const margin = craft => craft.unpriced?.length || !Number.isFinite(craft.margin) ? null : craft.margin;
  visibleCrafts.sort((a, b) => {
    if (sortMode === 'name') return title(a).localeCompare(title(b));
    if (sortMode === 'skill') return (a.recipe?.skillRequired ?? Infinity) - (b.recipe?.skillRequired ?? Infinity);
    if (sortMode === 'cost') return (a.cost ?? Infinity) - (b.cost ?? Infinity);
    return (margin(b) ?? -Infinity) - (margin(a) ?? -Infinity);
  });
  for (const craft of visibleCrafts) {
    const details = document.createElement('details');
    details.className = 'recipe-card';
    const summary = document.createElement('summary');
    const name = document.createElement('strong');
    const result = itemLabel(craft.result?.id, title(craft), craft.result?.quality);
    name.append(result);
    summary.append(name);
    const profit = margin(craft);
    for (const [label, value, style] of [
      ['Cost', money(craft.cost)], ['Net sale', money(craft.netValue)],
      ['Profit', money(profit), profit > 0 ? 'positive' : profit < 0 ? 'negative' : ''],
      ['Skill', craft.recipe?.skillRequired ?? '—'],
    ]) {
      const cell = document.createElement('span');
      cell.className = 'recipe-metric' + (style ? ' ' + style : '');
      const caption = document.createElement('small');
      caption.textContent = label;
      cell.append(caption, value);
      summary.append(cell);
    }
    details.append(summary);
    const list = document.createElement('ul');
    for (const reagent of craft.reagents ?? []) {
      const entry = document.createElement('li');
      const reagentName = reagent.name || label(reagent.id);
      const reagentLabel = itemLabel(reagent.id, reagentName);
      entry.append(reagent.qty + ' × ', reagentLabel, ' · ' + money(reagent.price) + ' each');
      list.append(entry);
    }
    if (list.childElementCount) details.append(list);
    else {
      const empty = document.createElement('p');
      empty.textContent = 'Ingredient details are unavailable.';
      details.append(empty);
    }
    craftRows.append(details);
  }
  if (!visibleCrafts.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No recipes match these filters.';
    craftRows.append(empty);
  }
  const visibleMaterials = [...materials.values()].filter(material => matches(material.name) || String(material.listing.id) === search)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const material of visibleMaterials) {
    const row = materialRows.insertRow();
    const button = itemLabel(material.listing.id, material.name);
    button.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      showItem(material.listing, material.name);
    });
    row.insertCell().append(button);
    appendCell(row, money(material.listing.min), 'price');
    appendCell(row, format.format(material.listing.quantity));
    appendCell(row, format.format(material.uses));
  }
  const status = [visibleCrafts.length + ' crafts', visibleMaterials.length + ' listed materials'];
  if (craftData.pricesAsOf) status.push('Craft prices as of ' + new Date(craftData.pricesAsOf).toLocaleString());
  if (!scan) status.push('The market price table is unavailable. Listed materials will appear when the feed reconnects.');
  if (craftData.marketStatus !== 'scanned' && craftData.message) status.push(craftData.message);
  byId('craftStatus').textContent = status.join(' · ');
}


function parseTable(raw) {
  const [header, ...lines] = raw.trim().split(/\r?\n/);
  const [version, market, stamp, count] = header.split('|');
  if (version !== 'AHL1' || !['forever/normal/alliance/us', 'forever.normal.alliance.us'].includes(market)) {
    throw new Error('Expected an AHledger AHL1 price table for US Normal Alliance.');
  }
  const timestamp = new Date(Number(stamp) * 1000);
  const parsed = lines.filter(Boolean).map(line => {
    const fields = line.split(':').map(value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null);
    const [id, median, min, quantity, week, month] = fields;
    if (!id || fields.length < 6) throw new Error('The price table contains an invalid row.');
    return { id, median, min, quantity, week, month };
  });
  if (!/^\d+$/.test(stamp) || !Number.isFinite(+timestamp) || !/^\d+$/.test(count) || Number(count) !== parsed.length) {
    throw new Error('The price table header or row count is invalid.');
  }
  return { parsed, timestamp };
}

function money(copper) {
  if (copper == null) return '—';
  const sign = copper < 0 ? '−' : '';
  copper = Math.round(Math.abs(copper));
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor(copper / 100) % 100;
  return sign + [gold && format.format(gold) + 'g', silver && silver + 's', (copper % 100) + 'c'].filter(Boolean).join(' ');
}
function catalogIconUrl(reference) {
  const match = typeof reference === 'string' && reference.match(/^(classic1x-us|us)\|([a-z][a-z0-9_]+)$/i);
  if (!match) return null;
  return 'https://render.worldofwarcraft.com/' + match[1].toLowerCase() + '/icons/56/' + match[2].toLowerCase() + '.jpg';
}

function itemLabel(id, name, quality) {
  const validId = Number.isSafeInteger(Number(id)) && Number(id) > 0;
  const label = document.createElement(validId ? 'a' : 'span');
  if (validId) {
    label.href = 'https://www.wowhead.com/forever/item=' + Number(id);
    label.target = '_blank';
    label.rel = 'noopener noreferrer';
  }
  label.className = 'item-label';
  label.style.color = rarityColor(id, quality);
  const frame = document.createElement('span');
  frame.className = 'item-icon';
  frame.setAttribute('aria-hidden', 'true');
  const source = itemIcons.get(Number(id));
  if (source) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => image.remove(), { once: true });
    image.src = source;
    frame.append(image);
  }
  label.append(frame, name);
  return label;
}

const qualityColors = { POOR:'#aaa', COMMON:'#fff', UNCOMMON:'#65de46', RARE:'#61a8ff', EPIC:'#c88aff', LEGENDARY:'#ff9a48', ARTIFACT:'#e6cc80', HEIRLOOM:'#57d5fa' };
function rarityColor(id, quality) {
  return qualityColors[String(itemQualities.get(Number(id)) ?? quality).toUpperCase()] || 'var(--ink)';
}

const label = id => names.get(id) || 'Item #' + id;
const discount = item => item.month > 0 && item.min != null ? 1 - item.min / item.month : -Infinity;
function render() {
  const search = query.value.trim().toLowerCase();
  const matches = items.filter(item =>
    (!selectedCategory || listingCategory(item.id) === selectedCategory) &&
    (!selectedSubclass || itemSubcategories.get(item.id) === selectedSubclass) &&
    (!search || String(item.id) === search || label(item.id).toLowerCase().includes(search)));
  matches.sort((a, b) => {
    if (sort.value === 'min') return (a.min ?? Infinity) - (b.min ?? Infinity);
    if (sort.value === 'quantity') return (b.quantity ?? -1) - (a.quantity ?? -1);
    if (sort.value === 'discount') return discount(b) - discount(a);
    return Number(names.has(b.id)) - Number(names.has(a.id)) || label(a.id).localeCompare(label(b.id), undefined, { numeric: true });
  });
  const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
  pageIndex = Math.min(pageIndex, totalPages - 1);
  rows.replaceChildren();
  for (const item of matches.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)) {
    const row = rows.insertRow();
    const button = itemLabel(item.id, label(item.id));
    button.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      showItem(item);
    });
    row.insertCell().append(button);
    for (const value of [item.min, item.median, item.week, item.month]) row.insertCell().textContent = money(value);
    row.cells[1].className = discount(item) > 0 ? 'price is-sale' : 'price';
    row.insertCell().textContent = item.quantity == null ? '—' : format.format(item.quantity);
  }
  byId('count').textContent = format.format(matches.length) + ' items · Page ' + (pageIndex + 1) + ' of ' + totalPages;
  byId('previous').disabled = pageIndex === 0;
  byId('next').disabled = pageIndex + 1 >= totalPages;
  status.textContent = [scan && !matches.length && 'No listings match these filters.', loading ? 'Loading the market feed…' : message, scan && 'Source scan ' + scan.toLocaleString(), lastFeedCheck && 'Checked ' + new Date(lastFeedCheck).toLocaleTimeString(), catalogState].filter(Boolean).join(' · ');
}

function useTable(raw, source) {
  const { parsed, timestamp } = parseTable(raw);
  items = parsed;
  scan = timestamp;
  byId('pricedItems').textContent = format.format(items.length);
  const scanTime = byId('scanTime');
  scanTime.textContent = scan.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  scanTime.title = scan.toLocaleString();
  message = source;
  renderCategories();
  renderCrafts();
}

async function refresh() {
  if (loading) return;
  lastFeedCheck = Date.now();
  loading = true;
  render();
  try {
    const response = await fetch('/prices');
    if (!response.ok) throw new Error(await response.text());
    useTable(await response.text(), 'AHledger feed');
  } catch (error) {
    message = error.message + (scan ? '. Showing the previous snapshot.' : '. The feed will retry automatically.');
  } finally {
    loading = false;
    render();
  }
}

function setCatalogItem(id, name, categoryId, record = {}) {
  const raw = record.subclassName ?? record.subClassName ?? record.subclass_name ?? record.subclass ?? record.subClass ??
    record.itemSubclass ?? record.item_subclass ?? record.subclassId ?? record.subClassId ?? record.subclass_id;
  const subclass = raw && typeof raw === 'object' ? raw.name ?? raw.id : raw;
  const title = typeof subclass === 'string' && subclass.trim() && !/^\d+$/.test(subclass)
    ? subclass.trim()
    : subclass != null ? subclassNames[categoryId]?.[Number(subclass)] : null;
  const slot = record.inventoryType ?? record.inventory_type ?? record.slot;
  const group = auctionSubclass(categoryId, title, slot);
  if (group) itemSubcategories.set(id, group);
  const icon = catalogIconUrl(record.icon);
  if (icon) itemIcons.set(id, icon);
  if (typeof record.quality === 'string') itemQualities.set(id, record.quality);
  names.set(id, name);
  itemCategories.set(id, categoryId);
}

function collectNames(value, categoryId) {
  if (!value || typeof value !== 'object') return;
  const id = Number(value.id ?? value.itemId ?? value.item_id ?? value.entry);
  if (id > 0 && typeof value.name === 'string') setCatalogItem(id, value.name, categoryId, value);
  if (Array.isArray(value) && Number.isInteger(value[0]) && typeof value[1] === 'string') {
    const [itemId, name, quality, subclass, , , icon, inventoryType] = value;
    setCatalogItem(itemId, name, categoryId, { subclass, icon, inventoryType, quality });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (!Array.isArray(value) && /^\d+$/.test(key) && typeof child === 'string') setCatalogItem(Number(key), child, categoryId);
    else if (!Array.isArray(value) && /^\d+$/.test(key) && typeof child?.name === 'string') setCatalogItem(Number(key), child.name, categoryId, child);
    else if (typeof child === 'object') collectNames(child, categoryId);
  }
}

async function loadNames() {
  const results = await Promise.allSettled(auctionCategories.map(async ([id, , alternate]) => {
    for (const slug of new Set([id, alternate].filter(Boolean))) {
      const response = await fetch('/catalog/' + slug);
      if (!response.ok) continue;
      const before = itemCategories.size;
      collectNames(await response.json(), id);
      if (itemCategories.size > before) return true;
    }
    return false;
  }));
  const covered = results.filter(result => result.status === 'fulfilled' && result.value).length;
  catalogState = covered === auctionCategories.length ? '' :
    covered ? 'Some catalog categories are unavailable. Unmatched items appear under All categories.' :
    'Item catalog unavailable. Search by item ID.';
  renderCrafts();
  renderCategories();
  render();
  renderCrafts();
}

async function showItem(item, name = label(item.id)) {
  const request = ++detailRequest;
  byId('detailTitle').textContent = name;
  byId('detailTitle').style.color = rarityColor(item.id);
  const body = byId('detailBody');
  body.replaceChildren();
  const summary = document.createElement('p');
  summary.textContent = 'Item #' + item.id + ' · Loading seven-day history…';
  body.append(summary);
  detail.showModal();
  try {
    const response = await fetch('/item/' + item.id);
    if (!response.ok) throw new Error('History unavailable.');
    const data = await response.json();
    if (request !== detailRequest || !detail.open) return;
    if (typeof data.item?.name === 'string') {
      names.set(item.id, data.item.name);
      byId('detailTitle').textContent = label(item.id);
      byId('detailTitle').style.color = rarityColor(item.id, data.item.quality);
      render();
    }
    summary.textContent = data.latest?.observedAt ? 'Latest observation ' + new Date(data.latest.observedAt).toLocaleString() : 'No recent scan for this item.';
    const metrics = document.createElement('div');
    metrics.className = 'history';
    for (const [key, value] of [['Lowest buyout', money(data.latest?.minBuyout)], ['7-day median', money(data.latest?.median7d)], ['30-day median', money(data.latest?.median30d)], ['Units listed', data.latest?.quantity == null ? '—' : format.format(data.latest.quantity)]]) {
      const metric = document.createElement('div');
      metric.className = 'metric';
      metric.textContent = key;
      const number = document.createElement('strong');
      number.textContent = value;
      metric.append(number);
      metrics.append(metric);
    }
    body.append(metrics);
  } catch {
    if (request === detailRequest) summary.textContent = 'Item #' + item.id + ' · Latest item details unavailable.';
  }
}

byId('searchForm').addEventListener('submit', event => {
  event.preventDefault();
  pageIndex = 0;
  render();
});
query.addEventListener('search', () => { pageIndex = 0; render(); });
sort.addEventListener('change', () => { pageIndex = 0; render(); });
byId('previous').addEventListener('click', () => { pageIndex--; render(); });
byId('next').addEventListener('click', () => { pageIndex++; render(); });
const raidClasses = ${JSON.stringify(raidClasses)};
const raidRoles = ${JSON.stringify(raidRoles)};
const raidForm = byId('raidCreate');
const characterForm = byId('characterForm');
const signupForm = byId('raidSignup');
let activeRaidData = null;
let activeRaid = null, raidView = 'signups', wizardStep = 0, raidRevision = 0, savedCharacters = [];
for (const form of [characterForm, signupForm]) {
  for (const name of raidClasses) form.elements.className.add(new Option(name, name));
  for (const role of raidRoles) form.elements.role.add(new Option(role, role));
}

const roleSlotFields = raidRoles.map(role => {
  const label = document.createElement('label');
  label.textContent = role;
  const field = document.createElement('input');
  field.type = 'number'; field.min = '0'; field.max = '40'; field.required = true;
  label.append(field);
  byId('raidRoleSlots').append(label);
  return field;
});
function resetRoleSlots() {
  const size = Number(raidForm.elements.size.value);
  [2, size === 10 ? 2 : size === 20 ? 4 : 8].forEach((value, index) => roleSlotFields[index].value = value);
  const dps = size - Number(roleSlotFields[0].value) - Number(roleSlotFields[1].value);
  roleSlotFields[2].value = Math.floor(dps / 2);
  roleSlotFields[3].value = Math.ceil(dps / 2);
}
raidForm.elements.size.addEventListener('change', resetRoleSlots);
const raidDate = value => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
function raidElement(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function raidRequest(path = '', data) {
  return guildRequest('/api/' + (path === 'characters' ? 'raid-characters' : 'raids' + path),data);
}
function armoryRequest(path = '', data) { return guildRequest('/api/armory'+path,data); }
async function guildRequest(path,data) {
  const response = await fetch(path, data ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  } : undefined);
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Raid Planner request failed.');
    error.status = response.status;
    throw error;
  }
  return result;
}
function raidError(error) {
  byId('raidMessage').textContent = error.message;
  if (error.status === 401) {
    const link = byId('raidSignIn');
    link.href = '/auth/discord?next=' + encodeURIComponent(location.pathname + location.search);
    link.hidden = false;
    byId('newRaid').hidden = true;
  }
}
function raidReset(view, id) {
  raidView = view;
  activeRaid = id || null;
  for (const node of document.querySelectorAll('[data-raid-view]')) node.setAttribute('aria-current', String(node.dataset.raidView === view));
  byId('raidTitle').textContent = { readiness:'Raid readiness', roster:'Raid roster', tonight:'Tonight', signups:'My sign-ups', characters:'My characters', calendar:'Raid calendar', discover:'Find a raid', manage:'Manage raids', new:'New raid', detail:'Raid details' }[view];
  byId('raidSubtitle').textContent = {
    readiness:'See which raid requirements are met and which still need attention.',
    roster:'Review sign-ups, raid blockers, and the checks behind each character’s status.',
    tonight:'Plan the evening around raid blockers, available players, and the work that fits.',
  }[view] ?? 'World of Warcraft: Forever · US Normal Alliance';
  byId('raidMessage').textContent = '';
  byId('raidSignIn').hidden = true;
  byId('newRaid').hidden = view === 'new';
  byId('raidList').replaceChildren();
  characterForm.hidden = true;
  raidForm.hidden = true;
  byId('raidDetail').hidden = true;
}
function raidStats(target, values) {
  target.replaceChildren();
  for (const [name, value] of values) {
    const box = raidElement('div');
    box.append(raidElement('small', name), raidElement('strong', value));
    target.append(box);
  }
}
async function openRaidView(view, id, navigate = true) {
  if (navigate) writeRoute('raid', view, id);
  setView('raid');
  raidReset(view, id);
  const revision = ++raidRevision;
  try {
    if (workspaceViews.includes(view)) {
      await openRaidWorkspace(view, revision);
      return;
    }
    if (['detail','characters','discover'].includes(view)) {
      loadWorkingRaids(revision).catch(error=>{
        if (revision !== raidRevision) return;
        workingRaid.replaceChildren(new Option('Raids unavailable',''));
        workingRaid.disabled = true;
        if (error.status === 401) raidError(error);
      });
    }
    if (view === 'detail') {
      const [data, chars] = await Promise.all([raidRequest('/' + id), raidRequest('characters')]);
      if (revision !== raidRevision) return;
      savedCharacters = chars.signupCharacters;
      activeRaidData = data;
      byId('rosterFilter').value = '';
      renderRaid(data);
      return;
    }
    if (view === 'characters') {
      const { characters } = await raidRequest('characters');
      if (revision !== raidRevision) return;
      characterForm.hidden = false;
      renderArmory(byId('raidList'));
      for (const item of characters) {
        const card = raidElement('div', null, 'raid-card');
        card.append(raidElement('h3', item.name), raidElement('p', [item.class_name,item.spec,item.role].filter(Boolean).join(' · ')));
        const edit = raidElement('button', 'Edit');
        edit.addEventListener('click', () => {
          characterForm.elements.name.value = item.name;
          characterForm.elements.className.value = item.class_name;
          characterForm.elements.spec.value = item.spec;
          characterForm.elements.role.value = item.role;
          characterForm.elements.name.focus();
        });
        card.append(edit);
        byId('raidList').append(card);
      }
      if (!characters.length) byId('raidList').append(raidElement('p', 'Save your first character to reuse it on sign-ups.'));
      return;
    }
    const { raids } = view === 'discover' ? await raidRequest('?discover=1') : await loadWorkingRaids(revision);
    if (revision !== raidRevision) return;
    if (view === 'new') {
      raidForm.hidden = false;
      resetRoleSlots();
      setWizardStep(0);
      return;
    }
    const visible = view === 'manage' ? raids.filter(raid => raid.organizer) :
      view === 'calendar' ? [...raids].sort((a,b) => a.starts_at.localeCompare(b.starts_at)) : raids;
    const upcoming = visible.filter(raid => +new Date(raid.starts_at) >= Date.now());
    const summary = raidElement('div', null, 'raid-stats');
    raidStats(summary, [['Upcoming raids',upcoming.length],['Your organized raids',visible.filter(raid => raid.organizer).length],['Total events',visible.length]]);
    const list = raidElement('div', null, 'raid-card');
    list.append(raidElement('h3', view === 'manage' ? 'Raids you organize' : view === 'discover' ? 'Open listed raids' : view === 'calendar' ? 'Scheduled events' : 'Your raid activity'));
    if (!visible.length) list.append(raidElement('p', 'No raids yet. Create one or open a guild invite link.'));
    for (const raid of visible) {
      const row = raidElement('div', null, 'raid-row');
      const title = raidElement('div');
      title.append(raidElement('strong',raid.title),raidElement('small',raidDate(raid.starts_at)+' · '+raid.size+' players · '+raid.state));
      const open = raidElement('button','Open raid');
      open.addEventListener('click', () => openRaidView('detail',raid.id));
      row.append(title,open);
      list.append(row);
    }
    byId('raidList').append(summary,list);
  } catch (error) {
    if (revision === raidRevision) raidError(error);
  }
}
function workspaceSteps(view) {
  const strip = raidElement('div',null,'workspace-steps raid-card');
  for (const [target,title,sub] of [
    ['readiness','See readiness','Start with the raid goal'],
    ['roster','Find the blockers','Inspect a character'],
    ['tonight','Plan useful work','Build tonight’s assignments'],
  ]) {
    const step = raidElement('button');
    step.setAttribute('aria-current', String(view === target));
    step.append(raidElement('strong',title),raidElement('small',sub));
    step.addEventListener('click',()=>openRaidView(target));
    strip.append(step);
  }
  return strip;
}

const workspaceViews = ['readiness','roster','tonight'];
const workingRaid = byId('workingRaid');
const workingRaidKey = 'solstice.workingRaid';
let workspaceGoal;
try { workspaceGoal = sessionStorage.getItem(workingRaidKey); } catch {}

function setWorkingRaid(id) {
  workspaceGoal = id;
  try { sessionStorage.setItem(workingRaidKey,id); } catch {}
}
workingRaid.addEventListener('change',()=>{
  if (!workingRaid.value) return;
  setWorkingRaid(workingRaid.value);
  openRaidView(workspaceViews.includes(raidView) ? raidView : 'readiness');
});

async function loadWorkingRaids(revision) {
  const result = await raidRequest();
  if (revision !== raidRevision) return result;
  const events = result.raids.filter(raid=>raid.state !== 'Cancelled');
  if (!events.length) {
    workingRaid.replaceChildren(new Option('No raids available',''));
    workingRaid.disabled = true;
    return result;
  }
  const next = [...events].reverse().find(raid=>Date.parse(raid.starts_at) >= Date.now());
  const selected = events.find(raid=>raid.id === workspaceGoal) ?? next ?? events[0];
  workingRaid.replaceChildren(...events.map(raid=>{
    const label = raid.title+' · '+raidDate(raid.starts_at);
    const option = new Option(label,raid.id);
    option.title = label;
    return option;
  }));
  workingRaid.value = selected.id;
  workingRaid.title = workingRaid.selectedOptions[0].text;
  workingRaid.disabled = false;
  setWorkingRaid(selected.id);
  return result;
}
const prepCategories = ${JSON.stringify(prepCategories)};
${schedulePrep.toString()}
${renderTonight.toString()}
${renderArmory.toString()}
${renderArmoryProfile.toString()}

async function openRaidWorkspace(view, revision) {
  await loadWorkingRaids(revision);
  if (revision !== raidRevision) return;
  const root = byId('raidList');
  root.append(workspaceSteps(view));
  if (!workingRaid.value) {
    const empty = raidElement('section',null,'raid-card workspace-empty');
    empty.append(raidElement('p','Guild workspace','eyebrow'),raidElement('h3','Set your first raid goal'),
      raidElement('p','Create a raid to track readiness, build a roster and plan your preparation.'));
    const create = raidElement('button','Create a raid','raid-primary');
    create.addEventListener('click',()=>openRaidView('new'));
    const discover = raidElement('button','Find a raid');
    discover.addEventListener('click',()=>openRaidView('discover'));
    const actions = raidElement('div',null,'raid-actions');
    actions.append(create,discover); empty.append(actions); root.append(empty);
    return;
  }
  const content = raidElement('div');
  root.append(content);
  content.append(raidElement('p','Loading working raid…'));
  const data = await raidRequest('/'+workspaceGoal + (view === 'roster' ? '?armory=1' : view === 'tonight' ? '?prep=1' : ''));
  if (revision !== raidRevision) return;
  content.replaceChildren();
  if (view === 'readiness') renderReadinessWorkspace(content,data);
  else if (view === 'roster') renderRosterWorkspace(content,data);
  else renderTonight(content,data);
}

function renderReadinessWorkspace(root,{event,roster}) {
  const going = roster.filter(row=>row.status === 'Going');
  const reviewed = going.filter(row=>row.reviewed_at);
  const blocked = going.filter(row=>readinessOf(row) === 'Blocked');
  const ready = going.filter(row=>readinessOf(row) === 'Ready');
  const access = going.filter(row=>row.readiness?.access === 'Blocked').length;
  const goal = raidElement('section',null,'workspace-goal raid-card');
  const intro = raidElement('div');
  intro.append(raidElement('p','Solstice raid goal','eyebrow'),raidElement('h3','Get ready for '+event.title),
    raidElement('p',raidDate(event.starts_at)+' · '+event.size+' players'));
  const targets = event.settings?.roles;
  if (targets) intro.append(raidElement('p',raidRoles.map(role=>targets[role]+' '+role.toLowerCase()).join(' · ')));
  if (event.settings?.requirements) intro.append(raidElement('p',event.settings.requirements));
  const inspect = raidElement('button','Inspect the raid team →','raid-primary');
  inspect.addEventListener('click',()=>openRaidView('roster'));
  const plan = raidElement('button','Plan tonight’s preparation');
  plan.addEventListener('click',()=>openRaidView('tonight'));
  const actions = raidElement('div',null,'raid-actions');
  const details = raidElement('button','Open raid details');
  details.addEventListener('click',()=>openRaidView('detail',event.id));
  actions.append(inspect,plan,details); intro.append(actions);
  const issue = raidElement('div');
  const status = blocked.length ? 'Known blockers' : !going.length || ready.length !== going.length ? 'Review needed' : 'Character checks met';
  issue.append(raidElement('p',status,'eyebrow'),raidElement('h3', access ? access+(access === 1 ? ' raider needs raid access.' : ' raiders need raid access.') :
    blocked.length ? blocked.length+(blocked.length === 1 ? ' raider has a known blocker.' : ' raiders have a known blocker.') : !going.length ? 'No confirmed raiders yet.' :
    ready.length !== going.length ? 'Some character checks are still unreviewed.' : 'All going raiders meet the reviewed checks.'),
    raidElement('p',ready.length+' of '+going.length+' confirmed raiders meet all character checks.'),
    raidElement('small','Readiness is based on organizer reviews. Team composition and shared supplies still need review.'));
  goal.append(intro,issue);
  const stats = raidElement('div',null,'raid-stats workspace-metrics');
  const checks = going.flatMap(row=>readinessChecks.map(([key])=>row.readiness?.[key])).filter(value=>value === 'Ready' || value === 'Blocked');
  const percent = checks.length ? Math.round(checks.filter(value=>value==='Ready').length/checks.length*100)+'%' : '—';
  raidStats(stats,[['Characters reviewed',reviewed.length+'/'+going.length],['Meet character requirements',ready.length+'/'+going.length],['Known checks passed',percent]]);
  const activity = raidElement('section',null,'raid-card workspace-activity');
  activity.append(raidElement('p','Raid preparation activity','eyebrow'),raidElement('h3','What changed?'));
  const recent = [...roster].filter(row=>row.reviewed_at).sort((a,b)=>b.reviewed_at.localeCompare(a.reviewed_at)).slice(0,5);
  if (!recent.length) activity.append(raidElement('p','No character reviews have been recorded for this raid.'));
  for (const player of recent) {
    const row = raidElement('div',null,'raid-row');
    row.append(raidElement('strong',player.character+' · '+readinessOf(player)),raidElement('small',raidDate(player.reviewed_at)));
    if (player.readiness_note) row.append(raidElement('p',player.readiness_note));
    activity.append(row);
  }
  root.append(goal,stats,activity);
}

function renderRosterWorkspace(root,{event,organizer,roster}) {
  const note = raidElement('p','Readiness follows the selected raid character. Open a raider to inspect their readiness checks.','raid-card');
  const columns = raidElement('div',null,'workspace-roster');
  const list = raidElement('section',null,'raid-card');
  const detail = raidElement('aside',null,'raid-card workspace-inspector');
  const filters = raidElement('div',null,'roster-filters');
  const search = raidElement('input');
  search.type='search'; search.placeholder='Search raiders…'; search.setAttribute('aria-label','Search raiders');
  const state = raidElement('select');
  state.setAttribute('aria-label','Readiness filter');
  for (const value of ['','Ready','Blocked','Unreviewed']) state.add(new Option(value || 'All readiness states',value));
  filters.append(search,state);
  const rows = raidElement('div');
  list.append(filters,rows);
  columns.append(list,detail);
  root.append(note,columns);
  let selected;
  function inspect(player) {
    detail.replaceChildren(raidElement('p','Character inspector','eyebrow'));
    if (!player) { detail.append(raidElement('p','No raider selected.')); return; }
    detail.append(raidElement('h3',player.character),raidElement('p',[player.class_name,player.role,player.status].join(' · ')));
    const checks = reviewCharacter(event,player,organizer);
    checks.open = true;
    detail.append(checks);
    if (player.armorySlug) {
      const armory = raidElement('details',null,'armory-inspector');
      armory.append(raidElement('summary','Armory · gear, enchants & professions'));
      const panel = raidElement('div');
      armory.append(panel);
      armory.addEventListener('toggle',async()=>{
        if (!armory.open || panel.childNodes.length) return;
        panel.append(raidElement('p','Loading the Armory…'));
        try {
          const {character} = await armoryRequest('?name='+encodeURIComponent(player.armorySlug));
          panel.replaceChildren(renderArmoryProfile(character));
        } catch (error) { panel.replaceChildren(raidElement('p',error.message)); }
      });
      detail.append(armory);
    }
    const manage = raidElement('button','Open raid & assignments');
    manage.addEventListener('click',()=>openRaidView('detail',event.id));
    detail.append(manage);
  }
  function draw() {
    const query = search.value.trim().toLowerCase();
    const visible = roster.filter(row=>(!state.value || readinessOf(row)===state.value) &&
      (!query || (row.character+' '+row.class_name+' '+row.role).toLowerCase().includes(query)));
    if (!visible.includes(selected)) selected = visible[0];
    rows.replaceChildren();
    for (const player of visible) {
      const row = raidElement('button',null,'workspace-player');
      row.setAttribute('aria-current',String(player===selected));
      const title = raidElement('span');
      title.append(raidElement('strong',player.character),raidElement('small',player.class_name+' · '+player.role));
      const status = readinessOf(player);
      const known = readinessChecks.filter(([key])=>['Ready','Blocked','Not applicable'].includes(player.readiness?.[key])).length;
      row.append(title,raidElement('span',status,'readiness-badge '+status.toLowerCase()),
        raidElement('small',known+'/'+readinessChecks.length+' checks reviewed'));
      row.addEventListener('click',()=>{
        selected=player;
        for (const item of rows.children) item.setAttribute('aria-current',String(item===row));
        inspect(player);
      });
      rows.append(row);
    }
    if (!visible.length) rows.append(raidElement('p','No raiders match this view.'));
    inspect(selected);
  }
  search.addEventListener('input',draw);
  state.addEventListener('change',draw);
  draw();
}

const raidDatePicker = byId('raidDatePicker');
const raidHour = byId('raidHour');
for (let hour = 1; hour <= 12; hour++) {
  const option = new Option(hour,hour,hour === 7,hour === 7);
  raidHour.add(option);
}
const raidDayLabel = new Intl.DateTimeFormat(undefined,{dateStyle:'full'});
const raidMonthLabel = new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'});
let selectedRaidDay;
let raidMonth;

function localRaidDay(date) {
  return new Date(date.getFullYear(),date.getMonth(),date.getDate());
}

function drawRaidCalendar() {
  const today = localRaidDay(new Date());
  byId('raidCalendarMonth').textContent = raidMonthLabel.format(raidMonth);
  byId('raidPreviousMonth').disabled = raidMonth <= new Date(today.getFullYear(),today.getMonth(),1);
  const days = byId('raidCalendarDays');
  days.replaceChildren();
  for (let gap = 0; gap < raidMonth.getDay(); gap++) days.append(raidElement('span'));
  const last = new Date(raidMonth.getFullYear(),raidMonth.getMonth()+1,0).getDate();
  for (let day = 1; day <= last; day++) {
    const date = new Date(raidMonth.getFullYear(),raidMonth.getMonth(),day);
    const button = raidElement('button',day);
    button.type = 'button';
    button.disabled = date < today;
    button.setAttribute('aria-label',raidDayLabel.format(date));
    button.setAttribute('aria-pressed',String(+date === +selectedRaidDay));
    if (+date === +today) button.setAttribute('aria-current','date');
    button.addEventListener('click',()=>{
      selectedRaidDay = date;
      byId('raidSelectedDate').textContent = raidDayLabel.format(date);
      raidDatePicker.open = false;
      byId('raidSelectedDate').focus();
      drawRaidCalendar();
    });
    days.append(button);
  }
}
for (const [id,offset] of [['raidPreviousMonth',-1],['raidNextMonth',1]]) {
  byId(id).addEventListener('click',()=>{
    raidMonth = new Date(raidMonth.getFullYear(),raidMonth.getMonth()+offset,1);
    drawRaidCalendar();
    if (byId(id).disabled) byId('raidNextMonth').focus();
  });
}
raidForm.addEventListener('reset',()=>{
  selectedRaidDay = undefined;
  byId('raidSelectedDate').textContent = 'Choose a date';
  raidDatePicker.open = false;
});
raidDatePicker.addEventListener('toggle',()=>{
  if (!raidDatePicker.open) return;
  const date = selectedRaidDay ?? new Date();
  raidMonth = new Date(date.getFullYear(),date.getMonth(),1);
  drawRaidCalendar();
});

function raidStartTime() {
  if (!selectedRaidDay || !byId('raidMinute').checkValidity()) return null;
  const hours = Number(raidHour.value)%12 + (byId('raidPeriod').value === 'PM' ? 12 : 0);
  const minutes = Number(byId('raidMinute').value);
  const date = new Date(selectedRaidDay);
  date.setHours(hours,minutes,0,0);
  return date.getHours() === hours && date.getMinutes() === minutes ? date : null;
}

function setWizardStep(step) {
  wizardStep = step;
  for (const node of raidForm.querySelectorAll('[data-step]')) node.hidden = Number(node.dataset.step) !== step;
  [...raidForm.querySelectorAll('.raid-steps span')].forEach((node, index) => node.setAttribute('aria-current',index === step ? 'step' : 'false'));
  byId('raidNext').hidden = step === 2;
  byId('raidSubmit').hidden = step !== 2;
  byId('raidTimezone').textContent = 'Your local time · '+Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (step === 2) {
    const data = new FormData(raidForm);
    byId('raidReview').replaceChildren(raidElement('h3',data.get('title')),raidElement('p',raidDate(data.get('startsAt'))+' · '+data.get('size')+' players'),raidElement('p',data.get('notes')));
  }
}
const readinessChecks = ${JSON.stringify(readinessChecks)};
const readinessValues = ${JSON.stringify(readinessValues)};
for (const role of raidRoles) byId('rosterRole').add(new Option(role, role));

function readinessOf(player) {
  const states = readinessChecks.map(([key]) => player.readiness?.[key] ?? 'Unreviewed');
  if (states.includes('Blocked')) return 'Blocked';
  if (states.includes('Unreviewed')) return 'Unreviewed';
  return 'Ready';
}

function reviewCharacter(event, player, organizer) {
  const details = raidElement('details', null, 'readiness-details');
  details.append(raidElement('summary','Character checks'));
  if (player.reviewed_at) details.append(raidElement('p','Reviewed '+raidDate(player.reviewed_at)));
  const grid = raidElement('div',null,'readiness-checks');
  if (!organizer) {
    for (const [key, title] of readinessChecks) {
      const item = raidElement('div');
      item.append(raidElement('small',title),raidElement('strong',player.readiness?.[key] ?? 'Unreviewed'));
      grid.append(item);
    }
    details.append(grid);
    if (player.readiness_note) details.append(raidElement('p',player.readiness_note));
    return details;
  }
  const form = raidElement('form');
  const fields = readinessChecks.map(([key,title]) => {
    const label = raidElement('label',title);
    const select = raidElement('select');
    for (const value of readinessValues) select.add(new Option(value,value));
    select.value = player.readiness?.[key] ?? 'Unreviewed';
    label.append(select); grid.append(label);
    return [key,select];
  });
  const note = raidElement('input');
  note.placeholder = 'Shared readiness note'; note.maxLength = 400; note.value = player.readiness_note ?? '';
  note.setAttribute('aria-label','Shared readiness note for '+player.character);
  const save = raidElement('button','Save review','raid-primary');
  const actions = raidElement('div',null,'raid-actions');
  actions.append(note,save);
  form.append(grid,actions);
  form.addEventListener('submit', async e => {
    e.preventDefault(); save.disabled = true;
    try {
      await changeRaid(event.id,{action:'readiness',member:player.member,character:player.character,
        checks:Object.fromEntries(fields.map(([key,field]) => [key,field.value])),note:note.value});
    } finally { save.disabled = false; }
  });
  details.append(form);
  return details;
}

function renderRaid({ event, organizer, roster, mine }) {
  byId('raidTitle').textContent = event.title;
  byId('raidSubtitle').textContent = raidDate(event.starts_at) + ' · ' + event.size + ' players · US Normal Alliance';
  byId('raidMessage').textContent = event.notes;
  const config = event.settings ?? {};
  const controls = byId('raidControls');
  const status = raidElement('span',event.state,'raid-state');
  status.dataset.state = event.state;
  const calendar = raidElement('button','Add to calendar');
  calendar.type = 'button';
  calendar.addEventListener('click', () => downloadRaidCalendar(event));
  const actions = raidElement('div',null,'raid-control-buttons');
  actions.append(calendar);
  controls.replaceChildren(status,actions);
  if (organizer) {
    for (const state of [event.state === 'Open' ? 'Locked' : 'Open', 'Cancelled']) {
      if (event.state === state) continue;
      const button = raidElement('button',{ Open:'Reopen sign-ups', Locked:'Lock sign-ups', Cancelled:'Cancel raid' }[state],
        state === 'Cancelled' ? 'raid-control-danger' : undefined);
      button.type = 'button';
      button.addEventListener('click', () => {
        if (state === 'Cancelled' && !window.confirm('Cancel this raid and close sign-ups?')) return;
        changeRaid(event.id, { action:'state', state });
      });
      actions.append(button);
    }
  }
  signupForm.hidden = event.state !== 'Open';
  const requirements = byId('raidRequirements');
  requirements.replaceChildren();
  requirements.hidden = !config.requirements && !config.softReserve;
  if (config.requirements) requirements.append(raidElement('p',config.requirements));
  if (config.softReserve) {
    const link = raidElement('a','Open soft reserves');
    link.href = config.softReserve; link.target = '_blank'; link.rel = 'noopener noreferrer';
    requirements.append(link);
  }
  const signupUrl = new URL('/',location.origin);
  signupUrl.search = new URLSearchParams({tool:'raid',raid:event.id});
  byId('raidLink').value = signupUrl.href;
  const going = roster.filter(row => row.status === 'Going');
  raidStats(byId('raidStats'), [...raidRoles.map(role => [role, going.filter(row => row.role === role).length + (config.roles ? ' / ' + config.roles[role] : '')]),['Going / capacity',going.length + ' / ' + event.size]]);
  const picker = byId('signupCharacter');
  picker.replaceChildren(new Option('Enter manually',''));
  savedCharacters.forEach((item,index) => picker.add(new Option(item.name+' · '+item.class_name,String(index))));
  signupForm.reset();
  if (mine) {
    signupForm.elements.character.value = mine.character;
    signupForm.elements.className.value = mine.class_name;
    signupForm.elements.role.value = mine.role;
    signupForm.elements.status.value = ['Pending','Waitlist'].includes(mine.status) ? 'Going' : mine.status;
    byId('raidMessage').textContent = [event.notes, 'Your RSVP: '+mine.status].filter(Boolean).join(' · ');
  }
  renderRoster({ event, organizer, roster });
  const groups = byId('raidGroups');
  groups.replaceChildren();
  for (let group = 1; group <= event.size/5; group++) {
    const card = raidElement('div');
    const assigned = going.filter(row => row.group_no === group);
    card.append(raidElement('strong','Group '+group+' · '+assigned.length+'/5'));
    for (const player of assigned) card.append(raidElement('p',player.character+' · '+player.role));
    groups.append(card);
  }
  byId('raidDetail').hidden = false;
  signupForm.hidden = event.state !== 'Open';
}

function renderRoster({ event, organizer, roster }) {
  const going = roster.filter(player => player.status === 'Going');
  raidStats(byId('readinessSummary'), ['Ready','Blocked','Unreviewed'].map(value =>
    [value, going.filter(player => readinessOf(player) === value).length]));
  const rows = byId('raidRoster');
  rows.replaceChildren();
  const filter = byId('rosterFilter').value;
  const role = byId('rosterRole').value;
  const readiness = byId('rosterReadiness').value;
  const search = byId('rosterSearch').value.trim().toLowerCase();
  const visibleRoster = roster.filter(player =>
    (!filter || player.status === filter) && (!role || player.role === role) &&
    (!readiness || readinessOf(player) === readiness) &&
    (!search || (player.character+' '+player.class_name).toLowerCase().includes(search)));
  if (!visibleRoster.length) rows.append(raidElement('p','No sign-ups match this view.'));
  for (const player of visibleRoster) {
    const row = raidElement('div',null,'raid-row');
    const playerInfo = raidElement('div');
    playerInfo.append(raidElement('strong',player.character),raidElement('small',player.class_name+' · '+player.role+' · '+player.status));
    const readinessState = readinessOf(player);
    playerInfo.append(raidElement('span', readinessState, 'readiness-badge '+readinessState.toLowerCase()));
    if (player.assignment) playerInfo.append(raidElement('p', player.assignment));
    row.append(playerInfo);
    if (organizer) {
      const actions = raidElement('div',null,'raid-actions');
      const review = raidElement('select');
      review.setAttribute('aria-label','Review RSVP for '+player.character);
      review.add(new Option('Review RSVP',''));
      for (const status of ['Going','Bench','Waitlist','Declined']) review.add(new Option(status,status));
      review.addEventListener('change', () => { if (review.value) changeRaid(event.id,{action:'review',member:player.member,status:review.value}); });
      const assignment = raidElement('input');
      assignment.placeholder = 'Raid assignment'; assignment.value = player.assignment; assignment.maxLength = 160;
      assignment.setAttribute('aria-label','Assignment for '+player.character);
      assignment.addEventListener('change',()=>changeRaid(event.id,{action:'assignment',member:player.member,assignment:assignment.value}));
      actions.append(review,assignment); row.append(actions);
    }
    if (organizer && player.status === 'Going') {
      const select = raidElement('select');
      select.setAttribute('aria-label','Group for '+player.character);
      select.add(new Option('Unassigned',''));
      for (let group = 1; group <= event.size/5; group++) select.add(new Option('Group '+group,String(group)));
      select.value = player.group_no ?? '';
      select.addEventListener('change', async () => {
        select.disabled = true;
        try {
          await raidRequest('/'+event.id,{ action:'assign', member:player.member, group:select.value ? Number(select.value) : null });
          if (activeRaid === event.id) await openRaidView('detail',event.id);
        } catch (error) { select.value = player.group_no ?? ''; raidError(error); }
        finally { select.disabled = false; }
      });
      row.append(select);
    }
    row.append(reviewCharacter(event, player, organizer));
    rows.append(row);
  }
}

async function changeRaid(id, update) {
  try {
    await raidRequest('/'+id, update);
    if (activeRaid === id) await openRaidView('detail',id);
    else if (raidView === 'roster' && workspaceGoal === id) await openRaidView('roster',null,false);
  } catch (error) { raidError(error); }
}
function downloadRaidCalendar(event) {
  const stamp = value => new Date(value).toISOString().replace(/[-:]|\.\d{3}/g,'');
  const escape = value => value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/[,;]/g,'\\$&');
  const data = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Solstice//Raid Planner//EN','BEGIN:VEVENT',
    'UID:'+event.id+'@solstice','DTSTAMP:'+stamp(Date.now()),'DTSTART:'+stamp(event.starts_at),
    'SUMMARY:'+escape(event.title),'DESCRIPTION:'+escape(event.notes),'END:VEVENT','END:VCALENDAR',''].join('\r\n');
  const href = URL.createObjectURL(new Blob([data],{type:'text/calendar;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = href; link.download = 'solstice-raid.ics'; link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
for (const id of ['rosterFilter','rosterRole','rosterReadiness','rosterSearch']) {
  byId(id).addEventListener(id === 'rosterSearch' ? 'input' : 'change', () => {
    if (activeRaidData) renderRoster(activeRaidData);
  });
}
byId('raidTab').addEventListener('click',()=>openRaidView('readiness'));
for (const node of document.querySelectorAll('[data-raid-view]')) node.addEventListener('click',()=>openRaidView(node.dataset.raidView));
byId('newRaid').addEventListener('click',()=>{ raidForm.reset(); openRaidView('new'); });
byId('raidNext').addEventListener('click',()=>{
  for (const field of raidForm.querySelectorAll('[data-step="'+wizardStep+'"] input')) if (!field.reportValidity()) return;
  if (wizardStep === 1) {
    const first = raidStartTime();
    if (!first || +first <= Date.now()) {
      raidError(new Error(selectedRaidDay ? 'Choose a valid future start time.' : 'Choose a raid date.'));
      if (!selectedRaidDay) {
        raidDatePicker.open = true;
        byId('raidSelectedDate').focus();
      } else raidHour.focus();
      return;
    }
    raidForm.elements.startsAt.value = first.toISOString();
  }
  if (wizardStep === 1 && roleSlotFields.reduce((sum, field) => sum + Number(field.value), 0) !== Number(raidForm.elements.size.value)) {
    raidError(new Error('Role slots must add up to the raid size.'));
    return;
  }
  byId('raidMessage').textContent = '';
  setWizardStep(wizardStep+1);
});
byId('raidBack').addEventListener('click',()=>wizardStep ? setWizardStep(wizardStep-1) : openRaidView('manage'));
raidForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (wizardStep !== 2) return;
  const data = Object.fromEntries(new FormData(raidForm));
  const first = raidStartTime();
  if (!first || +first <= Date.now()) {
    setWizardStep(1);
    raidError(new Error('Choose a valid future start time.'));
    return;
  }
  data.startsAt = first.toISOString();
  data.dates = Array.from({length:Number(data.weeks)}, (_, index) => {
    const date = new Date(first);
    date.setDate(date.getDate() + index * 7);
    return date.toISOString();
  });
  data.slots = Object.fromEntries(raidRoles.map((role,index) => [role,Number(roleSlotFields[index].value)]));
  for (const flag of ['review','waitlist','listed']) data[flag] = data[flag] === 'on';
  const button = byId('raidSubmit');
  button.disabled = true;
  try {
    const { id } = await raidRequest('',data);
    setWorkingRaid(id);
    raidForm.reset();
    await openRaidView('readiness');
  }
  catch (error) { raidError(error); }
  finally { button.disabled = false; }
});
characterForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const button = characterForm.querySelector('button');
  button.disabled = true;
  try { await raidRequest('characters',Object.fromEntries(new FormData(characterForm))); characterForm.reset(); await openRaidView('characters'); }
  catch (error) { raidError(error); }
  finally { button.disabled = false; }
});
byId('signupCharacter').addEventListener('change',event=>{
  if (event.target.value === '') return;
  const item = savedCharacters[Number(event.target.value)];
  signupForm.elements.character.value = item.name;
  signupForm.elements.className.value = item.class_name;
  signupForm.elements.role.value = item.role;
});
signupForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const id = activeRaid;
  const button = signupForm.querySelector('button');
  button.disabled = true;
  try { await raidRequest('/'+id,{ ...Object.fromEntries(new FormData(signupForm)),action:'signup' }); if (activeRaid === id) await openRaidView('detail',id); }
  catch (error) { raidError(error); }
  finally { button.disabled = false; }
});
byId('copyRaid').addEventListener('click',async()=>{
  const field = byId('raidLink');
  try { await navigator.clipboard.writeText(field.value); byId('copyRaid').textContent = 'Copied'; }
  catch { field.select(); }
});
function writeRoute(tool, view, raid) {
  const url = new URL('/',location.origin);
  url.searchParams.set('tool', tool);
  if (tool === 'raid' && view && view !== 'signups' && !raid) url.searchParams.set('view',view);
  if (raid) url.searchParams.set('raid',raid);
  if (url.href !== location.href) history.pushState(null,'',url);
}
function route() {
  const params = new URLSearchParams(location.search);
  const tool = params.get('tool');
  if (tool === 'raid') {
    const id = params.get('raid');
    const view = params.get('view');
    openRaidView(id ? 'detail' : ['readiness','roster','tonight','calendar','discover','characters','manage','new'].includes(view) ? view : 'readiness',id,false);
  } else {
    ++raidRevision;
    activeRaid = null;
    setView(tool === 'profession' ? 'profession' : 'auction');
  }
}
window.addEventListener('popstate',route);
for (const [id, tool] of [['auctionTab','auction'],['professionTab','profession']]) {
  byId(id).addEventListener('click',() => { writeRoute(tool); route(); });
}
route();
fetch('/api/session').then(response => response.ok ? response.json() : null)
  .then(session => { if (session) byId('guildIdentity').textContent = session.displayName; }).catch(() => {});
byId('refreshCraft').addEventListener('click', () => {
  loadCrafts();
  if (!loading) refresh();
});
byId('craftQuery').addEventListener('input', renderCrafts);
byId('profitable').addEventListener('change', renderCrafts);
function refreshFeeds() {
  refresh();
  if (!byId('professionPanel').hidden) loadCrafts();
}

refreshFeeds();
setInterval(refreshFeeds, refreshInterval);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - lastFeedCheck >= refreshInterval) refreshFeeds();
});
loadNames();
</script></main></body></html>`;

const market = 'forever.normal.alliance.us';
const professions = professionTiles.map(([name]) => name);
const categories = new Set(auctionCategories.flatMap(([id, , alternate]) => alternate ? [id, alternate] : [id]));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (!authReady(env)) return new Response('Configure Discord and D1 before opening the guild site.', { status: 503 });
    if (pathname.startsWith('/auth/')) {
      try { return await discordAuth(request, env, url); }
      catch { return Response.redirect(url.origin + '/?login=unavailable', 303); }
    }
    let session;
    try { session = await sessionFor(request, env); }
    catch { return new Response('Guild session storage is unavailable.', { status: 503 }); }
    try {
      if (pathname === '/cms') return await cmsPage(request, env, url, session);
      const article = pathname.match(/^\/chronicle\/([0-9a-f-]{36})$/);
      if (article && request.method === 'GET') return await articlePage(env, article[1], session);
      if (pathname === '/' && (!session || !url.searchParams.has('tool') || url.searchParams.has('login'))) {
        return await publicHome(env, url, session);
      }
    } catch {
      return new Response('Guild Chronicle storage is unavailable. Check that migrations have run.', { status: 503 });
    }
    if (!session) return Response.json({ error: 'Sign in with Discord to continue.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    if (pathname === '/api/armory') {
      try { return await armoryApi(request, env, url, session.discord_id); }
      catch { return Response.json({ error:'The Armory is temporarily unavailable.' }, { status:502, headers:{ 'Cache-Control':'no-store' } }); }
    }
    if (pathname === '/api/session') return Response.json({ displayName: session.display_name }, { headers: { 'Cache-Control': 'no-store' } });
    if (pathname === '/api/raid-characters' || /^\/api\/raids(?:\/[^/]+)?$/.test(pathname)) {
      try { return await raidApi(request, env.DB, url, session.discord_id); }
      catch { return Response.json({ error: 'Raid storage is unavailable.' }, { status: 503 }); }
    }
    if (pathname === '/') return new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'same-origin' } });
    let upstream;
    if (pathname === '/prices') upstream = 'https://api.ahledger.com/v1/pricetable/' + market;
    const category = pathname.split('/').at(-1);
    if (pathname === '/catalog/' + category && categories.has(category)) {
      upstream = 'https://ahledger.com/api/catalog?class=' + category;
    }
    const craft = pathname.match(/^\/crafting\/([A-Za-z%0-9]+)$/);
    if (craft) {
      const name = professions.find(profession => encodeURIComponent(profession) === craft[1]);
      if (name) upstream = 'https://api.ahledger.com/v1/crafting/' + market + '?all=1&profession=' + encodeURIComponent(name);
    }
    const item = pathname.match(/^\/item\/(\d{1,10})$/);
    if (item) upstream = 'https://api.ahledger.com/v1/prices/' + market + '/' + item[1] + '?range=7d';
    if (!upstream) return new Response('Not found', { status: 404 });
    try {
      const response = await fetch(upstream, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) return new Response('AHledger returned HTTP ' + response.status, { status: 502 });
      return new Response(response.body, { headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/plain',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=60',
      } });
    } catch {
      return new Response('AHledger did not respond', { status: 502 });
    }
  },
};
