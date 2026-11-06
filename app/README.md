# InsureVEX app

Next.js 14 (App Router, JavaScript), Tailwind, wagmi v2 + viem, RainbowKit and recharts.

## Run

```bash
cp .env.example .env.local   # optional
npm install
npm run dev                  # http://localhost:3000
npm run build && npm start   # production
```

The app builds and runs without the server. Pages that need the server (live symbols, quotes, holdings attestation, KYC
requests) say so, and everything on-chain (notes, pool, policies, issuer controls, activity) still reads from the chain directly.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | InsureVEX server (see `../shared/INTERFACE.md`) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | empty | Enables WalletConnect wallets. Without it, injected (extension) wallets only |
| `NEXT_PUBLIC_DEFAULT_CHAIN_ID` | `1874` | Default chain: 1874 Whitechain Sepolia, 296 Hedera testnet, 5042002 Arc testnet |
| `NEXT_PUBLIC_SITE_URL` | `https://insurevex-app.vercel.app` | Public site origin for social previews and wallet branding |

## Data the app reads

| Source | Path |
|---|---|
| Contract addresses | `src/deployments/<network>.json` (every JSON present at build time is loaded; missing chains show "deploying soon") |
| ABIs | `src/abi/*.json`, plus the Pro-tranche fragment in `src/lib/contracts.js` |
| Backtest results | `public/data/*.json`, written by `backtest/run_world.py` |

## Pages

| Route | What it does |
|---|---|
| `/` | The story, live pool stats, backtest headline, exchanges, chains |
| `/protect` | Holder flow: pick a stock on 23 exchanges, size and terms, prove holdings (broker attestation or tokenised balance), quote, approve, `buyCover`; my policies with settle |
| `/save` | Note series from the chain (floor/sleeve split via `floorFor`), subscribe, coupons, mature and redeem; backtest calculator |
| `/pool` | Pool assets, locked collateral, capacity, risk limits, loss ratio, T-bill NAV and reserve, Pro first-loss tranche, open cover by stock |
| `/docs` | Research: equity curve, loss ratio by year, per-market table, correlation heatmap, pricing models, walk-forward configs, saver distributions, holder event cards, stress, formulas |
| `/issuer` | Role-gated controls: KYC approve/revoke, freeze, block country, pause, forced transfer, post official close, settle, T-bill NAV and reserve, coupons, risk limits |
| `/activity` | On-chain events from the server, or straight from chain logs when it is offline |

## Brand assets

The approved logo and its derivatives live in `public/brand/`. Use `logo.svg` for the horizontal lockup,
`wordmark.svg` for the lettering, and `icon.svg` for the standalone mark. Each has a transparent PNG and a
`-light` version for dark backgrounds. The shared `BrandLogo` component supplies the header and footer.

Favicons, home-screen icons, app icons, the web manifest, sharing metadata and wallet metadata use this
identity. `public/brand/USAGE.txt` lists the exports. The original approved image and generation prompts are
preserved in `public/brand/source/`; `scripts/export-brand.mjs` reproducibly exports the vector and raster set
without adding image-processing libraries to the app's runtime dependencies.
