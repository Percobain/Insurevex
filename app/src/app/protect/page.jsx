"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { parseEther, formatEther, keccak256, toBytes } from "viem";
import { ABI, ERC20_ABI, addr, stableSymbol } from "@/lib/contracts";
import { apiGet, apiPost, useApi } from "@/lib/api";
import { EXCHANGES, flag } from "@/lib/exchanges";
import { fmtMoney, fmtNum, fmtPct, fromUnits, shortHash, symbolId } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { PageHead, Section, SectionHead, Seg, Notice, Row, useActiveChain, DeployGate, HeroCtas, HowItWorks, Faq, More } from "@/components/ui";
import { HolderArt } from "@/components/IsoArt";
import { useKyc } from "@/components/KycBadge";
import PriceChart from "@/components/PriceChart";
import MyPolicies from "@/components/MyPolicies";
import StockPicker from "@/components/StockPicker";

function Step({ n, title, children, done }) {
  return (
    <div className="card p-5 sm:p-6 min-w-0">
      <div className="flex items-center gap-3">
        <span className={`h-7 w-7 rounded-full grid place-items-center text-xs font-semibold ${done ? "bg-good text-white" : "bg-sunk text-ink2"}`}>{done ? "✓" : n}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

const STEPS = [
  { icon: "search", title: "Pick your stock", body: "From your broker or tokenised on-chain. You keep your shares.", stat: "23 exchanges" },
  { icon: "pay", title: "Pay a small fee", body: "The most you can be paid is fixed before you buy.", stat: "≈ $90 per $10k a month" },
  { icon: "shield", title: "Paid if it crashes", body: "If the official close falls past your threshold, the vault pays the difference.", stat: "Paid automatically" },
];

const FAQ = [
  ["What exactly is covered?", "A band of the fall. With the default settings you absorb the first 10%, and the vault pays the next 20%. So a 25% fall pays 15% of your protected value, and anything past 30% pays the full 20%."],
  ["Do I have to sell my shares?", "No. You keep your shares where they are. You only prove you hold them, so cover never exceeds what you own."],
  ["How is the price set?", "From the stock's recent volatility, compared with the history of past falls across every market, plus a risk margin. Stocks already in free fall are refused."],
  ["Is the payout guaranteed to be there?", "Yes. The maximum payout of every policy is locked in the vault the moment you buy, before the policy exists."],
  ["Which price decides the payout?", "The exchange's official closing price at your expiry time, posted on-chain. Anyone can trigger settlement after expiry."],
];

function PayoutExample() {
  const rows = [["Falls 5%", "$0", "Inside the first 10% you absorb"], ["Falls 25%", "$1,500", "Vault pays 25% − 10%"], ["Falls 40%", "$2,000", "Capped at 20% of $10,000"]];
  return (
    <div className="card p-5 sm:p-6">
      <div className="text-sm text-ink2">You protect <b className="text-ink">$10,000</b> of NVIDIA for 1 month and pay <b className="text-ink">$90</b>.</div>
      <div className="mt-4 divide-y divide-line">
        {rows.map(([k, v, sub]) => (
          <div key={k} className="py-3 flex items-center justify-between gap-4">
            <div><div className="font-medium">{k}</div><div className="text-xs text-muted">{sub}</div></div>
            <div className={`text-xl font-semibold tabular ${v === "$0" ? "text-muted" : "text-good"}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-3 border-t border-line text-xs text-muted">The stock stays calm? Your $90 goes to the savers who backed it.</div>
    </div>
  );
}

export default function ProtectPage() {
  const { chainId, address, isConnected, deployed } = useActiveChain();
  const kyc = useKyc();
  const stable = stableSymbol(chainId);
  const markets = useApi("/api/markets");
  const serverMarkets = markets.data?.markets || [];
  const offline = markets.isError;

  const [marketId, setMarketId] = useState("US");
  const [search, setSearch] = useState("");
  const [symbol, setSymbol] = useState(null);
  const [sharesHeld, setSharesHeld] = useState("50");
  const [sharesCover, setSharesCover] = useState("1");
  const [notional, setNotional] = useState("");
  const [notionalTouched, setNotionalTouched] = useState(false);
  const [tenor, setTenor] = useState(28);
  const [b, setB] = useState(1000);
  const [c, setC] = useState(2000);
  const [source, setSource] = useState("statement");
  const [path, setPath] = useState("broker");
  const [attest, setAttest] = useState(null);
  const [attesting, setAttesting] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteErr, setQuoteErr] = useState("");
  const { run, busy } = useTx();

  // server market ids are ISO-like codes (US, IN, UK, ...); the picker uses EXCHANGES ids
  const exchange = EXCHANGES.find((e) => e.id === marketId);
  const serverId = (e) => (e?.code === "GB" ? "UK" : e?.code);
  const market = serverMarkets.find((m) => m.id === serverId(exchange) || m.id === marketId) || null;
  const symbolsFor = useCallback((e) => serverMarkets.find((m) => m.id === serverId(e) || m.id === e.id)?.symbols || [], [serverMarkets]);
  const symbols = useMemo(() => {
    const list = market?.symbols || [];
    const q = search.trim().toLowerCase();
    return q ? list.filter((s) => `${s.symbol} ${s.name} ${s.ticker}`.toLowerCase().includes(q)) : list;
  }, [market, search]);

  // value suggestion: shares x last close (local currency); the cover notional is in USD
  useEffect(() => {
    setQuote(null);
    setAttest(null);
  }, [symbol, chainId, address]);
  useEffect(() => setQuote((q) => (q && q._b === b ? q : null)), [sharesCover, notional, tenor, b, c]);
  // last close in USD: cover is sized and paid in dollars, foreign closes are converted at the latest FX close
  const usdClose = symbol ? (symbol.lastCloseUsd ?? ((symbol.currency || "USD") === "USD" ? symbol.lastClose : null)) : null;
  // protected value follows shares-to-cover x USD close until the user types their own value
  useEffect(() => {
    if (notionalTouched || !usdClose) return;
    const v = Number(sharesCover || 0) * usdClose;
    setNotional(v > 0 ? String(Math.round(v * 100) / 100) : "");
  }, [sharesCover, usdClose, notionalTouched]);

  const cover = (() => { try { return parseEther(String(sharesCover || "0")); } catch { return 0n; } })();
  const held = (() => { try { return parseEther(String(sharesHeld || "0")); } catch { return 0n; } })();

  async function doAttest() {
    setAttesting(true);
    try {
      const r = await apiPost("/api/holdings/attest", { address, symbol: symbol.symbol, source: source === "ibkr" ? "statement" : source, broker: source, shares: sharesHeld, chainId });
      setAttest(r);
    } catch (e) {
      setAttest({ error: String(e.message || e) });
    } finally {
      setAttesting(false);
    }
  }

  async function getQuote(bOverride) {
    if (bOverride !== undefined) setB(bOverride);
    setQuoting(true);
    setQuoteErr("");
    try {
      const qs = new URLSearchParams({
        chainId: String(chainId), buyer: address || "0x0000000000000000000000000000000000000000", symbol: symbol.symbol,
        notional: String(Math.round(Number(notional) * 100) / 100), shares: String(sharesCover || "0"),
        heldShares: path === "token" && atsToken ? String(atsHeld) : attest?.heldShares ? formatEther(BigInt(attest.heldShares)) : String(sharesHeld || "0"),
        deductibleBps: String(bOverride ?? b), capBps: String(c),
      });
      if (tenor === "10m") qs.set("tenorMinutes", "10"); else qs.set("tenorDays", String(tenor));
      const r = await apiGet(`/api/quote?${qs.toString()}`);
      if (!r.ok || r.pricing?.refused) setQuoteErr(r.pricing?.reason || r.error || "The pool cannot quote this cover right now.");
      setQuote({ ...r, _b: bOverride ?? b });
    } catch (e) {
      setQuoteErr(String(e.message || e));
    } finally {
      setQuoting(false);
    }
  }

  const market_ = addr(chainId, "CoverMarket");
  const stableAddr = addr(chainId, "stable");
  const symToken = useReadContract({
    address: market_, abi: ABI.CoverMarket, functionName: "symbolToken", args: [symbol ? symbolId(symbol.symbol) : undefined],
    query: { enabled: Boolean(market_ && symbol) },
  });
  const atsToken = symToken.data && symToken.data !== "0x0000000000000000000000000000000000000000" ? symToken.data : null;
  const atsBal = useReadContract({ address: atsToken, abi: ERC20_ABI, functionName: "balanceOf", args: [address], query: { enabled: Boolean(atsToken && address) } });
  const atsDec = useReadContract({ address: atsToken, abi: ERC20_ABI, functionName: "decimals", query: { enabled: Boolean(atsToken) } });
  const atsHeld = atsBal.data !== undefined ? fromUnits(atsBal.data, Number(atsDec.data ?? 18)) : 0;
  const premiumUnits = quote?.quote ? BigInt(quote.quote.premium) : 0n;
  const poolAddr = addr(chainId, "UnderwritingPool");
  const symCap = useReadContract({ address: poolAddr, abi: ABI.UnderwritingPool, functionName: "symbolCapacity", args: [symbol ? symbolId(symbol.symbol) : undefined], query: { enabled: Boolean(poolAddr && symbol), refetchInterval: 20000 } });
  const mktCap = useReadContract({ address: poolAddr, abi: ABI.UnderwritingPool, functionName: "marketCapacity", args: [market?.id ? keccak256(toBytes(market.id)) : undefined], query: { enabled: Boolean(poolAddr && market?.id), refetchInterval: 20000 } });
  const roomUnits = symCap.data !== undefined && mktCap.data !== undefined ? (symCap.data < mktCap.data ? symCap.data : mktCap.data) : undefined;
  const room = roomUnits !== undefined ? fromUnits(roomUnits) : null; // max payout the pool can still lock for this stock
  const maxNotional = room !== null ? room / (c / 10000) : null;
  const allowance = useReadContract({
    address: stableAddr, abi: ERC20_ABI, functionName: "allowance", args: [address, market_],
    query: { enabled: Boolean(address && stableAddr && market_) },
  });
  const balance = useReadContract({
    address: stableAddr, abi: ERC20_ABI, functionName: "balanceOf", args: [address],
    query: { enabled: Boolean(address && stableAddr) },
  });

  async function buy() {
    const q = quote.quote;
    if ((allowance.data || 0n) < premiumUnits) {
      const ok = await run(`Approve ${stable} premium`, { address: stableAddr, abi: ERC20_ABI, functionName: "approve", args: [market_, premiumUnits] });
      if (!ok) return;
      await allowance.refetch();
    }
    const tuple = {
      buyer: q.buyer, symbol: q.symbol, market: q.market, notional: BigInt(q.notional), shares: BigInt(q.shares), heldShares: BigInt(q.heldShares),
      deductibleBps: Number(q.deductibleBps), capBps: Number(q.capBps), premium: BigInt(q.premium), startPrice: BigInt(q.startPrice),
      expiry: BigInt(q.expiry), validUntil: BigInt(q.validUntil), nonce: BigInt(q.nonce),
    };
    const r = await run(`Buy cover on ${symbol.symbol}`, { address: market_, abi: ABI.CoverMarket, functionName: "buyCover", args: [tuple, quote.signature] });
    if (r) setQuote(null);
  }

  const N = Number(notional || 0);
  const prem = quote?.ok && quote?.quote ? (quote.premium ?? fromUnits(quote.quote.premium)) : null;
  const alternatives = quote && !quote.ok ? quote.alternatives || [] : [];
  const pPayout = quote?.pricing?.pPayout;
  const maxPayout = N * (c / 10000);
  const pay25 = N * Math.min(Math.max(0.25 - b / 10000, 0), c / 10000);
  const breakeven = prem !== null && N > 0 ? b / 10000 + prem / N : null;
  const tooBig = maxNotional !== null && N > maxNotional + 1e-9;
  const walletBal = balance.data !== undefined ? fromUnits(balance.data) : null;
  const cantAfford = prem !== null && walletBal !== null && prem > walletBal;
  const blockReason = Number(sharesCover) > Number(sharesHeld) ? "You cannot cover more shares than you hold."
    : !(N > 0) ? "Enter how much to protect."
    : tooBig ? `The pool can take at most ${fmtMoney(maxNotional, { sym: "" })} ${stable} of cover on this stock at a ${c / 100}% cap right now.`
    : cantAfford ? `The premium is more than your ${stable} balance.` : null;

  return (
    <>
      <PageHead
        eyebrow="For stock holders"
        title="Protect your stocks from a crash."
        art={<HolderArt />}
        right={<HeroCtas items={[["Get a quote", "#quote"], ["How payouts work", "#how"]]} />}
      >
        Pay a small fee upfront. If your stock falls more than a set amount, you get paid the difference in {stable}. Keep your shares.
      </PageHead>

      <HowItWorks title="Insurance for one stock, in three steps" steps={STEPS} aside={<PayoutExample />} />

      <Section className="mt-20">
        <SectionHead id="quote" eyebrow="Get a quote" title="Build your cover">Pick a stock, choose how much to protect, and see the price.</SectionHead>
        <div className="space-y-4 mb-6">
          <DeployGate chainId={chainId}>{null}</DeployGate>
          {offline && <Notice tone="warn">Live prices are offline right now, so new quotes are paused. Your existing policies below still work.</Notice>}
          {isConnected && deployed && !kyc.verified && <Notice>Your wallet is not KYC-verified on this chain yet. Use “Verify identity” in the header; the issuer approves it on-chain.</Notice>}
        </div>
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <Step n="1" title="Choose the stock" done={Boolean(symbol)}>
              <StockPicker
                marketId={marketId}
                symbol={symbol}
                symbolsFor={symbolsFor}
                loading={markets.isLoading}
                offline={offline}
                onChoose={(id, sym) => {
                  setMarketId(id);
                  setSearch("");
                  setSymbol(sym);
                  setNotionalTouched(false);
                }}
              />
              {symbol && <div className="mt-4"><PriceChart symbol={symbol.symbol} currency={symbol.currency} deductible={b / 10000} /></div>}
            </Step>

            <Step n="2" title="How much and for how long" done={Boolean(quote?.ok)}>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="space-y-1.5"><span className="label">Shares you own</span><input className="input" inputMode="decimal" value={sharesHeld} onChange={(e) => setSharesHeld(e.target.value)} /></label>
                <label className="space-y-1.5"><span className="label">Shares to protect</span><input className="input" inputMode="decimal" value={sharesCover} onChange={(e) => setSharesCover(e.target.value)} /></label>
                <label className="space-y-1.5"><span className="label">Value ({stable})</span><input className="input" inputMode="decimal" value={notional} onChange={(e) => { setNotional(e.target.value); setNotionalTouched(true); }} /></label>
              </div>
              {Number(sharesCover) > Number(sharesHeld) && <p className="text-xs text-bad mt-2">You cannot cover more shares than you hold. The contract enforces this.</p>}
              {symbol && symbol.currency && symbol.currency !== "USD" && (
                <p className="text-xs text-muted mt-2">
                  {usdClose ? `1 ${symbol.ticker} = ${fmtNum(symbol.lastClose, 2)} ${symbol.currency} ≈ ${fmtMoney(usdClose, { sym: "" })} ${stable} at the latest FX close. The payout is in ${stable}, on the stock's fall in ${symbol.currency}.` : `No FX rate for ${symbol.currency} right now: enter the protected value in ${stable} yourself.`}
                </p>
              )}
              {symbol && maxNotional !== null && (
                <p className={`text-xs mt-2 ${tooBig ? "text-bad" : "text-muted"}`}>
                  Pool room for {symbol.ticker}: up to {fmtMoney(maxNotional, { sym: "" })} {stable} protected at a {c / 100}% cap.{" "}
                  {tooBig && usdClose > 0 && (
                    <button type="button" className="underline underline-offset-2" onClick={() => { const v = Math.floor(maxNotional * 100) / 100; setNotional(String(v)); setNotionalTouched(true); setSharesCover(String(Math.floor((v / usdClose) * 1e6) / 1e6)); }}>Use the maximum</button>
                  )}
                </p>
              )}
              <div className="grid gap-4 mt-5">
                <div className="space-y-1.5"><div className="label">Length</div><Seg value={tenor} onChange={setTenor} options={[{ value: 7, label: "1 wk" }, { value: 14, label: "2 wk" }, { value: 28, label: "1 mo" }, { value: "10m", label: "10 min demo" }]} /></div>
                <div className="space-y-1.5"><div className="label">You absorb the first</div><div className="flex flex-wrap gap-2"><Seg value={b} onChange={setB} options={[300, 500, 750, 1000, 1500, 2000, 2500].map((v) => ({ value: v, label: `${v / 100}%` }))} /></div></div>
                <div className="space-y-1.5"><div className="label">Vault covers the next</div><Seg value={c} onChange={setC} options={[{ value: 1000, label: "10%" }, { value: 2000, label: "20%" }, { value: 3000, label: "30%" }]} /></div>
              </div>
              <p className="mt-4 rounded-xl bg-sunk px-4 py-3 text-sm text-ink2">
                Pays if the stock falls between <b className="text-ink">{fmtPct(b / 10000, 0)}</b> and <b className="text-ink">{fmtPct((b + c) / 10000, 0)}</b>. Bigger falls still pay the maximum.
              </p>
            </Step>

            <Step n="3" title="Prove you hold it" done={Boolean(attest?.heldShares) || atsHeld > 0}>
              <p className="text-sm text-ink2">You can only protect shares you actually own. Pick where they are.</p>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <button onClick={() => setPath("broker")} className={`text-left rounded-xl border p-4 ${path === "broker" ? "border-accent bg-accentSoft" : "border-line hover:bg-sunk"}`}>
                  <div className="text-sm font-semibold">Broker holdings</div>
                  <div className="text-xs text-muted mt-1">Zerodha, IBKR, Robinhood or any broker. Upload a statement or connect.</div>
                </button>
                <button onClick={() => setPath("token")} className={`text-left rounded-xl border p-4 ${path === "token" ? "border-accent bg-accentSoft" : "border-line hover:bg-sunk"}`}>
                  <div className="text-sm font-semibold">Tokenised stock</div>
                  <div className="text-xs text-muted mt-1">A tokenised share in your wallet. Checked on-chain.</div>
                </button>
              </div>
              {path === "broker" ? (
                <>
                  <div className="flex flex-wrap gap-2 mt-4">
                    {[["statement", "Upload statement"], ["kite", "Connect Zerodha Kite"], ["ibkr", "Connect IBKR"]].map(([v, t]) => (
                      <button key={v} onClick={() => setSource(v)} className={`chip ${source === v ? "bg-ink text-paper border-ink" : "hover:bg-sunk"}`}>{t}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-4">
                    <button className="btn-ghost" disabled={!symbol || !address || attesting} onClick={doAttest}>
                      {attesting ? "Checking…" : source === "statement" ? "Attest holding" : `Connect and attest (demo)`}
                    </button>
                    {attest?.heldShares && <span className="text-sm text-good">Attested {fmtNum(Number(attest.heldShares) / 1e18, 4)} shares · ref <span className="font-mono">{shortHash(String(attest.ref || ""))}</span></span>}
                    {attest?.error && <span className="text-sm text-bad">{attest.error}</span>}
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-xl bg-sunk p-4 text-sm">
                  {!symbol ? "Choose a stock first." : atsToken ? (
                    <>On-chain token <span className="font-mono text-xs">{shortHash(atsToken)}</span> · your balance <span className="font-semibold">{fmtNum(atsHeld, 4)}</span> shares. The contract re-checks it when you buy.</>
                  ) : (
                    <>No tokenised share is registered for <span className="font-mono">{symbol.symbol}</span> on this chain. On Hedera, ATS-issued equities are registered with the cover market; use broker holdings for listed shares.</>
                  )}
                </div>
              )}
            </Step>
          </div>

          <div className="lg:sticky lg:top-20 space-y-4 min-w-0">
            <div className="card p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Your quote</h3>
                {symbol && <span className="chip font-mono">{symbol.symbol}</span>}
              </div>
              <div className="mt-4 rounded-xl bg-sunk p-4">
                <div className="label">You pay</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight tabular">{prem !== null ? `${fmtMoney(prem, { sym: "" })} ${stable}` : "—"}</div>
                <div className="text-xs text-muted mt-1">{prem !== null ? `${fmtPct(prem / (N || 1), 2)} of the value, once` : "Get a quote to see the price"}</div>
              </div>
              <div className="mt-3">
                <Row k="Value protected" v={fmtMoney(N, { sym: "" }) + ` ${stable}`} />
                <Row k="Most you can be paid" v={`${fmtMoney(maxPayout, { sym: "" })} ${stable}`} strong />
                <Row k="Length" v={tenor === "10m" ? "10 minutes (testnet demo)" : `${tenor} days`} />
              </div>
              <More label="More numbers" className="mt-3">
                <Row k="Pays the fall beyond" v={fmtPct(b / 10000, 0)} />
                <Row k="Chance of any payout" v={pPayout !== undefined ? fmtPct(pPayout, 1) : "—"} />
                <Row k="Fair value" v={quote?.pricing ? fmtPct(quote.pricing.fairBps / 10000, 2) : "—"} />
                <Row k="Break-even fall" v={breakeven !== null ? fmtPct(breakeven, 1) : "—"} />
              </More>
              <div className="rounded-xl border border-line p-4 mt-4 text-sm">
                If {symbol?.ticker || "the stock"} closes <span className="font-semibold">25% lower</span> at expiry, you receive{" "}
                <span className="font-semibold text-good">{fmtMoney(pay25, { sym: "" })} {stable}</span>.
              </div>
              {quoteErr && (
                <div className="mt-3 space-y-2">
                  <Notice tone="warn">{quoteErr}</Notice>
                  {alternatives.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {alternatives.map((a) => (
                        <button key={a.deductibleBps} className="btn-ghost btn-sm" disabled={quoting} onClick={() => getQuote(Number(a.deductibleBps))}>
                          Use {Number(a.deductibleBps) / 100}% deductible · {fmtPct(Number(a.premiumBps) / 1e4, 2)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button className="btn-ghost" disabled={!symbol || quoting || offline || Number(sharesCover) > Number(sharesHeld) || !(N > 0) || tooBig} onClick={() => getQuote()}>
                  {quoting ? "Pricing…" : quote ? "Re-quote" : "Get quote"}
                </button>
                <button className="btn-primary" disabled={!quote?.ok || quote?.pricing?.refused || !isConnected || !deployed || !kyc.verified || Boolean(busy) || Boolean(blockReason)} onClick={buy}>
                  {busy || "Buy cover"}
                </button>
              </div>
              {symbol && blockReason && <p className="text-xs text-bad mt-3">{blockReason}</p>}
              {isConnected && balance.data !== undefined && (
                <p className="text-xs text-muted mt-3">Wallet: {fmtMoney(fromUnits(balance.data), { sym: "" })} {stable}. Quote valid until {quote?.quote ? new Date(Number(quote.quote.validUntil) * 1000).toLocaleTimeString() : "—"}.</p>
              )}
            </div>
          </div>
        </div>
      </Section>
      <Section className="mt-16">
        <MyPolicies />
      </Section>
      <Faq items={FAQ} />
    </>
  );
}
