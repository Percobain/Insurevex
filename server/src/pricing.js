// InsureVEX pricing engine: pooled, volatility-scaled empirical tail (the afterhours v4 engine, extended to
// 1-4 week floors and a global universe). For a stock with 20-day daily vol sigma_d and a tenor of n sessions:
//   sigma_p = sigma_d * sqrt(n)
//   fair    = E[ min(max(-b - sigma_p * z, 0), c) ]   over the pooled historical z = r_n / sigma_p
//   premium = max(markup * fair, floor);  refused when premium > maxFee
// The z distribution comes from tens of thousands of past n-day windows across every market (data/ztable.json).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const Z = JSON.parse(fs.readFileSync(path.join(here, "..", "data", "ztable.json"), "utf8"));
const TABLES = Object.fromEntries(Object.entries(Z).filter(([k]) => /^\d+$/.test(k)).map(([k, v]) => [Number(k), v.quantiles]));
const HORIZONS = Object.keys(TABLES).map(Number).sort((a, b) => a - b);

export const PARAMS = {
  markup: Number(process.env.PRICING_MARKUP || 1.5),
  floorBps: 1, // minimum premium 0.01% of notional
  maxFeeBpsPerMonth: 200, // refuse when the premium would exceed 2% of notional per month
};

function table(n) {
  let best = HORIZONS[0];
  for (const h of HORIZONS) if (Math.abs(h - n) < Math.abs(best - n)) best = h;
  return TABLES[best];
}

// mean(max(k - z, 0)) over the quantile grid (equal-probability points)
function lowerPartial(q, k) {
  let s = 0;
  for (const z of q) if (z < k) s += k - z;
  return s / q.length;
}

/** @returns fair and charged premium as fractions of notional */
export function priceFloor({ sigmaDaily, sessions, deductible, cap, markup = PARAMS.markup }) {
  const sigmaP = sigmaDaily * Math.sqrt(sessions);
  const q = table(sessions);
  const fair = sigmaP * (lowerPartial(q, -deductible / sigmaP) - lowerPartial(q, -(deductible + cap) / sigmaP));
  const charged = Math.max(markup * fair, PARAMS.floorBps / 1e4);
  const maxFee = (PARAMS.maxFeeBpsPerMonth / 1e4) * Math.min(1, sessions / 21) ** 0.5;
  const refused = charged > maxFee;
  // probability of any payout, for the UI
  const kz = -deductible / sigmaP;
  const pHit = q.filter((z) => z < kz).length / q.length;
  return {
    sigmaP,
    fair,
    charged,
    maxFee,
    refused,
    reason: refused ? `Too volatile right now: the fair premium would exceed ${(maxFee * 100).toFixed(2)}% of the protected value` : null,
    pPayout: pHit,
    horizonUsed: HORIZONS.reduce((a, h) => (Math.abs(h - sessions) < Math.abs(a - sessions) ? h : a), HORIZONS[0]),
  };
}

export const ENGINE_INFO = { source: Z.source, horizons: HORIZONS, obs: Object.fromEntries(Object.entries(Z).filter(([k]) => /^\d+$/.test(k)).map(([k, v]) => [k, v.n_obs])) };
