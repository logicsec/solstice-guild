import { sameOriginWrite } from './auth.js';

const roles = ['Tank', 'Healer', 'Melee DPS', 'Ranged DPS'];
export const armorySpecs = {
  Druid: [['Balance','Ranged DPS'],['Feral Combat','Melee DPS'],['Restoration','Healer']],
  Hunter: [['Beast Mastery','Ranged DPS'],['Marksmanship','Ranged DPS'],['Survival','Ranged DPS']],
  Mage: [['Arcane','Ranged DPS'],['Fire','Ranged DPS'],['Frost','Ranged DPS']],
  Paladin: [['Holy','Healer'],['Protection','Tank'],['Retribution','Melee DPS']],
  Priest: [['Discipline','Healer'],['Holy','Healer'],['Shadow','Ranged DPS']],
  Rogue: [['Assassination','Melee DPS'],['Combat','Melee DPS'],['Subtlety','Melee DPS']],
  Shaman: [['Elemental','Ranged DPS'],['Enhancement','Melee DPS'],['Restoration','Healer']],
  Warlock: [['Affliction','Ranged DPS'],['Demonology','Ranged DPS'],['Destruction','Ranged DPS']],
  Warrior: [['Arms','Melee DPS'],['Fury','Melee DPS'],['Protection','Tank']],
};
let tokenCache;

function localized(value) {
  return typeof value === 'string' ? value : value?.en_US ?? '';
}

function profileSlug(value) {
  const slug = typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '-') : '';
  return /^[\p{L}]{2,30}-[\p{L}]{2,30}$/u.test(slug) ? slug : null;
}

async function battleNetToken(env) {
  if (tokenCache?.client === env.BLIZZARD_CLIENT_ID && tokenCache.expires > Date.now()) return tokenCache.value;
  const response = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(env.BLIZZARD_CLIENT_ID + ':' + env.BLIZZARD_CLIENT_SECRET) },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Blizzard credentials or token service rejected the request.');
  const token = await response.json();
  if (typeof token.access_token !== 'string') throw new Error('Blizzard returned an invalid token.');
  tokenCache = { client: env.BLIZZARD_CLIENT_ID, value: token.access_token, expires: Date.now() + Math.max(0, Number(token.expires_in || 0) - 60) * 1000 };
  return token.access_token;
}

async function loadCharacter(env, slug) {
  const token = await battleNetToken(env);
  const requestProfile = suffix => fetch('https://us.api.blizzard.com/profile/wow/character/' + encodeURIComponent(slug) + suffix + '?namespace=profile-forever-us&locale=en_US', {
    headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000),
  });
  const response = await requestProfile('');
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('The Armory profile is temporarily unavailable.');
  const profile = await response.json();
  const name = [localized(profile.name), localized(profile.surname)].filter(Boolean).join(' ');
  if (!name || !localized(profile.character_class?.name)) throw new Error('The Armory returned an incomplete character profile.');
  async function optional(suffix) {
    try {
      const result = await requestProfile(suffix);
      return result.ok ? await result.json() : null;
    } catch { return null; }
  }
  const [data, equipment, media] = await Promise.all([
    optional('/professions'), optional('/equipment'), optional('/character-media'),
  ]);
  let professions = null;
  if (data) {
      const groups = [data.primaries, data.secondaries, data.professions].filter(Array.isArray);
      if (groups.length) professions = groups.flat().map(entry => ({
        name: localized(entry.profession?.name ?? entry.name),
        skill: Number.isFinite(entry.skill_points) ? entry.skill_points : null,
        maxSkill: Number.isFinite(entry.max_skill_points) ? entry.max_skill_points : null,
        tiers: (Array.isArray(entry.tiers) ? entry.tiers : []).map(tier => ({
          name: localized(tier.tier?.name ?? tier.name),
          skill: Number.isFinite(tier.skill_points) ? tier.skill_points : null,
          maxSkill: Number.isFinite(tier.max_skill_points) ? tier.max_skill_points : null,
        })),
      })).filter(entry => entry.name);
  }
  const renders = Array.isArray(media?.assets) ? media.assets : [];
  const mediaUrl = keys => keys.map(key=>renders.find(asset=>asset.key === key)?.value).find(value=>
    typeof value === 'string' && /^https:\/\/render(?:-[a-z]+)?\.worldofwarcraft\.com\//i.test(value));
  const gear = Array.isArray(equipment?.equipped_items) ? equipment.equipped_items.map(item=>({
    slot: localized(item.slot?.name ?? item.slot?.type),
    name: localized(item.name),
    quality: item.quality?.type ?? 'COMMON',
    enchants: (Array.isArray(item.enchantments) ? item.enchantments : []).map(enchant=>
      localized(enchant.display_string ?? enchant.enchantment?.name ?? enchant.source_item?.name)).filter(Boolean),
  })).filter(item=>item.name) : null;
  return {
    slug, name, level: profile.level ?? null,
    className: localized(profile.character_class?.name),
    race: localized(profile.race?.name),
    faction: localized(profile.faction?.name),
    ruleset: localized(profile.ruleset?.name),
    guild: localized(profile.guild?.name),
    itemLevel: profile.equipped_item_level ?? null,
    professions, gear, render: mediaUrl(['main-raw','main','inset']) ?? null, avatar: mediaUrl(['avatar']) ?? null,
  };
}

