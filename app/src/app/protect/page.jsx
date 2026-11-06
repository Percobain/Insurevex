"use client";
import { useEffect, useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { parseEther, formatEther } from "viem";
import { ABI, ERC20_ABI, addr, stableSymbol } from "@/lib/contracts";
import { apiGet, apiPost, useApi } from "@/lib/api";
import { EXCHANGES, flag } from "@/lib/exchanges";
import { fmtMoney, fmtNum, fmtPct, fromUnits, shortHash, symbolId } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { PageHead, Section, SectionHead, Seg, Notice, Row, useActiveChain, DeployGate } from "@/components/ui";
import { HolderArt } from "@/components/IsoArt";
import { useKyc } from "@/components/KycBadge";
import PriceChart from "@/components/PriceChart";
import MyPolicies from "@/components/MyPolicies";

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
  const [sharesCover, setSharesCover] = useState("50");
  const [notional, setNotional] = useState("10000");
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
        notional: String(Math.round(Number(notional))), shares: String(sharesCover || "0"),
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
      buyer: q.buyer, symbol: q.symbol, notional: BigInt(q.notional), shares: BigInt(q.shares), heldShares: BigInt(q.heldShares),
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

  return (
    <>
      <PageHead
        eyebrow="For holders · type 2"
        title="Put a floor under any stock you own."
        art={<HolderArt />}
        facts={[["23", "exchanges, at your broker or tokenised"], ["10 → 30%", "default band of a fall that is covered"], [stable, "payout on the official close"]]}
      >
        If the official close falls more than your deductible by expiry, the vault pays the extra fall, up to the cap. You pay the
        premium upfront and the maximum payout is locked before you buy.
      </PageHead>
      <Section>
        <SectionHead eyebrow="Get a quote" title="Three steps to cover">Choose the stock, size the cover, prove you hold it. The quote updates as you go.</SectionHead>
        <div className="space-y-4 mb-6">
          <DeployGate chainId={chainId}>{null}</DeployGate>
          {offline && <Notice tone="warn">The pricing server is offline, so live symbols and quotes are unavailable. Policies and settlement below still read straight from the chain.</Notice>}
          {isConnected && deployed && !kyc.verified && <Notice>Your wallet is not KYC-verified on this chain yet. Use “Verify identity” in the header; the issuer approves it on-chain.</Notice>}
        </div>
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <Step n="1" title="Choose the stock" done={Boolean(symbol)}>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {EXCHANGES.map((e) => (
                  <button key={e.id} onClick={() => { setMarketId(e.id); setSymbol(null); setSearch(""); }}
                    className={`chip shrink-0 ${marketId === e.id ? "bg-ink text-paper border-ink" : "hover:bg-sunk"}`}>
                    <span aria-hidden="true">{flag(e.code)}</span>{e.exchange}
                  </button>
                ))}
              </div>
              <input className="input mt-3" placeholder={`Search ${exchange?.country || ""} stocks`} value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-line divide-y divide-line">
                {markets.isLoading && <div className="p-4 text-sm text-muted">Loading symbols…</div>}
                {!markets.isLoading && symbols.length === 0 && (
                  <div className="p-4 text-sm text-muted">{offline ? "Symbols load from the pricing server." : "No match."}</div>
                )}
                {symbols.slice(0, 60).map((s) => (
                  <button key={s.symbol} onClick={() => { setSymbol(s); if (s.lastClose) setNotional(String(Math.round(Number(sharesHeld || 0) * s.lastClose))); }}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-sunk ${symbol?.symbol === s.symbol ? "bg-accentSoft" : ""}`}>
                    <span className="min-w-0">
                      <span className="font-medium block truncate">{s.name || s.ticker}</span>
                      <span className="text-xs text-muted font-mono">{s.symbol}</span>
                    </span>
                    <span className="text-right shrink-0 tabular text-sm">
                      {s.lastClose ? `${fmtNum(s.lastClose, 2)} ${s.currency || ""}` : "—"}
                      {s.monthlyPremiumBps ? <span className="block text-[11px] text-muted">≈{fmtPct(s.monthlyPremiumBps / 1e4, 2)}/mo at 10%</span> : null}
                      {!s.quotable && <span className="block text-[11px] text-warn">not quotable</span>}
                    </span>
                  </button>
                ))}
              </div>
              {symbol && <div className="mt-4"><PriceChart symbol={symbol.symbol} currency={symbol.currency} /></div>}
            </Step>

            <Step n="2" title="Size and terms" done={Boolean(quote?.ok)}>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="space-y-1.5"><span className="label">Shares held</span><input className="input" inputMode="decimal" value={sharesHeld} onChange={(e) => setSharesHeld(e.target.value)} /></label>
                <label className="space-y-1.5"><span className="label">Shares to cover</span><input className="input" inputMode="decimal" value={sharesCover} onChange={(e) => setSharesCover(e.target.value)} /></label>
                <label className="space-y-1.5"><span className="label">Protected value ({stable})</span><input className="input" inputMode="decimal" value={notional} onChange={(e) => setNotional(e.target.value)} /></label>
              </div>
              {Number(sharesCover) > Number(sharesHeld) && <p className="text-xs text-bad mt-2">You cannot cover more shares than you hold. The contract enforces this.</p>}
              <div className="grid gap-4 mt-5">
                <div className="space-y-1.5"><div className="label">Tenor</div><Seg value={tenor} onChange={setTenor} options={[{ value: 7, label: "1 wk" }, { value: 14, label: "2 wk" }, { value: 28, label: "1 mo" }, { value: "10m", label: "10 min demo" }]} /></div>
                <div className="space-y-1.5"><div className="label">Deductible</div><div className="flex flex-wrap gap-2"><Seg value={b} onChange={setB} options={[300, 500, 750, 1000, 1500, 2000, 2500].map((v) => ({ value: v, label: `${v / 100}%` }))} /></div></div>
                <div className="space-y-1.5"><div className="label">Cap</div><Seg value={c} onChange={setC} options={[{ value: 1000, label: "10%" }, { value: 2000, label: "20%" }, { value: 3000, label: "30%" }]} /></div>
              </div>
            </Step>

            <Step n="3" title="Prove you hold it" done={Boolean(attest?.heldShares) || atsHeld > 0}>
              <p className="text-sm text-ink2">Cover can never exceed what you own. Either path works; the cover always pays in {stable} against the exchange's official close.</p>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <button onClick={() => setPath("broker")} className={`text-left rounded-xl border p-4 ${path === "broker" ? "border-accent bg-accentSoft" : "border-line hover:bg-sunk"}`}>
                  <div className="text-sm font-semibold">Broker holdings</div>
                  <div className="text-xs text-muted mt-1">Shares at Zerodha, IBKR, Robinhood or any broker. Attested from a statement or the broker API, signed into your quote.</div>
                </button>
                <button onClick={() => setPath("token")} className={`text-left rounded-xl border p-4 ${path === "token" ? "border-accent bg-accentSoft" : "border-line hover:bg-sunk"}`}>
                  <div className="text-sm font-semibold">Tokenised stock</div>
                  <div className="text-xs text-muted mt-1">An ATS equity on Hedera or another RWA token. The contract reads your token balance on-chain.</div>
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
              <div className="mt-4">
                <Row k="Protected value" v={fmtMoney(N, { sym: "" }) + ` ${stable}`} />
                <Row k="Pays the fall beyond" v={fmtPct(b / 10000, 0)} />
                <Row k="Maximum payout" v={`${fmtMoney(maxPayout, { sym: "" })} ${stable}`} />
                <Row k="Tenor" v={tenor === "10m" ? "10 minutes (testnet demo)" : `${tenor} days`} />
                <Row k="Chance of any payout" v={pPayout !== undefined ? fmtPct(pPayout, 1) : "—"} />
                <Row k="Fair value" v={quote?.pricing ? fmtPct(quote.pricing.fairBps / 10000, 2) : "—"} />
                <Row k="Premium" v={prem !== null ? `${fmtMoney(prem, { sym: "" })} ${stable}` : "—"} strong />
                <Row k="Break-even fall" v={breakeven !== null ? fmtPct(breakeven, 1) : "—"} />
              </div>
              <div className="rounded-xl bg-sunk p-4 mt-4 text-sm">
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
                <button className="btn-ghost" disabled={!symbol || quoting || offline || Number(sharesCover) > Number(sharesHeld)} onClick={() => getQuote()}>
                  {quoting ? "Pricing…" : quote ? "Re-quote" : "Get quote"}
                </button>
                <button className="btn-primary" disabled={!quote?.ok || quote?.pricing?.refused || !isConnected || !deployed || !kyc.verified || Boolean(busy)} onClick={buy}>
                  {busy || "Buy cover"}
                </button>
              </div>
              {isConnected && balance.data !== undefined && (
                <p className="text-xs text-muted mt-3">Wallet: {fmtMoney(fromUnits(balance.data), { sym: "" })} {stable}. Quote valid until {quote?.quote ? new Date(Number(quote.quote.validUntil) * 1000).toLocaleTimeString() : "—"}.</p>
              )}
            </div>
            <div className="card p-5 text-sm text-ink2 leading-relaxed">
              <div className="font-medium text-ink mb-1">How the price is set</div>
              The engine scales every stock's recent volatility against the pooled history of past falls across all markets
              (walk-forward, no hindsight), then adds a risk margin. Stocks that are already in free fall are refused.
            </div>
          </div>
        </div>
      </Section>
      <Section className="mt-10">
        <MyPolicies />
      </Section>
    </>
  );
}
