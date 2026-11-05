// InsureVEX pricing engine: the winner of the world backtest (hier_mr50, 23 markets, 543 stocks, 1999-2026).
//   sigma   = sqrt(0.5 * EWMA_vol^2 + 0.5 * vol_1y^2)            (mean-reverting daily vol)
//   sigma_p = sigma * sqrt(n sessions)
//   fair    = factor_market * E[ min(max(-b - sigma_p * z, 0), c) ]  over the pooled global z = r_n / sigma_p
//   premium = max(markup * fair, floor);  refused when premium > maxFee
// factor_market is each market's credibility-weighted realised/predicted payout ratio (shrunk towards 1).
// Out of sample, realised payouts were 0.98x this model's prediction (calibration error 0.19, against 0.39 for the
// earlier single-vol engine and 0.69 for Black-Scholes at 1.2x realised vol).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = JSON.parse(fs.readFileSync(path.join(here, "..", "data", "engine.json"), "utf8"));
const TABLES = Object.fromEntries(Object.entries(ENGINE.horizons).map(([k, v]) => [Number(k), v]));
const HORIZONS = Object.keys(TABLES).map(Number).sort((a, b) => a - b);

export const PARAMS = {
  markup: Number(process.env.PRICING_MARKUP || 1.5),
  floorBps: 1, // minimum premium 0.01% of notional
  maxFeeBpsPerMonth: 200, // refuse when the premium would exceed 2% of notional per month (scaled by sqrt(time))
};
// Walk-forward choice of product terms in 21 of 23 years.
export const RECOMMENDED = { tenorDays: 7, deductibleBps: 300, capBps: 1000 };

function horizonFor(n) {
  return HORIZONS.reduce((a, h) => (Math.abs(h - n) < Math.abs(a - n) ? h : a), HORIZONS[0]);
}

function lowerPartial(q, k) {
  let s = 0;
  for (const z of q) if (z < k) s += k - z;
  return s / q.length;
}

/** Market calibration factor for this horizon and the nearest (b, c) the backtest calibrated. */
export function marketFactor(market, h, b, c) {
  const sets = ENGINE.marketFactors[TABLES[h].period] || {};
  let best = null;
  let dist = Infinity;
  for (const key of Object.keys(sets)) {
    const [kb, kc] = key.split("_").map(Number);
    const d = Math.abs(kb - b) + Math.abs(kc - c);
    if (d < dist) { dist = d; best = key; }
  }
  const f = best ? sets[best][market] : undefined;
  return typeof f === "number" ? f : 1;
}

/** @returns fair and charged premium as fractions of notional */
export function priceFloor({ sigmaDaily, sessions, deductible, cap, market = "US", markup = PARAMS.markup }) {
  const h = horizonFor(sessions);
  const q = TABLES[h].quantiles;
  const sigmaP = sigmaDaily * Math.sqrt(sessions);
  const factor = marketFactor(market, h, deductible, cap);
  const fair = factor * sigmaP * (lowerPartial(q, -deductible / sigmaP) - lowerPartial(q, -(deductible + cap) / sigmaP));
  const charged = Math.max(markup * fair, PARAMS.floorBps / 1e4);
  const maxFee = (PARAMS.maxFeeBpsPerMonth / 1e4) * Math.min(1, sessions / 21) ** 0.5;
  const refused = charged > maxFee;
  const kz = -deductible / sigmaP;
  const pPayout = q.filter((z) => z < kz).length / q.length;
  return {
    sigmaP, fair, charged, maxFee, refused, factor, pPayout, horizonUsed: h,
    reason: refused ? `Too volatile right now: the fair premium would exceed ${(maxFee * 100).toFixed(2)}% of the protected value` : null,
  };
}

export const ENGINE_INFO = {
  model: ENGINE.model, vol: ENGINE.vol, source: ENGINE.source, horizons: HORIZONS,
  obs: Object.fromEntries(Object.entries(TABLES).map(([k, v]) => [k, v.n_obs])),
};
