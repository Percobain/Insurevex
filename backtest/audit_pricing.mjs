// Offline independent payoff integration against the deployed pricing table.
// Run: node backtest/audit_pricing.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { priceFloor } from '../server/src/pricing.js';

const engine = JSON.parse(fs.readFileSync(new URL('../server/data/engine.json', import.meta.url), 'utf8'));
let checks = 0, maxError = 0;
for (const sessions of [5, 10, 21])
  for (const sigmaDaily of [.001, .005, .01, .02, .05, .1])
    for (const deductible of [.03, .05, .075, .1, .15])
      for (const cap of [.1, .2, .3])
        for (const market of ['US', 'IN', 'DE']) {
          const p = priceFloor({ sigmaDaily, sessions, deductible, cap, market });
          const q = engine.horizons[sessions].quantiles;
          // Direct evaluation avoids subtracting two large partial moments.
          const direct = p.factor * q.reduce((s, z) => s + Math.min(Math.max(-deductible - p.sigmaP * z, 0), cap), 0) / q.length;
          const error = Math.abs(direct - p.fair);
          maxError = Math.max(maxError, error);
          assert.ok(error < 1e-9, `payoff mismatch: ${JSON.stringify({ sessions, sigmaDaily, deductible, cap, market })}`);
          checks++;
        }
console.log(JSON.stringify({ checks, maxError, result: 'PASS: formula agrees with direct payoff integration',
  caveat: 'Checks arithmetic on exported tables, not historical calibration or data quality',
  tables: Object.fromEntries(Object.entries(engine.horizons).map(([h, v]) => [h, {
    observations: v.n_obs, quantiles: v.quantiles.length,
    minimum_z: v.quantiles[0], second_quantile_z: v.quantiles[1],
    maximum_z: v.quantiles.at(-1), endpoint_weight: 1 / v.quantiles.length,
    endpoint_weight_relative_to_one_original_observation: v.n_obs / v.quantiles.length,
  }])) }, null, 2));
