import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../src/index.js';
import { schedulePrep } from '../src/prep.js';

test('Discord membership, invite-link return, SPA, raid RSVP and sign-out', async t => {
  const db = new DatabaseSync(':memory:');
  for (const file of fs.readdirSync(new URL('../migrations/', import.meta.url)).sort()) {
    db.exec(fs.readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  }
  const DB = {
    prepare(sql) {
      const statement = db.prepare(sql);
      return { bind(...args) {
        return {
          first: async () => statement.get(...args),
          all: async () => ({ results: statement.all(...args) }),
          run: async () => ({ meta: statement.run(...args) }),
        };
      } };
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
  };
  const env = { DB, DISCORD_CLIENT_ID: '10', DISCORD_CLIENT_SECRET: 'test', DISCORD_GUILD_ID: '20', CMS_ADMIN_DISCORD_IDS: '30', BLIZZARD_CLIENT_ID: 'test', BLIZZARD_CLIENT_SECRET: 'test' };
  const origin = 'https://solsticeguild.net';
  const send = (path, options) => worker.fetch(new Request(origin + path, options), env);
  const invite = '/?tool=raid&raid=00000000-0000-4000-8000-000000000001';
  assert.match(await (await send(invite)).text(), /Sign in with Discord/);
  assert.equal((await send('/prices')).status, 401);
  assert.equal((await send('/api/raids', { headers: { 'oai-authenticated-user-id': 'fake' } })).status, 401);

  let discordId = '30';
  let isMember = true;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://api.ahledger.com/v1/pricetable/forever.normal.alliance.us') {
      return new Response('AHL1|forever/normal/alliance/us|1794283197|2\n117:100:80:3:100:100\n118:100:90:3:100:100');
    }
    if (url === 'https://api.ahledger.com/v1/items/117?game=forever') return Response.json({id:117,name:'Tough Jerky',vendorSell:100});
    if (url === 'https://api.ahledger.com/v1/items/118?game=forever') return Response.json({id:118,name:'Minor Healing Potion',vendorSell:80});
    if (url === 'https://oauth.battle.net/token') return Response.json({access_token:'blizzard-token',expires_in:3600});
    if (url.startsWith('https://us.api.blizzard.com/')) {
      assert.equal(options.headers.Authorization,'Bearer blizzard-token');
      const profile = new URL(url);
      assert.equal(profile.searchParams.get('namespace'),'profile-forever-us');
      const suffix = profile.pathname.split('/').at(-1);
      if (suffix === 'equipment') return Response.json({equipped_items:[{item:{id:123},name:'Staff',slot:{name:'Main Hand',type:'MAIN_HAND'},level:{value:27},
        quality:{type:'RARE'},enchantments:[{display_string:'Intellect'}]}]});
      if (suffix === 'statistics') return Response.json({intellect:{effective:42},health:900});
      if (suffix === 'professions') return Response.json({primaries:[{profession:{name:'Alchemy'},skill_points:100}]});
      if (suffix === 'character-media') return Response.json({assets:[{key:'main-raw',value:'https://render.worldofwarcraft.com/us/test.png'}]});
      return Response.json({name:'Astra',surname:'Mortis',character_class:{name:'Mage'},level:60,guild:{name:'Solstice'}});
    }
    if (url === 'https://discord.com/api/v10/oauth2/token') {
      assert.equal(options.body.get('redirect_uri'), origin + '/auth/discord/callback');
      return Response.json({ access_token: 'mock-token' });
    }
    assert.equal(url, 'https://discord.com/api/v10/users/@me/guilds/20/member');
    assert.equal(options.headers.Authorization, 'Bearer mock-token');
    return isMember ? Response.json({ user: { id: discordId, username: 'Raider' } }) : new Response(null, { status: 404 });
  });
  async function signIn(next, wrongState = false) {
    const begin = await send('/auth/discord?next=' + encodeURIComponent(next));
    const auth = new URL(begin.headers.get('location'));
    assert.equal(auth.origin, 'https://discord.com');
    assert.equal(auth.searchParams.get('scope'), 'identify guilds.members.read');
    const state = wrongState ? 'invalid' : auth.searchParams.get('state');
    return send('/auth/discord/callback?code=mock&state=' + state, {
      headers: { Cookie: begin.headers.getSetCookie()[0].split(';')[0] },
    });
  }
  assert.equal((await signIn(invite, true)).headers.get('location'), '/?login=expired');
  isMember = false;
  assert.equal((await signIn(invite)).headers.get('location'), '/?login=membership');
  isMember = true;
  assert.equal((await signIn('//bad.example/')).headers.get('location'), '/');
  const success = await signIn(invite);
  assert.equal(success.headers.get('location'), invite);
  const cookie = success.headers.getSetCookie().find(value => value.startsWith('__Host-solstice-session=')).split(';')[0];
  const options = { headers: { Cookie: cookie } };
  const page = await (await send('/?tool=raid&view=detail&raid=00000000-0000-4000-8000-000000000001', options)).text();
  assert.match(page, /Guild tools/);
  assert.match(page, /Invite link/);
  new Function(page.split('<script>').at(-1).split('</script>')[0]);
  assert.equal((await (await send('/api/session', options)).json()).displayName, 'Raider');
  const post = (path, body, session = cookie) => send(path, {
    method: 'POST', headers: { Cookie: session, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await send('/api/vendor-flips',{method:'POST'})).status,401);
  const flips = await (await post('/api/vendor-flips',{})).json();
  assert.equal(flips.complete,true);
  assert.equal(flips.checked,2);
  assert.deepEqual(flips.flips,[{id:117,name:'Tough Jerky',min:80,vendor:100,profit:20}]);
  const created = await post('/api/raids', { instance: 'barrow-deeps', startsAt: new Date(Date.now()+86400000).toISOString(), size: 10, review: true });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  discordId = '31';
  const member = (await signIn('/?tool=raid&raid=' + id)).headers.getSetCookie().find(value => value.startsWith('__Host-solstice-session=')).split(';')[0];
  const memberOptions = {headers:{Cookie:member}};
  for (const path of ['/api/raids','/api/raids?discover=1']) {
    const {raids} = await (await send(path,memberOptions)).json();
    assert.ok(raids.some(raid=>raid.id === id && !raid.organizer));
  }
  assert.equal((await send('/api/raid-characters?guild=1')).status,401);
  assert.equal((await post('/api/raid-characters',{name:'Guild Tester',className:'Priest',spec:'Holy',role:'Healer'},member)).status,200);
  const directory = await (await send('/api/raid-characters?guild=1',options)).json();
  assert.deepEqual(directory.characters,[{name:'Guild Tester',class_name:'Priest',spec:'Holy',role:'Healer',armory_linked:0,armorySlug:null}]);
  const ownCharacters = await (await send('/api/raid-characters',options)).json();
  assert.deepEqual(ownCharacters.signupCharacters,[]);
  const raid = '/api/raids/' + id;
  const publicPath = '/raid/' + id;
  assert.equal((await signIn(publicPath)).headers.get('location'),publicPath);
  for (const path of [publicPath,'/?tool=raid&raid='+id]) {
    const memberPage = await (await send(path,options)).text();
    assert.match(memberPage,/Confirmed Roster/);
    assert.match(memberPage,/view=detail&amp;raid=/);
    assert.match(memberPage,/>Guild Hall</);
    assert.doesNotMatch(memberPage,/Chronicle|Sign in with Discord|Save RSVP/);
  }
  assert.match(await (await send('/?tool=raid&view=detail&raid='+id,options)).text(),/Invite link/);
  assert.equal((await send(raid)).status,401);
  assert.equal((await post(raid,{action:'delete'},'')).status,401);
  assert.equal((await post(raid, { action: 'signup', character: 'Astra Mortis', className: 'Mage', role: 'Ranged DPS', status: 'Going' }, member)).status, 200);
  const review = { action:'readiness', member:'31', character:'Astra Mortis', checks:{ access:'Blocked', gear:'Ready', enchants:'Not applicable', supplies:'Unreviewed' }, note:'Needs access' };
  assert.equal((await post(raid, review, member)).status, 403);
  assert.equal((await post(raid, {...review, character:'Former character'})).status, 409);
  assert.equal((await post(raid, review)).status, 200);
  const reviewed = (await (await send(raid, {headers:{Cookie:member}})).json()).roster[0];
  assert.equal(reviewed.readiness.access, 'Blocked');
  assert.equal(reviewed.readiness_note, 'Needs access');
  assert.equal(reviewed.member, undefined);
  const detail = await (await send(raid, options)).json();
  assert.equal(detail.roster[0].status, 'Pending');
  const pendingPublic = await send(publicPath);
  assert.equal(pendingPublic.status,200);
  assert.match(pendingPublic.headers.get('x-robots-tag'),/noindex/);
  const pendingPage = await pendingPublic.text();
  assert.match(pendingPage,/No players have been confirmed/);
  assert.doesNotMatch(pendingPage,/Chronicle|>Guild Hall</);
  assert.doesNotMatch(pendingPage,/Astra Mortis/);
  assert.match(pendingPage,new RegExp('next='+encodeURIComponent(publicPath)));
  assert.equal((await post(raid, { action: 'review', member: '31', status: 'Going' }, member)).status, 403);
  assert.equal((await post(raid, { action: 'review', member: '31', status: 'Going' })).status, 200);
  const armory = await (await send('/api/armory?name=Astra+Mortis',{headers:{Cookie:member}})).json();
  assert.equal(armory.character.gear[0].enchants[0],'Intellect');
  assert.equal(armory.character.gear[0].id,123);
  assert.equal(armory.character.gear[0].slotType,'MAIN_HAND');
  assert.deepEqual(armory.character.attributes[0],['Primary stats',[['Intellect',42]]]);
  assert.equal(armory.character.professions[0].name,'Alchemy');
  assert.match(armory.character.render,/^https:\/\/render\./);
  const link = {action:'link',slug:'astra-mortis',spec:'Frost'};
  assert.equal((await post('/api/armory',{...link,spec:'Protection'},member)).status,400);
  assert.equal((await post('/api/armory',link,member)).status,200);
  const linkedDirectory = await (await send('/api/raid-characters?guild=1',options)).json();
  assert.ok(linkedDirectory.characters.some(character=>character.name === 'Astra Mortis' && character.armorySlug === 'astra-mortis'));
  assert.ok(linkedDirectory.characters.every(character=>!Object.hasOwn(character,'member')));
  const linked = await (await send('/api/armory',{headers:{Cookie:member}})).json();
  assert.equal(linked.characters[0].spec,'Frost');
  assert.equal(linked.characters[0].role,'Ranged DPS');
  assert.equal((await post('/api/armory',link)).status,409);
  const withProfile = await (await send(raid+'?armory=1',{headers:{Cookie:member}})).json();
  assert.equal(withProfile.roster[0].armorySlug,'astra-mortis');
  assert.equal(withProfile.roster[0].spec,'Frost');
  assert.equal(withProfile.roster[0].member,undefined);
  const task = {action:'prep-add',title:'Finish the entry quest',minutes:30,category:'Individual quests & tasks',
    players:['Astra Mortis'],target:'Astra Mortis',check:'access',ready:true};
  assert.equal((await post(raid,task,member)).status,403);
  assert.equal((await post(raid,task)).status,200);
  const planned = await (await send(raid+'?prep=1',options)).json();
  assert.equal(planned.prep[0].target,'Astra Mortis');
  assert.equal((await post(raid,{action:'prep-report',ids:[planned.prep[0].id]})).status,200);
  const reported = await (await send(raid+'?prep=1',options)).json();
  assert.ok(reported.prep[0].reportedAt);
  assert.equal(reported.roster[0].readiness.access,'Blocked');
  for (const path of [publicPath,'/?tool=raid&raid='+id]) {
    const guest = await send(path);
    assert.equal(guest.status,200);
    const body = await guest.text();
    assert.match(body,/Barrow Deeps/);
    assert.match(body,/data-raid-instance="barrow-deeps"/);
    assert.doesNotMatch(body,/<footer>/);
    assert.match(body,/Astra Mortis/);
    assert.match(body,/Ranged DPS/);
    assert.match(body,/classicon_mage\.jpg/);
    assert.match(body,/spell_frost_frostbolt02\.jpg/);
    assert.match(body,/Level 60/);
    assert.match(body,/&lt;Solstice&gt;/);
    assert.doesNotMatch(body,/Needs access|Finish the entry quest|Save RSVP/);
  }
  const picks = {action:'reserve-picks',items:['Staff of the Wild','Ember Ring']};
  assert.equal((await post(raid,picks,member)).status,409);
  const lootTable = {action:'reserve-loot-table',items:[...picks.items,'Copper Helm','Copper Sword','Other Sword','Replacement item']};
  assert.equal((await post(raid,lootTable,member)).status,403);
  assert.equal((await post(raid,lootTable)).status,200);
  assert.equal((await post(raid,{...picks,items:['Not in table']},member)).status,409);
  const lootPage = await (await send(publicPath)).text();
  assert.match(lootPage,/Automatic raid loot and reserve selection are coming soon/);
  assert.doesNotMatch(lootPage,/name="items"|Request guest reserves/);
  assert.equal((await post(raid,{...picks,guest:'Guest Raider'},member)).status,403);
  assert.equal((await post(raid,{...picks,items:[...picks.items,'Third item']},member)).status,409);
  assert.equal((await post(raid,picks,member)).status,200);
  assert.equal((await post(raid,{action:'reserve-settings',limit:1})).status,409);
  assert.equal((await post(raid,{...picks,guest:'Guest Raider',items:['Copper Helm']})).status,200);
  const guestRequest = (character,items,requestOrigin=origin) => send(publicPath,{
    method:'POST',headers:{Origin:requestOrigin},body:new URLSearchParams([['character',character],...items.split('\n').map(item=>['items',item])]),
  });
  assert.equal((await guestRequest('Public Pug','Copper Sword','https://other.example')).status,403);
  assert.equal((await guestRequest('Public Pug','One\nTwo\nThree')).status,409);
  assert.equal((await guestRequest('Public Pug','Copper Sword')).status,303);
  assert.equal((await guestRequest('PUBLIC PUG','Other Sword')).status,409);
  assert.doesNotMatch(await (await send(publicPath)).text(),/Public Pug/);
  const guestQueue = (await (await send(raid,options)).json()).pendingReserves;
  assert.equal(guestQueue[0].character,'Public Pug');
  assert.deepEqual((await (await send(raid,{headers:{Cookie:member}})).json()).pendingReserves,[]);
  const approve = {action:'reserve-review',key:guestQueue[0].key,approve:true};
  assert.equal((await post(raid,approve,member)).status,403);
  assert.equal((await post(raid,approve)).status,200);
  assert.match(await (await send(publicPath)).text(),/Public Pug<\/th><td>Copper Sword/);
  assert.equal((await post(raid,{action:'reserve-settings',locked:true},member)).status,403);
  assert.equal((await post(raid,{action:'reserve-settings',locked:true})).status,200);
  assert.equal((await post(raid,{...picks,items:[]},member)).status,409);
  assert.equal((await post(raid,{...picks,member:'31'})).status,409);
  const publicReserves = await (await send(publicPath)).text();
  assert.match(publicReserves,/Locked · 2 per player/);
  assert.doesNotMatch(publicReserves,/Request guest reserves/);
  assert.equal((await guestRequest('Late Pug','Copper Sword')).status,409);
  assert.match(publicReserves,/Staff of the Wild/);
  assert.match(publicReserves,/Guest Raider/);
  assert.doesNotMatch(publicReserves,/member:31|guest:guest raider/);
  const second = await post('/api/raids',{instance:'hyjal-summit',startsAt:new Date(Date.now()+8*86400000).toISOString(),size:20});
  const secondRaid = '/api/raids/'+(await second.json()).id;
  assert.equal((await post(secondRaid,{action:'signup',character:'Astra Mortis',className:'Mage',role:'Ranged DPS',status:'Going'},member)).status,200);
  assert.equal((await post(secondRaid,{...picks,items:['Staff of the Wild']},member)).status,409);
  assert.equal((await post(secondRaid,{action:'reserve-loot-table',items:['Next week item']})).status,200);
  assert.equal((await post(secondRaid,{...picks,items:['Next week item']},member)).status,200);
  const history = await (await send(raid+'?reserveHistory=member%3A31',options)).json();
  assert.deepEqual(history.history.map(entry=>entry.title),['Hyjal Summit','Barrow Deeps']);
  assert.equal((await send(raid+'?reserveHistory=guest%3Aguest%20raider',{headers:{Cookie:member}})).status,403);
  assert.equal((await post(raid,{action:'reserve-settings',locked:false})).status,200);
  assert.equal((await post(raid,{...picks,items:['Replacement item']},member)).status,200);
  assert.equal((await post(raid,{action:'delete'},member)).status,403);
  assert.equal((await post(raid,{action:'delete'})).status,200);
  assert.equal((await send(raid,options)).status,404);
  assert.equal((await send(publicPath)).status,404);
  assert.equal(db.prepare('SELECT count(*) AS total FROM raid_signups WHERE raid_id = ?').get(id).total,0);
  assert.equal(db.prepare('SELECT count(*) AS total FROM raid_prep WHERE raid_id = ?').get(id).total,0);
  assert.equal(db.prepare('SELECT count(*) AS total FROM raid_reserves WHERE raid_id = ?').get(id).total,0);
  assert.equal((await send('/cms', { headers: { Cookie: member } })).status, 403);
  const article = new URLSearchParams({title:'First & Dawn', summary:'A guild update', body:'<script>unsafe</script>', action:'draft'});
  const save = () => send('/cms', { method:'POST', headers:{ Cookie:cookie, Origin:origin }, body:article });
  assert.equal((await save()).status, 303);
  assert.doesNotMatch(await (await send('/')).text(), /First &amp; Dawn/);
  const articleId = db.prepare('SELECT id FROM articles').get().id;
  assert.equal((await send('/chronicle/' + articleId)).status, 404);
  article.set('id',articleId);
  article.set('action','publish');
  article.set('category','Raid recaps');
  assert.equal((await save()).status, 303);
  assert.match(await (await send('/')).text(), /First &amp; Dawn/);
  const published = await (await send('/chronicle/' + articleId)).text();
  assert.match(published, /Recent Posts/);
  assert.match(published, /Raid Recaps<\/span><span>1/);
  assert.match(await (await send('/?category=Raid%20recaps')).text(), /First &amp; Dawn/);
  assert.doesNotMatch(await (await send('/?category=Guides')).text(), /First &amp; Dawn/);
  assert.match(published, /Published by <strong>[^<]+<\/strong>/);
  assert.match(published, /class="article-page chronicle-article"/);
  assert.match(published, /&lt;script&gt;unsafe/);
  assert.doesNotMatch(published, /<script>unsafe/);
  article.set('body_format','rich');
  article.set('body','<h2>Raid recap</h2><p><strong>Well done!</strong></p>' +
    '<img src="https://example.com/raid.png?one=1&amp;two=2" alt="Guild &amp; friends">' +
    '<img src="javascript:alert(1)" alt="Bad"><img src="https://example.com/bad.png" alt="Bad" onerror="alert(1)">');
  assert.equal((await save()).status,303);
  const rich = await (await send('/chronicle/' + articleId)).text();
  assert.match(rich,/<h2>Raid recap<\/h2>/);
  assert.match(rich,/<strong>Well done!<\/strong>/);
  assert.match(rich,/<img src="https:\/\/example.com\/raid.png\?one=1&amp;two=2" alt="Guild &amp; friends"/);
  assert.doesNotMatch(rich,/<img[^>]*(?:onerror|javascript:)/);
  const editor = await (await send('/cms?edit=' + articleId,options)).text();
  assert.match(editor,/data-command="image">Add image/);
  assert.match(editor,/<h2>Raid recap<\/h2>/);
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWckAAAAASUVORK5CYII=', 'base64'));
  const upload = (editorCookie, bytes = png) => send('/cms/images', {
    method:'POST', headers:{ Cookie:editorCookie, Origin:origin, 'Content-Type':'image/png' }, body:bytes,
  });
  assert.equal((await upload(member)).status,403);
  assert.equal((await upload(cookie,new Uint8Array([1,2,3]))).status,415);
  const largeImage = new Uint8Array(2 * 1024 * 1024);
  largeImage.set(png);
  const uploaded = await upload(cookie,largeImage);
  assert.equal(uploaded.status,201);
  const { path:imagePath } = await uploaded.json();
  assert.equal((await send(imagePath)).status,404);
  assert.equal((await send(imagePath,options)).status,200);
  article.set('body','<p>Screenshot</p><img src="' + imagePath + '" alt="">');
  assert.equal((await save()).status,303);
  const articleWithCover = await (await send('/chronicle/' + articleId)).text();
  assert.ok(articleWithCover.includes('<div class="chronicle-article-cover"><img src="' + imagePath + '"'));
  assert.ok(articleWithCover.indexOf('chronicle-article-cover') < articleWithCover.indexOf('<h1>'));
  assert.ok((await (await send('/')).text()).includes('<div class="chronicle-card-cover"><img src="' + imagePath + '"'));
  const publicImage = await send(imagePath);
  assert.equal(publicImage.headers.get('Content-Type'),'image/png');
  assert.deepEqual(new Uint8Array(await publicImage.arrayBuffer()),largeImage);
  article.set('action','draft');
  assert.equal((await save()).status,303);
  assert.equal((await send(imagePath)).status,404);
  assert.match(await (await send('/cms?edit=' + articleId,options)).text(), /Delete This Article/);
  const deleteArticle = (editorCookie, requestOrigin = origin) => send('/cms', {
    method:'POST', headers:{ Cookie:editorCookie, Origin:requestOrigin },
    body:new URLSearchParams({id:articleId,action:'delete'}),
  });
  assert.equal((await deleteArticle(member)).status,403);
  assert.equal((await deleteArticle(cookie,'https://other.example')).status,403);
  assert.equal((await deleteArticle(cookie)).status,303);
  assert.equal((await send('/cms?edit=' + articleId,options)).status,404);
  assert.equal((await deleteArticle(cookie)).status,404);
  assert.equal((await send('/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://bad.example','Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await send('/auth/logout',{method:'POST',headers:{Cookie:cookie,Origin:'null','Sec-Fetch-Site':'same-origin'}})).status,303);
  assert.equal((await send('/api/session', options)).status, 401);
  db.close();
});


test('preparation respects prerequisites, attendance and overlapping players', () => {
  const players = [
    {character:'Tank',role:'Tank'},{character:'Heal',role:'Healer'},
    {character:'A',role:'Ranged DPS'},{character:'B',role:'Melee DPS'},{character:'C',role:'Melee DPS'},
    {character:'Crafter',role:'Healer'},
  ];
  const names = players.map(player=>player.character);
  const tasks = [
    {id:'entry',category:'Group runs',players:names.slice(0,5),ready:true,minutes:45,check:'access'},
    {id:'craft',players:['Crafter'],ready:true,minutes:20},
    {id:'later',after:'entry',players:['A'],ready:true,minutes:15},
    {id:'over',after:'entry',players:['A'],ready:true,minutes:10},
  ];
  const result = schedulePrep(tasks,players,names,60);
  assert.deepEqual(result.assignments.map(task=>[task.id,task.start,task.end]),[['entry',0,45],['craft',0,20],['later',45,60]]);
  assert.equal(result.remaining[0].task.id,'over');
  assert.deepEqual(schedulePrep(tasks,players,names.slice(1),60).assignments.map(task=>task.id),['craft']);
});
