import { gearItems } from '../public/assets/gear-items.js';

const databaseUrl = 'https://www.wowsims.com/forever/assets/database/db.json';
let cached = null;
let pending = null;
export function normalizeGearDatabase(database) {
 if (!Array.isArray(database.items) || !database.items.length) throw Error('Invalid item database');
 const zones = new Map((database.zones ?? []).map(row => [row.id,row.name]));
 const npcs = new Map((database.npcs ?? []).map(row => [row.id,row.name]));
 return database.items.filter(item => Number.isSafeInteger(item.id) && typeof item.name === 'string' && item.type > 0 && item.type <= 14).map(item => {
  const baseline = item.scalingOptions?.['0'] ?? {};
  const sources = (item.sources ?? []).flatMap(source => Object.entries(source).map(([kind,value]) => {
   if (kind === 'drop') return [zones.get(value.zoneId),npcs.get(value.npcId),value.otherName].filter(Boolean).join(' · ') || 'Drop';
   if (kind === 'quest') return 'Quest: '+(value.name || 'Quest reward');
   return ({crafted:'Crafted',rep:'Reputation',soldBy:'Vendor'})[kind] || '';
  })).filter(Boolean);
  const result = {ilvl:baseline.ilvl ?? 0,stats:baseline.stats ?? {},source:[...new Set(sources)].join('; ')};
  for (const field of ['id','name','icon','type','armorType','weaponType','handType','reqLvl','phase','quality','classAllowlist','unique']) if (item[field] != null) result[field] = item[field];
  return result;
 });
}
export async function refreshGearCatalog() {
 if (pending) return pending;
 pending = (async () => {
  try {
   const headers = {};
   if (cached?.etag) headers['If-None-Match'] = cached.etag;
   if (cached?.modified) headers['If-Modified-Since'] = cached.modified;
   const response = await fetch(databaseUrl,{headers,signal:AbortSignal.timeout(10000)});
   if (response.status !== 304 || !cached) {
    if (!response.ok) throw Error('Database unavailable');
    const items = normalizeGearDatabase(await response.json());
    if (!items.length) throw Error('Empty database');
    cached = {items,etag:response.headers.get('etag'),modified:response.headers.get('last-modified')};
   }
   return {items:cached.items,source:'WoWSims Forever',fresh:true,checkedAt:new Date().toISOString()};
  } catch {
   return {items:cached?.items ?? gearItems,source:cached ? 'Last loaded WoWSims database' : 'Bundled WoWSims database',fresh:false,checkedAt:null};
  }
 })();
 try { return await pending; } finally { pending = null; }
}
