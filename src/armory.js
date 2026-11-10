import { sameOriginWrite } from './auth.js';

const roles = ['Tank', 'Healer', 'Melee DPS', 'Ranged DPS'];
export const armorySpecs = {
  Druid: [['Balance','Ranged DPS','spell_nature_starfall'],['Feral Combat','Melee DPS','ability_racial_bearform'],['Restoration','Healer','spell_nature_healingtouch']],
  Hunter: [['Beast Mastery','Ranged DPS','ability_hunter_beasttaming'],['Marksmanship','Ranged DPS','ability_marksmanship'],['Survival','Ranged DPS','ability_hunter_swiftstrike']],
  Mage: [['Arcane','Ranged DPS','spell_holy_magicalsentry'],['Fire','Ranged DPS','spell_fire_firebolt02'],['Frost','Ranged DPS','spell_frost_frostbolt02']],
  Paladin: [['Holy','Healer','spell_holy_holybolt'],['Protection','Tank','spell_holy_devotionaura'],['Retribution','Melee DPS','spell_holy_auraoflight']],
  Priest: [['Discipline','Healer','spell_holy_wordfortitude'],['Holy','Healer','spell_holy_guardianspirit'],['Shadow','Ranged DPS','spell_shadow_shadowwordpain']],
  Rogue: [['Assassination','Melee DPS','ability_rogue_eviscerate'],['Combat','Melee DPS','ability_backstab'],['Subtlety','Melee DPS','ability_stealth']],
  Shaman: [['Elemental','Ranged DPS','spell_nature_lightning'],['Enhancement','Melee DPS','spell_nature_lightningshield'],['Restoration','Healer','spell_nature_magicimmunity']],
  Warlock: [['Affliction','Ranged DPS','spell_shadow_deathcoil'],['Demonology','Ranged DPS','spell_shadow_metamorphosis'],['Destruction','Ranged DPS','spell_shadow_rainoffire']],
  Warrior: [['Arms','Melee DPS','ability_warrior_savageblow'],['Fury','Melee DPS','ability_warrior_innerrage'],['Protection','Tank','ability_warrior_defensivestance']],
};
let tokenCache;
const rosterProfileCache = new Map();

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

function requestCharacterProfile(token, slug, suffix = '', timeout = 10000) {
  return fetch('https://us.api.blizzard.com/profile/wow/character/' + encodeURIComponent(slug) + suffix + '?namespace=profile-forever-us&locale=en_US', {
    headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(timeout),
  });
}

export function publicRosterProfile(env, slug) {
  if (!slug || !env.BLIZZARD_CLIENT_ID || !env.BLIZZARD_CLIENT_SECRET) return null;
  const key = env.BLIZZARD_CLIENT_ID + ':' + slug;
  const cached = rosterProfileCache.get(key);
  if (cached?.expires > Date.now()) return cached.value;
  const value = (async () => {
    const response = await requestCharacterProfile(await battleNetToken(env),slug,'',3000);
    if (!response.ok) return null;
    const profile = await response.json();
    return { level:Number.isSafeInteger(profile.level) ? profile.level : null, guild:localized(profile.guild?.name) };
  })().catch(()=>null);
  rosterProfileCache.delete(key);
  rosterProfileCache.set(key,{value,expires:Date.now() + 5 * 60 * 1000});
  if (rosterProfileCache.size > 500) rosterProfileCache.delete(rosterProfileCache.keys().next().value);
  return value;
}

function parseProfessions(data) {
  const groups = [data?.primaries, data?.secondaries, data?.professions].filter(Array.isArray);
  return groups.length ? groups.flat().map(entry => ({
    name: localized(entry.profession?.name ?? entry.name),
    skill: Number.isFinite(entry.skill_points) ? entry.skill_points : null,
    maxSkill: Number.isFinite(entry.max_skill_points) ? entry.max_skill_points : null,
    tiers: (Array.isArray(entry.tiers) ? entry.tiers : []).map(tier => ({
      name: localized(tier.tier?.name ?? tier.name),
      skill: Number.isFinite(tier.skill_points) ? tier.skill_points : null,
      maxSkill: Number.isFinite(tier.max_skill_points) ? tier.max_skill_points : null,
    })),
  })).filter(entry => entry.name) : null;
}

export async function guildProfessionSummary(env, slugs) {
  const counts = new Map();
  let reviewed = 0;
  if (!slugs.length || !env.BLIZZARD_CLIENT_ID || !env.BLIZZARD_CLIENT_SECRET) return { reviewed, professions:[] };
  const token = await battleNetToken(env).catch(()=>null);
  if (!token) return { reviewed, professions:[] };
  for (let offset = 0; offset < slugs.length; offset += 8) {
    const profiles = await Promise.all(slugs.slice(offset,offset+8).map(async slug => {
      try {
        const response = await requestCharacterProfile(token,slug,'/professions',3000);
        return response.ok ? parseProfessions(await response.json()) : null;
      } catch { return null; }
    }));
    for (const profile of profiles) {
      if (!profile) continue;
      reviewed++;
      for (const name of new Set(profile.map(entry=>entry.name))) counts.set(name,(counts.get(name) ?? 0)+1);
    }
  }
  const professions = [...counts].sort(([nameA,countA],[nameB,countB])=>countB-countA || nameA.localeCompare(nameB));
  return { reviewed, professions };
}

