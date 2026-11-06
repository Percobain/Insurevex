// Official daily closes from Yahoo Finance's public chart endpoint (no key), cached in memory.
// sigmaDaily = 20-session realised volatility of log returns, known at the latest close (no lookahead).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const cache = new Map(); // yahoo+range -> { at, data }
const inflight = new Map(); // yahoo+range -> Promise
const TTL = 10 * 60 * 1000;
const FETCH_TIMEOUT = 10000;
// Yahoo serves the same API from two hosts; either can be slow or drop connections, so try both.
const HOSTS = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];

// Last good prices are kept on disk so a restart or a price-source outage never leaves the app without prices.
const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = process.env.PRICE_CACHE_FILE || (process.env.VERCEL ? "/tmp/insurevex-prices.json" : path.join(here, "..", "data", "price-cache.json"));
try {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")))) cache.set(k, { at: 0, data: v }); // at 0: stale, refresh on use
} catch {}
let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries([...cache].map(([k, v]) => [k, v.data]))));
    } catch {}
  }, 2000);
  saveTimer.unref?.();
}

// At most a few concurrent requests to the price source: a burst of 100+ gets throttled and stalls everything.
const MAX_CONCURRENT = 12;
let active = 0;
const waiting = [];
async function limited(fn) {
  if (active >= MAX_CONCURRENT) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

/** Price history. Stale-while-revalidate: a cached result is returned immediately even if it is past its TTL,
 *  and refreshed in the background, so a cold cache never blocks a page load. Pass { fresh: true } where a
 *  stale value is not acceptable (settlement). */
export async function history(yahoo, range = "2y", { fresh = false } = {}) {
  const key = yahoo + range;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const load = inflight.get(key) || startLoad(yahoo, range, key);
  if (hit && !fresh) { load.catch(() => {}); return hit.data; }
  return load;
}

function startLoad(yahoo, range, key) {
  const p = limited(() => fetchHistory(yahoo, range)).then((data) => { cache.set(key, { at: Date.now(), data }); saveSoon(); return data; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function fetchChart(yahoo, range) {
  let lastErr;
  for (const host of HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(yahoo)}?range=${range}&interval=1d`;
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 InsureVEX/1.0" }, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      if (res.status === 404) throw Object.assign(new Error(`no data for ${yahoo}`), { final: true });
      if (!res.ok) throw new Error(`price source ${res.status} for ${yahoo}`);
      return await res.json();
    } catch (e) {
      if (e.final) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

async function fetchHistory(yahoo, range) {
  const j = await fetchChart(yahoo, range);
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(`no data for ${yahoo}`);
  const ts = r.timestamp || [];
  const closes = r.indicators?.adjclose?.[0]?.adjclose || r.indicators?.quote?.[0]?.close || [];
  const rows = [];
  for (let i = 0; i < ts.length; i++) if (closes[i] != null && closes[i] > 0) rows.push([ts[i], closes[i]]);
  if (rows.length < 25) throw new Error(`not enough history for ${yahoo}`);
  const lr = [];
  for (let i = 1; i < rows.length; i++) lr.push(Math.log(rows[i][1] / rows[i - 1][1]));
  const last20 = lr.slice(-20);
  const mean = last20.reduce((a, b) => a + b, 0) / last20.length;
  const sigmaDaily = Math.sqrt(last20.reduce((a, b) => a + (b - mean) ** 2, 0) / (last20.length - 1));
  // EWMA (lambda 0.94) daily vol and 1-year vol: the winning backtest model blends them 50/50 (mean reversion).
  let ew = lr.slice(0, 20).reduce((a, b) => a + b * b, 0) / 20;
  for (const x of lr.slice(20)) ew = 0.94 * ew + 0.06 * x * x;
  const ewmaDaily = Math.sqrt(ew);
  const y = lr.slice(-252);
  const ym = y.reduce((a, b) => a + b, 0) / y.length;
  const vol1yDaily = Math.sqrt(y.reduce((a, b) => a + (b - ym) ** 2, 0) / (y.length - 1));
  const sigmaBlend = Math.sqrt(0.5 * ewmaDaily ** 2 + 0.5 * vol1yDaily ** 2);
  const meta = r.meta || {};
  const data = {
    yahoo,
    currency: meta.currency,
    close: rows[rows.length - 1][1],
    closeTs: rows[rows.length - 1][0],
    live: meta.regularMarketPrice ?? rows[rows.length - 1][1],
    liveTs: meta.regularMarketTime ?? rows[rows.length - 1][0],
    sigmaDaily,
    ewmaDaily,
    vol1yDaily,
    sigmaBlend,
    rows,
  };
  return data;
}

/** Official close on or before a unix timestamp (used for settlement). Falls back to the live price for
 *  intraday demo expiries that end before the next official close. */
export async function closeAt(yahoo, ts) {
  const h = await history(yahoo, "3mo", { fresh: true });
  let best = null;
  for (const [t, c] of h.rows) if (t <= ts) best = [t, c];
  if (h.liveTs <= ts || !best || ts - best[0] > 3 * 86400) return { price: h.live, ts: h.liveTs, source: "last trade" };
  return { price: best[1], ts: best[0], source: "official close" };
}
