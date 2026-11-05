// Official daily closes from Yahoo Finance's public chart endpoint (no key), cached in memory.
// sigmaDaily = 20-session realised volatility of log returns, known at the latest close (no lookahead).
const cache = new Map(); // yahoo -> { at, data }
const TTL = 10 * 60 * 1000;

export async function history(yahoo, range = "2y") {
  const hit = cache.get(yahoo + range);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 InsureVEX/1.0" } });
  if (!res.ok) throw new Error(`price source ${res.status} for ${yahoo}`);
  const j = await res.json();
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
  cache.set(yahoo + range, { at: Date.now(), data });
  return data;
}

/** Official close on or before a unix timestamp (used for settlement). Falls back to the live price for
 *  intraday demo expiries that end before the next official close. */
export async function closeAt(yahoo, ts) {
  const h = await history(yahoo, "3mo");
  let best = null;
  for (const [t, c] of h.rows) if (t <= ts) best = [t, c];
  if (h.liveTs <= ts || !best || ts - best[0] > 3 * 86400) return { price: h.live, ts: h.liveTs, source: "last trade" };
  return { price: best[1], ts: best[0], source: "official close" };
}