function parseTalents(data) {
  if (!Array.isArray(data?.specialization_groups)) return null;
  return data.specialization_groups.map(group => ({
    active: group.is_active === true,
    trees: (Array.isArray(group.specializations) ? group.specializations : []).map(tree => ({
      name: localized(tree.specialization_name || tree.specialization?.name),
      points: Number.isSafeInteger(tree.spent_points) && tree.spent_points >= 0 ? tree.spent_points : null,
      talents: (Array.isArray(tree.talents) ? tree.talents : []).filter(talent=>Number.isSafeInteger(talent.talent_rank) && talent.talent_rank > 0).map(talent=>({
        id: talent.talent?.id ?? null,
        name: localized(talent.talent?.name ?? talent.spell_tooltip?.spell?.name),
        rank: talent.talent_rank,
        description: localized(talent.spell_tooltip?.description),
      })),
    })).filter(tree=>tree.name),
  }));
}

async function loadCharacter(env, slug) {
  const token = await battleNetToken(env);
  const requestProfile = suffix => requestCharacterProfile(token,slug,suffix);
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
  const [data, equipment, media, statistics, specializations] = await Promise.all([
    optional('/professions'), optional('/equipment'), optional('/character-media'), optional('/statistics'), optional('/specializations'),
  ]);
  const professions = parseProfessions(data);
  const renders = Array.isArray(media?.assets) ? media.assets : [];
  const mediaUrl = keys => keys.map(key=>renders.find(asset=>asset.key === key)?.value).find(value=>
    typeof value === 'string' && /^https:\/\/render(?:-[a-z]+)?\.worldofwarcraft\.com\//i.test(value));
  const gear = Array.isArray(equipment?.equipped_items) ? equipment.equipped_items.map(item=>({
    id: Number.isSafeInteger(item.item?.id) ? item.item.id : null,
    slotType: item.slot?.type ?? '',
    level: Number.isFinite(item.level?.value) ? item.level.value : null,
    slot: localized(item.slot?.name ?? item.slot?.type),
    name: localized(item.name),
    quality: item.quality?.type ?? 'COMMON',
    details: [localized(item.binding?.name),localized(item.item_subclass?.name),localized(item.armor?.display?.display_string),
      localized(item.weapon?.damage?.display_string),localized(item.weapon?.attack_speed?.display_string),
      localized(item.durability?.display_string),localized(item.requirements?.level?.display_string),
      ...(Array.isArray(item.stats) ? item.stats.map(stat=>localized(stat.display?.display_string)) : []),
    ].filter(Boolean),
    effects: (Array.isArray(item.spells) ? item.spells : []).map(spell=>localized(spell.description)).filter(Boolean),
    enchants: (Array.isArray(item.enchantments) ? item.enchantments : []).map(enchant=>
      localized(enchant.display_string ?? enchant.enchantment?.name ?? enchant.source_item?.name)).filter(Boolean),
  })).filter(item=>item.name) : null;
  const attributes = [
    ['Primary stats',[['Strength',statistics?.strength?.effective],['Agility',statistics?.agility?.effective],
      ['Intellect',statistics?.intellect?.effective],['Stamina',statistics?.stamina?.effective],
      ['Spirit',statistics?.spirit?.effective]]],
    ['Defense',[['Health',statistics?.health],['Armor',statistics?.armor?.effective]]],
    ['Offense',[['Attack power',statistics?.attack_power],['Spell power',statistics?.spell_power]]],
  ].map(([group,values])=>[group,values.filter(([,value])=>Number.isFinite(value))]).filter(([,values])=>values.length);
  return {
    slug, name, level: profile.level ?? null,
    className: localized(profile.character_class?.name),
    race: localized(profile.race?.name),
    faction: localized(profile.faction?.name),
    ruleset: localized(profile.ruleset?.name),
    guild: localized(profile.guild?.name),
    itemLevel: profile.equipped_item_level ?? null,
    professions, gear, attributes, talents:parseTalents(specializations), portrait: mediaUrl(['avatar','inset']) ?? null, render: mediaUrl(['main-raw','main','inset']) ?? null,
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
  const character = await loadCharacter(env, slug);
  if (!character) return reply({ error: 'Character not found in the Armory.' }, 404);
  const spec = input.spec ?? '';
  const specs = Object.hasOwn(armorySpecs,character.className) ? armorySpecs[character.className] : [];
  const selection = specs.find(([name])=>name === spec);
  if (spec !== '' && !selection) return reply({ error:'Select a specialization for this class.' },400);
  const role = selection?.[1] ?? input.role;
  if (!roles.includes(role)) return reply({ error:'Select a specialization or raid role.' },400);
  const result = await db.prepare(`INSERT INTO armory_links (slug, member, role, name, class_name, spec) VALUES (?,?,?,?,?,?)
    ON CONFLICT(slug) DO UPDATE SET role = excluded.role, name = excluded.name, class_name = excluded.class_name, spec = excluded.spec
    WHERE armory_links.member = excluded.member`).bind(slug, member, role, character.name, character.className, spec).run();
  if (!result.meta.changes) return reply({ error: 'This character is already linked to another Discord account.' }, 409);
  return reply({ ok: true });
}

export async function linkedRosterProfiles(db, id) {
  const result = await db.prepare(`SELECT s.member, a.slug, COALESCE(NULLIF(a.spec, ''), c.spec, '') AS spec FROM raid_signups s LEFT JOIN armory_links a
    ON a.member = s.member AND a.name = s.character COLLATE NOCASE AND a.class_name = s.class_name
    LEFT JOIN raid_characters c ON c.member = s.member AND c.name = s.character COLLATE NOCASE AND c.class_name = s.class_name
    WHERE s.raid_id = ?`).bind(id).all();
  return new Map(result.results.map(row=>[row.member,row]));
}
