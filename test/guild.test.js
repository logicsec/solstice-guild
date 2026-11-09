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
    if (url === 'https://oauth.battle.net/token') return Response.json({access_token:'blizzard-token',expires_in:3600});
    if (url.startsWith('https://us.api.blizzard.com/')) {
      assert.equal(options.headers.Authorization,'Bearer blizzard-token');
      const profile = new URL(url);
      assert.equal(profile.searchParams.get('namespace'),'profile-forever-us');
      const suffix = profile.pathname.split('/').at(-1);
      if (suffix === 'equipment') return Response.json({equipped_items:[{name:'Staff',slot:{name:'Main Hand'},
        quality:{type:'RARE'},enchantments:[{display_string:'Intellect'}]}]});
      if (suffix === 'professions') return Response.json({primaries:[{profession:{name:'Alchemy'},skill_points:100}]});
      if (suffix === 'character-media') return Response.json({assets:[{key:'main-raw',value:'https://render.worldofwarcraft.com/us/test.png'}]});
      return Response.json({name:'Astra',surname:'Mortis',character_class:{name:'Mage'},level:60});
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
  const page = await (await send(invite, options)).text();
  assert.match(page, /Guild tools/);
  assert.match(page, /Invite link/);
  new Function(page.split('<script>').at(-1).split('</script>')[0]);
  assert.equal((await (await send('/api/session', options)).json()).displayName, 'Raider');
  const post = (path, body, session = cookie) => send(path, {
    method: 'POST', headers: { Cookie: session, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const created = await post('/api/raids', { title: 'Barrow Deeps', startsAt: new Date(Date.now()+86400000).toISOString(), size: 10, review: true });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  discordId = '31';
  const member = (await signIn('/?tool=raid&raid=' + id)).headers.getSetCookie().find(value => value.startsWith('__Host-solstice-session=')).split(';')[0];
  const raid = '/api/raids/' + id;
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
  assert.equal((await post(raid, { action: 'review', member: '31', status: 'Going' }, member)).status, 403);
  assert.equal((await post(raid, { action: 'review', member: '31', status: 'Going' })).status, 200);
  const armory = await (await send('/api/armory?name=Astra+Mortis',{headers:{Cookie:member}})).json();
  assert.equal(armory.character.gear[0].enchants[0],'Intellect');
  assert.equal(armory.character.professions[0].name,'Alchemy');
  assert.match(armory.character.render,/^https:\/\/render\./);
  const link = {action:'link',slug:'astra-mortis',role:'Ranged DPS'};
  assert.equal((await post('/api/armory',link,member)).status,200);
  assert.equal((await post('/api/armory',link)).status,409);
  const withProfile = await (await send(raid+'?armory=1',{headers:{Cookie:member}})).json();
  assert.equal(withProfile.roster[0].armorySlug,'astra-mortis');
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
  assert.equal((await send('/cms', { headers: { Cookie: member } })).status, 403);
  const article = new URLSearchParams({title:'First & Dawn', summary:'A guild update', body:'<script>unsafe</script>', action:'draft'});
  const save = () => send('/cms', { method:'POST', headers:{ Cookie:cookie, Origin:origin }, body:article });
  assert.equal((await save()).status, 303);
  assert.doesNotMatch(await (await send('/')).text(), /First &amp; Dawn/);
  const articleId = db.prepare('SELECT id FROM articles').get().id;
  assert.equal((await send('/chronicle/' + articleId)).status, 404);
  article.set('id',articleId);
  article.set('action','publish');
  assert.equal((await save()).status, 303);
  assert.match(await (await send('/')).text(), /First &amp; Dawn/);
  const published = await (await send('/chronicle/' + articleId)).text();
  assert.match(published, /&lt;script&gt;unsafe/);
  assert.doesNotMatch(published, /<script>unsafe/);
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