export async function armoryApi(request, env, url, member) {
  const reply = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  const db = env.DB;
  const configured = Boolean(env.BLIZZARD_CLIENT_ID && env.BLIZZARD_CLIENT_SECRET);
  if (request.method === 'GET') {
    const query = url.searchParams.get('name');
    if (query !== null) {
      if (!configured) return reply({ error: 'The guild administrator needs to configure Blizzard API credentials.' }, 503);
      const slug = profileSlug(query);
      if (!slug) return reply({ error: 'Enter your character’s first and last name.' }, 400);
      const character = await loadCharacter(env, slug);
      return character ? reply({ character }) : reply({ error: 'Character not found. Check the full name and make sure the level 10+ character has logged out of WoW.' }, 404);
    }
    const result = await db.prepare('SELECT slug, name, class_name, role, spec FROM armory_links WHERE member = ? ORDER BY name').bind(member).all();
    return reply({ configured, characters: result.results });

  }
  if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
  if (!sameOriginWrite(request, url) || !request.headers.get('Content-Type')?.startsWith('application/json')) return reply({ error: 'Invalid request origin.' }, 403);
  const input = await request.json().catch(() => null);
  const slug = profileSlug(input?.slug);
  if (!slug) return reply({ error: 'Enter a valid character name.' }, 400);
  if (input.action === 'unlink') {
    await db.prepare('DELETE FROM armory_links WHERE slug = ? AND member = ?').bind(slug, member).run();
    return reply({ ok: true });
  }
  if (!configured) return reply({ error: 'The guild administrator needs to configure Blizzard API credentials.' }, 503);
  const existing = await db.prepare('SELECT member, role FROM armory_links WHERE slug = ?').bind(slug).first();
  if (existing && existing.member !== member) return reply({ error: 'This character is already linked to another Discord account.' }, 409);
  if (input.action !== 'link') return reply({ error: 'Unknown Armory action.' }, 400);
  const role = input.role;
  if (!roles.includes(role)) return reply({ error: 'Select a raid role.' }, 400);
  const character = await loadCharacter(env, slug);
  if (!character) return reply({ error: 'Character not found in the Armory.' }, 404);
  const spec = input.spec ?? '';
  const specs = Object.hasOwn(armorySpecs,character.className) ? armorySpecs[character.className] : [];
  if (spec !== '' && !specs.some(([name])=>name === spec)) return reply({ error:'Select a specialization for this class.' },400);
  const result = await db.prepare(`INSERT INTO armory_links (slug, member, role, name, class_name, spec) VALUES (?,?,?,?,?,?)
    ON CONFLICT(slug) DO UPDATE SET role = excluded.role, name = excluded.name, class_name = excluded.class_name, spec = excluded.spec
    WHERE armory_links.member = excluded.member`).bind(slug, member, role, character.name, character.className, spec).run();
  if (!result.meta.changes) return reply({ error: 'This character is already linked to another Discord account.' }, 409);
  return reply({ ok: true });
}

export async function linkedRosterProfiles(db, id) {
  const result = await db.prepare(`SELECT s.member, a.slug FROM raid_signups s JOIN armory_links a
    ON a.member = s.member AND a.name = s.character COLLATE NOCASE AND a.class_name = s.class_name
    WHERE s.raid_id = ?`).bind(id).all();
  return new Map(result.results.map(row=>[row.member,row.slug]));
}
