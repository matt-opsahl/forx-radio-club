// Space-weather snapshot from NOAA SWPC plus a rough HF band outlook.
const CACHE_MS = 15 * 60000;
let cache = null;

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'forx-radio-club' } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function solarFlux() {
  const rows = await getJson('https://services.swpc.noaa.gov/json/f107_cm_flux.json');
  const latest = rows.filter(r => r.flux != null).sort((a, b) => a.time_tag.localeCompare(b.time_tag)).at(-1);
  return latest ? { sfi: Math.round(latest.flux), at: latest.time_tag } : null;
}

async function kIndex() {
  const rows = await getJson('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json');
  const latest = rows.at(-1);
  const kp = latest?.estimated_kp ?? latest?.kp_index;
  return kp == null ? null : { kp: Math.round(kp * 10) / 10, at: latest.time_tag };
}

const LEVELS = ['Poor', 'Fair', 'Good'];

function rate(thresholds, sfi) {
  // thresholds = [fairAt, goodAt]; null means never reaches that level
  const [fair, good] = thresholds;
  if (good != null && sfi >= good) return 2;
  if (fair != null && sfi >= fair) return 1;
  return 0;
}

export function outlook(sfi, kp) {
  const penalty = kp >= 6 ? 2 : kp >= 4 ? 1 : 0;
  const bands = [
    { band: '80m–40m', day: [0, 999], night: [0, 0] },
    { band: '30m–20m', day: [0, 90], night: [80, 120] },
    { band: '17m–15m', day: [90, 120], night: [170, null] },
    { band: '12m–10m', day: [110, 150], night: [null, null] },
  ];
  return bands.map(b => ({
    band: b.band,
    day: LEVELS[Math.max(0, rate(b.day, sfi) - penalty)],
    night: LEVELS[Math.max(0, rate(b.night, sfi) - penalty)],
  }));
}

export function geomag(kp) {
  if (kp >= 5) return 'Storm';
  if (kp >= 4) return 'Active';
  if (kp >= 3) return 'Unsettled';
  return 'Quiet';
}

export async function bandConditions() {
  if (cache && Date.now() - cache.fetched < CACHE_MS) return cache.data;
  try {
    const [f, k] = await Promise.all([solarFlux(), kIndex()]);
    if (!f || !k) throw new Error('missing SWPC data');
    const data = {
      sfi: f.sfi, kp: k.kp, geomag: geomag(k.kp),
      updated: k.at, bands: outlook(f.sfi, k.kp), source: 'NOAA SWPC', stale: false,
    };
    cache = { fetched: Date.now(), data };
    return data;
  } catch (err) {
    console.warn('[band]', err.message);
    if (cache) return { ...cache.data, stale: true };
    return null;
  }
}
