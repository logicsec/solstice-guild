const market = 'forever.normal.alliance.us';
const reportsFeed = 'https://ahledger.com/feed/reports.xml';
const editionRetry = 15 * 60_000;
const easternDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23',
});

export function latestTuesday(now) {
  const parts = Object.fromEntries(easternDate.formatToParts(now).map(({ type, value }) => [type, value]));
  const date = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day));
  const daysSinceTuesday = (date.getUTCDay() + 5) % 7;
  date.setUTCDate(date.getUTCDate() - (daysSinceTuesday || (+parts.hour < 8 ? 7 : 0)));
  return date.toISOString().slice(0, 10);
}

let edition = null;
let nextEditionCheck = 0;
let editionRequest;
export function refreshGoldEdition(now = new Date()) {
  const target = latestTuesday(now);
  if (edition?.date >= target || +now < nextEditionCheck) return editionRequest;
  nextEditionCheck = +now + editionRetry;
  editionRequest = (async () => {
    try {
      const response = await fetch(reportsFeed, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return;
      const xml = await response.text();
      const urls = [...xml.matchAll(/<item\b[^>]*>[\s\S]*?<\/item>/gi)]
        .map(([item]) => item.match(/<link>\s*(https:\/\/ahledger\.com\/reports\/(\d{4}-\d{2}-\d{2}))\s*<\/link>/i))
        .filter(link => link && link[2] <= target)
        .sort((a, b) => b[2].localeCompare(a[2]));
      if (urls.length) edition = { date: urls[0][2], url: urls[0][1] };
    } catch {
      // A later check retries. Keep the last confirmed edition link.
    } finally {
      editionRequest = undefined;
    }
  })();
  return editionRequest;
}

let craftCache;
let craftRequest;
async function loadCraftPicks() {
  if (craftCache?.expires > Date.now()) return craftCache.value;
  if (!craftRequest) {
    craftRequest = (async () => {
      const response = await fetch('https://api.ahledger.com/v1/crafting/' + market + '?limit=100', {
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('Crafting data unavailable');
      const data = await response.json();
      if (data.market !== market || !Array.isArray(data.recipes)) throw new Error('Unexpected crafting data');
      const recipes = data.recipes
        .filter(recipe => Number.isFinite(recipe.margin) && recipe.margin > 0 && !recipe.unpriced?.length && recipe.recipe?.name)
        .sort((a, b) => b.margin - a.margin);
      const byProfession = new Map();
      for (const recipe of recipes) {
        const name = recipe.recipe.profession;
        if (name && !byProfession.has(name)) byProfession.set(name, recipe);
      }
      const value = { recipes: [...byProfession.values()].slice(0, 9), pricesAsOf: data.pricesAsOf };
      const policy = response.headers.get('Cache-Control') ?? '';
      const maxAge = Number(policy.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1] ?? 0);
      const age = Number(response.headers.get('Age') ?? 0);
      if (!/\bno-(?:cache|store)\b/i.test(policy) && maxAge > age) {
        craftCache = { value, expires: Date.now() + (maxAge - age) * 1000 };
      }
      return value;
    })().finally(() => { craftRequest = undefined; });
  }
  return craftRequest;
}

export async function weeklyGoldReport() {
  const [, crafts] = await Promise.allSettled([refreshGoldEdition(), loadCraftPicks()]);
  return {
    edition,
    nextEditionPending: edition?.date !== latestTuesday(new Date()),
    crafts: crafts.status === 'fulfilled' ? crafts.value : null,
  };
}
