// Shared by the real CRE workflow and the API receiver. No Node-only APIs.
export const PROVIDERS = ["yahoo", "stooq"];
export const DEFAULT_RULES = Object.freeze({ maxDeviationBps: 50, maxObservationAge: 300, maxCloseAge: 4 * 86400 });
function requireThat(ok, message) { if (!ok) throw new Error(message); }

export function priceUnits(value) {
  requireThat(typeof value === "string" && /^(0|[1-9]\d{0,10})(\.\d{1,8})?$/.test(value), "Invalid closing price");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, "0"));
}

const holidayWindow = (month, day) => (month === 7 && day <= 5) || (month === 11 && day >= 22) || (month === 12 && day >= 23 && day <= 26);
export function regularUsClose(date, allowHolidayWindow = false) {
  requireThat(typeof date === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(date), "Invalid trading session date");
  const [year, month, day] = date.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  requireThat(base.toISOString().slice(0, 10) === date && year >= 2007, "Invalid trading session");
  requireThat(base.getUTCDay() !== 0 && base.getUTCDay() !== 6, "Closing session cannot be a weekend");
  // This first integration intentionally excludes holiday/early-close windows.
  // It fails closed instead of pretending to implement a complete exchange calendar.
  requireThat(allowHolidayWindow || !holidayWindow(month, day), "Holiday-window settlement requires an exchange calendar adapter");
  const sunday = (m, nth) => 1 + (7 - new Date(Date.UTC(year, m - 1, 1)).getUTCDay()) % 7 + (nth - 1) * 7;
  const dstStart = Date.UTC(year, 2, sunday(3, 2), 7);
  const dstEnd = Date.UTC(year, 10, sunday(11, 1), 6);
  const midday = base.getTime() + 12 * 3600000;
  return Math.floor((base.getTime() + (midday >= dstStart && midday < dstEnd ? 20 : 21) * 3600000) / 1000);
}

export function sourceUrls(job) {
  requireThat(/^(NASDAQ|NYSEARCA|NYSE):[A-Z.]{1,10}$/.test(job.symbol), "Unsupported stock symbol");
  const ticker = job.symbol.split(":")[1];
  return {
    yahoo: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${job.expiry - 8 * 86400}&period2=${job.expiry + 86400}&interval=1d`,
    stooq: `https://stooq.com/q/d/l/?s=${encodeURIComponent(ticker.toLowerCase())}.us&i=d&d1=${new Date((job.expiry - 8 * 86400) * 1000).toISOString().slice(0, 10).replaceAll("-", "")}&d2=${new Date(job.expiry * 1000).toISOString().slice(0, 10).replaceAll("-", "")}`,
  };
}

export function parseYahoo(body, job, observedAt) {
  const result = JSON.parse(body)?.chart?.result?.[0];
  requireThat(result?.meta?.currency === "USD", "Yahoo quote currency must be USD");
  const ticker = job.symbol.split(":")[1];
  requireThat(result.meta.symbol === ticker, "Yahoo ticker mismatch");
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  let best;
  for (let i = 0; i < timestamps.length; i++) {
    const price = closes[i];
    if (price == null) continue;
    const sessionDate = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    const closeAt = regularUsClose(sessionDate, true);
    if (closeAt > job.expiry || closeAt > observedAt) continue;
    requireThat(Number.isFinite(price) && price >= 0 && price < 1e11, "Invalid Yahoo closing price");
    if (!best || closeAt > best.closeAt) best = { provider: "yahoo", symbol: job.symbol, currency: "USD", sessionDate, closeAt, price: price.toFixed(8), observedAt };
  }
  requireThat(best, "Yahoo has no completed official session for this expiry");
  regularUsClose(best.sessionDate);
  return best;
}

export function parseStooq(body, job, observedAt) {
  const lines = body.trim().split(/\r?\n/);
  requireThat(lines[0] === "Date,Open,High,Low,Close,Volume", "Invalid Stooq CSV");
  let best;
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const fields = line.split(",");
    requireThat(fields.length === 6, "Malformed Stooq row");
    const closeAt = regularUsClose(fields[0], true);
    if (closeAt > job.expiry || closeAt > observedAt) continue;
    priceUnits(fields[4]);
    if (!best || closeAt > best.closeAt) best = { provider: "stooq", symbol: job.symbol, currency: "USD", sessionDate: fields[0], closeAt, price: fields[4], observedAt };
  }
  requireThat(best, "Stooq has no completed official session for this expiry");
  regularUsClose(best.sessionDate);
  return best;
}

export function validateObservations(job, observations, now, rules = DEFAULT_RULES) {
  requireThat(Number.isSafeInteger(now) && Number.isSafeInteger(job.expiry) && job.expiry <= now, "Policy has not expired");
  const expiryDate = new Date(job.expiry * 1000);
  requireThat(!holidayWindow(expiryDate.getUTCMonth() + 1, expiryDate.getUTCDate()), "Expiry in a holiday window requires an exchange calendar adapter");
  requireThat(Array.isArray(observations) && observations.length === 2, "Two independent providers are required");
  const sources = new Set();
  let session;
  const prices = [];
  for (const o of observations) {
    requireThat(o && PROVIDERS.includes(o.provider) && !sources.has(o.provider), "Missing or duplicate provider");
    sources.add(o.provider);
    requireThat(o.symbol === job.symbol && o.currency === "USD", "Source symbol or currency mismatch");
    requireThat(Number.isSafeInteger(o.observedAt) && o.observedAt <= now + 30 && now - o.observedAt <= rules.maxObservationAge, "Stale or future observation");
    requireThat(Number.isSafeInteger(o.closeAt) && o.closeAt === regularUsClose(o.sessionDate), "Invalid session close timestamp");
    requireThat(o.closeAt <= job.expiry && job.expiry - o.closeAt <= rules.maxCloseAge, "Close is outside the policy expiry window");
    requireThat(!session || session === o.sessionDate, "Providers disagree on the trading session");
    session = o.sessionDate;
    prices.push(priceUnits(o.price));
  }
  const [low, high] = prices.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  requireThat(low === 0n ? high === 0n : (high - low) * 10000n <= low * BigInt(rules.maxDeviationBps), "Closing prices exceed the disagreement threshold");
  return { price: ((low + high) / 2n).toString(), sessionDate: session, closeAt: observations[0].closeAt,
    providers: [...sources].sort(), observations };
}
