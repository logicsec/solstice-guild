export function parseTable(raw) {
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


const catalogLifetime = 24 * 60 * 60 * 1000;
const snapshotLifetime = 60 * 1000;
const batchInterval = 5000;
const batchSize = 16;
let snapshot;
let activeScan;
let nextBatch = 0;

async function readSnapshot(db, market, now) {
  const response = await fetch('https://api.ahledger.com/v1/pricetable/'+market,{signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Auction snapshot unavailable.');
  const {parsed,timestamp} = parseTable(await response.text());
  if (snapshot?.timestamp === timestamp.toISOString()) {
    snapshot.refreshAt = now + snapshotLifetime;
    return snapshot;
  }
  const {results} = await db.prepare('SELECT item_id, name, copper FROM vendor_values WHERE checked_at >= ?')
    .bind(now-catalogLifetime).all();
  const known = new Map(results.map(item=>[item.item_id,item]));
  const listings = parsed.filter(item=>item.min > 0);
  const pending = listings.filter(item=>!known.has(item.id)).sort((a,b)=>a.min-b.min);
  return {timestamp:timestamp.toISOString(),refreshAt:now+snapshotLifetime,listings,known,pending,unavailable:0};
}

async function checkVendor(item) {
  try {
    const response = await fetch('https://api.ahledger.com/v1/items/'+item.id+'?game=forever',{signal:AbortSignal.timeout(5000)});
    if (!response.ok) return null;
    const data = await response.json();
    if (data.id !== item.id || typeof data.name !== 'string' || !Number.isSafeInteger(data.vendorSell) || data.vendorSell < 0) return null;
    return {item_id:item.id,name:data.name,copper:data.vendorSell};
  } catch { return null; }
}

async function scan(db, market) {
  const now = Date.now();
  if (!snapshot || snapshot.refreshAt <= now) snapshot = await readSnapshot(db,market,now);
  if (snapshot.pending.length && now >= nextBatch) {
    nextBatch = now + batchInterval;
    const items = snapshot.pending.slice(0,batchSize);
    const values = (await Promise.all(items.map(checkVendor))).filter(Boolean);
    if (values.length) {
      await db.batch(values.map(item=>db.prepare(`INSERT INTO vendor_values (item_id,name,copper,checked_at)
        VALUES (?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET name=excluded.name,copper=excluded.copper,checked_at=excluded.checked_at`)
        .bind(item.item_id,item.name,item.copper,now)));
      for (const item of values) snapshot.known.set(item.item_id,item);
    }
    snapshot.unavailable += items.length-values.length;
    snapshot.pending.splice(0,items.length);
  }
  const flips = [];
  let checked = 0;
  for (const item of snapshot.listings) {
    const vendor = snapshot.known.get(item.id);
    if (!vendor) continue;
    checked++;
    const profit = vendor.copper-item.min;
    if (profit > 0) flips.push({id:item.id,name:vendor.name,min:item.min,vendor:vendor.copper,profit});
  }
  flips.sort((a,b)=>b.profit-a.profit || a.id-b.id);
  return {timestamp:snapshot.timestamp,checked,total:snapshot.listings.length,
    unavailable:snapshot.unavailable,complete:!snapshot.pending.length,flips};
}

export function scanVendorFlips(db, market) {
  activeScan ??= scan(db,market).finally(()=>{ activeScan = null; });
  return activeScan;
}
