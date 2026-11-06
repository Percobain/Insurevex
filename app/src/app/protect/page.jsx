"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReadContract } from "wagmi";
import { parseEther, formatEther, keccak256, toBytes } from "viem";
import { ABI, ERC20_ABI, addr, stableSymbol } from "@/lib/contracts";
import { apiGet, apiPost, useApi } from "@/lib/api";
import { EXCHANGES, flag } from "@/lib/exchanges";
import { fmtMoney, fmtNum, fmtPct, fromUnits, symbolId } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { useDemo, sleep, DEMO_BALANCE } from "@/lib/demo";
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
      <div className="mt-4 pt-4 border-t border-line">{children}</div>
    </div>
  );
}

/** One form field: a label on top, the control, and an optional hint under it. */
function Field({ label, htmlFor, hint, children }) {
  return (
    <div className="min-w-0">
      <label className="label" htmlFor={htmlFor}>{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="mt-1.5 text-xs text-muted min-h-[1rem]">{hint}</div>}
    </div>
  );
}

/** A number input with its unit shown inside the box on the right. */
function UnitInput({ id, value, onChange, unit, label }) {
  return (
    <div className="relative">
      <input id={id} className="input h-12 w-full pr-20 text-lg tabular" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted truncate max-w-[4.5rem]">{unit}</span>
    </div>
  );
}

/** One setting in the settings list: name and a short explanation, then the choices. */
function Setting({ name, hint, children }) {
  return (
    <div className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <div className="text-sm font-medium">{name}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/** A big choice card with a radio dot. */
function Choice({ on, title, body, onClick }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className={`text-left rounded-xl border p-4 flex gap-3 transition-colors ${on ? "border-ink bg-card shadow-sm" : "border-line hover:bg-sunk"}`}>
      <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 grid place-items-center ${on ? "border-ink" : "border-line"}`}>{on && <span className="h-1.5 w-1.5 rounded-full bg-ink" />}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted mt-1">{body}</span>
      </span>
    </button>
  );
}

const STEPS = [
  { icon: "search", title: "Pick your stock", body: "Any stock you own, on 23 exchanges. You keep your shares.", stat: "23 exchanges" },
  { icon: "pay", title: "Pay a small fee", body: "You see exactly what you pay and could get back.", stat: "About $90 per $10,000 a month" },
  { icon: "shield", title: "Get paid if it crashes", body: "Paid automatically at the stock exchange's closing price.", stat: "No claim forms" },
];

const FAQ = [
  ["Do I have to sell my shares?", "No. You keep them where they are and just show that you own them."],
  ["How much can I get paid?", "With the usual settings, if $10,000 of stock falls 25%, you get $1,500. The most you can get is $2,000."],
  ["Which price decides the payout?", "The stock exchange's closing price on your end date. You are paid automatically, no claim needed."],
  ["Is the money really there?", "Yes. The most you could be paid is set aside the moment you buy."],
  ["How is the price set?", "From how much the stock usually moves and how past crashes played out. Stocks already crashing cannot be protected."],
];

function PayoutExample() {
  const rows = [["Falls 5%", "$0", "Less than the 10% drop it starts after"], ["Falls 25%", "$1,500", "The drop past 10%: 15% of $10,000"], ["Falls 40%", "$2,000", "The most it pays: 20% of $10,000"]];
  return (
    <div className="card p-5 sm:p-6">
      <div className="text-sm text-ink2"><b className="text-ink">$10,000</b> of NVIDIA for 1 month costs about <b className="text-ink">$90</b>. If it falls 25%, you get <b className="text-ink">$1,500</b>.</div>
      <div className="mt-4 divide-y divide-line">
        {rows.map(([k, v, sub]) => (
          <div key={k} className="py-3 flex items-center justify-between gap-4">
            <div><div className="font-medium">{k}</div><div className="text-xs text-muted">{sub}</div></div>
            <div className={`text-xl font-semibold tabular ${v === "$0" ? "text-muted" : "text-good"}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-3 border-t border-line text-xs text-muted">No crash? You keep your shares. The $90 was the price of protection.</div>
    </div>
  );
}

export default function ProtectPage() {
  const { chainId, address, isConnected, deployed } = useActiveChain();
  const demo = useDemo();
  useEffect(() => { if (demo) { setSharesHeld("50"); setSharesCover("50"); } }, [demo]);
  const kyc = useKyc();
  const stable = stableSymbol(chainId);
  const markets = useApi("/api/markets", { timeout: 30000 });
  const serverMarkets = markets.data?.markets || [];
  // Only "offline" when there is nothing to show: a failed background refresh keeps the last good prices.
  const offline = markets.isError && !markets.data;

  const [marketId, setMarketId] = useState("US");
  const [search, setSearch] = useState("");
  const [symbol, setSymbol] = useState(null);
  const [sharesHeld, setSharesHeld] = useState("50");
  const [sharesCover, setSharesCover] = useState("1");
  const [manualValue, setManualValue] = useState(""); // only used when there is no FX rate for the stock's currency
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
  // last close in USD: cover is sized and paid in dollars, foreign closes are converted at the latest FX close
  const usdClose = symbol ? (symbol.lastCloseUsd ?? ((symbol.currency || "USD") === "USD" ? symbol.lastClose : null)) : null;

  const cover = (() => { try { return parseEther(String(sharesCover || "0")); } catch { return 0n; } })();
  const held = (() => { try { return parseEther(String(sharesHeld || "0")); } catch { return 0n; } })();

  async function doAttest() {
    setAttesting(true);
    if (demo) {
      await sleep(600);
      setAttest({ heldShares: (BigInt(Math.round(Number(sharesHeld || 0) * 1e6)) * 10n ** 12n).toString(), ref: "0x5e1f0c0ffee0d3m0" });
      setAttesting(false);
      return;
    }
    try {
      const r = await apiPost("/api/holdings/attest", { address, symbol: symbol.symbol, source: source === "ibkr" ? "statement" : source, broker: source, shares: sharesHeld, chainId });
      setAttest(r);
    } catch (e) {
      setAttest({ error: String(e.message || e) });
    } finally {
      setAttesting(false);
    }
  }

  const reqRef = useRef(0);
  async function getQuote(key) {
    const id = ++reqRef.current;
    setQuoting(true);
    setQuoteErr("");
    if (demo) {
      // Demo quote: the stock's indicative monthly rate, scaled to the tenor. Nothing is signed.
      await sleep(700);
      const days = tenor === "10m" ? 1 : Number(tenor);
      const bps = (symbol?.monthlyPremiumBps || 90) * (days / 28);
      const premium = N * bps / 1e4;
      if (id !== reqRef.current) return;
      setQuote({ ok: true, premium, quote: { premium: String(Math.round(premium * 1e6)), validUntil: Math.floor(Date.now() / 1000) + 300 }, pricing: { pPayout: Math.min(0.4, bps / 1e4 * 4), fairBps: bps * 0.8 }, _key: key });
      setQuoting(false);
      return;
    }
    try {
      const qs = new URLSearchParams({
        chainId: String(chainId), buyer: address || "0x0000000000000000000000000000000000000000", symbol: symbol.symbol,
        notional: String(N), shares: String(S), heldShares: String(owned),
        deductibleBps: String(b), capBps: String(c),
      });
      if (tenor === "10m") qs.set("tenorMinutes", "10"); else qs.set("tenorDays", String(tenor));
      const r = await apiGet(`/api/quote?${qs.toString()}`);
      if (id !== reqRef.current) return; // the inputs changed while this was in flight
      setQuoteErr(!r.ok || r.pricing?.refused ? r.pricing?.reason || r.error || "We can't price this right now. Try a different setting." : "");
      setQuote({ ...r, _key: key });
    } catch (e) {
      if (id === reqRef.current) setQuoteErr(String(e.message || e));
    } finally {
      if (id === reqRef.current) setQuoting(false);
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

  // ---- sizing: the user types shares; the dollar value follows from today's USD price
  const attestedShares = attest?.heldShares ? Number(formatEther(BigInt(attest.heldShares))) : null;
  const tokenShares = path === "token" && atsToken ? atsHeld : null;
  const verifiedOwned = tokenShares ?? attestedShares; // null until proven
  const owned = verifiedOwned ?? Number(sharesHeld || 0);
  const S = Number(sharesCover || 0);
  const noValue = Boolean(symbol) && !usdClose && !(Number(manualValue) > 0);
  const N = usdClose ? Math.round(S * usdClose * 100) / 100 : Number(manualValue || 0);
  const overOwned = S > owned + 1e-9;
  const maxShares = maxNotional !== null && usdClose ? maxNotional / usdClose : null;
  const tooBig = !demo && maxNotional !== null && N > maxNotional + 0.005;
  const ready = Boolean(symbol) && !offline && S > 0 && N > 0 && !overOwned && !tooBig && !noValue;
  const quoteKey = ready ? [symbol.symbol, S, N, tenor, b, c, chainId, address || "", owned].join("|") : null;
  const fresh = Boolean(quote && quoteKey && quote._key === quoteKey); // the quote on screen matches what is typed now
  const allowance = useReadContract({
    address: stableAddr, abi: ERC20_ABI, functionName: "allowance", args: [address, market_],
    query: { enabled: Boolean(address && stableAddr && market_) },
  });
  const balance = useReadContract({
    address: stableAddr, abi: ERC20_ABI, functionName: "balanceOf", args: [address],
    query: { enabled: Boolean(address && stableAddr) },
  });

  async function buy() {
    if (demo) {
      await run(`Protect ${symbol.ticker || symbol.symbol}`, { functionName: "buyCover" });
      return; // demo: keep the quote on screen so the purchase reads clearly
    }
    const q = quote.quote;
    if ((allowance.data || 0n) < premiumUnits) {
      const ok = await run(`Allow the ${stable} payment`, { address: stableAddr, abi: ERC20_ABI, functionName: "approve", args: [market_, premiumUnits] });
      if (!ok) return;
      await allowance.refetch();
    }
    const tuple = {
      buyer: q.buyer, symbol: q.symbol, market: q.market, notional: BigInt(q.notional), shares: BigInt(q.shares), heldShares: BigInt(q.heldShares),
      deductibleBps: Number(q.deductibleBps), capBps: Number(q.capBps), premium: BigInt(q.premium), startPrice: BigInt(q.startPrice),
      expiry: BigInt(q.expiry), validUntil: BigInt(q.validUntil), nonce: BigInt(q.nonce),
    };
    const r = await run(`Protect ${symbol.ticker || symbol.symbol}`, { address: market_, abi: ABI.CoverMarket, functionName: "buyCover", args: [tuple, quote.signature] });
    if (r) setQuote(null);
  }

  const prem = quote?.ok && quote?.quote && fresh ? (quote.premium ?? fromUnits(quote.quote.premium)) : null;
  const alternatives = quote && !quote.ok && fresh ? quote.alternatives || [] : [];
  // one clear way out of a refusal: the nearest deductible the engine will sell
  const altSorted = [...alternatives].sort((x, y) => Number(x.deductibleBps) - Number(y.deductibleBps));
  const suggestion = altSorted.find((a) => Number(a.deductibleBps) > b) || altSorted[0] || null;
  const pPayout = quote?.pricing?.pPayout;
  const maxPayout = N * (c / 10000);
  const pay25 = N * Math.min(Math.max(0.25 - b / 10000, 0), c / 10000);
  const breakeven = prem !== null && N > 0 ? b / 10000 + prem / N : null;
  const walletBal = demo ? fromUnits(DEMO_BALANCE) : balance.data !== undefined ? fromUnits(balance.data) : null;
  const cantAfford = prem !== null && walletBal !== null && prem > walletBal;
  const blockReason = cantAfford ? `Not enough ${stable} in your wallet (you have ${fmtMoney(walletBal, { sym: "" })}).` : null;

  // auto-quote: only when the numbers are real and inside every limit, 600 ms after the last change
  useEffect(() => {
    if (!quoteKey) { reqRef.current++; setQuote(null); setQuoteErr(""); setQuoting(false); return; }
    setQuoting(true);
    const t = setTimeout(() => getQuote(quoteKey), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);
  // keep the price fresh: re-price shortly before the signed quote expires (not while a purchase is in flight)
  useEffect(() => {
    if (demo || !quote?.ok || !fresh || busy) return;
    const ms = Number(quote.quote.validUntil) * 1000 - Date.now() - 15_000;
    const t = setTimeout(() => getQuote(quoteKey), Math.max(ms, 3_000));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, fresh, busy]);
  const setShares = (x) => setSharesCover(x > 0 ? String(Math.floor(x * 1e6) / 1e6) : "");

  const tick = symbol?.ticker || "shares";
  const howLong = tenor === "10m" ? "10 minutes (test)" : { 7: "1 week", 14: "2 weeks", 28: "1 month" }[tenor] || `${tenor} days`;

  return (
    <>
      <PageHead
        eyebrow="For stock owners"
        title="Get paid if your stock crashes."
        art={<HolderArt />}
        right={<HeroCtas items={[["Get my price", "#quote"]]} />}
      >
        Pay a small fee. If your stock falls more than you choose, you are paid automatically. Keep your shares.
      </PageHead>

      <Section className="mt-6">
        <SectionHead id="quote" eyebrow="Your price" title="Protect a stock" />
        <div className="space-y-4 mb-6">
          <DeployGate chainId={chainId}>{null}</DeployGate>
          {offline && <Notice tone="warn">Prices are offline right now. Try again in a few minutes. Your protection below still works.</Notice>}
          {isConnected && deployed && !kyc.verified && <Notice>Verify your ID to buy. Tap “Verify ID” at the top of the page; it is instant in this test version.</Notice>}
        </div>
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <Step n="1" title="Pick your stock" done={Boolean(symbol)}>
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
                  setManualValue("");
                }}
              />
              {symbol && <div className="mt-4"><PriceChart symbol={symbol.symbol} currency={symbol.currency} deductible={b / 10000} /></div>}
            </Step>

            <Step n="2" title="How much to protect" done={Boolean(quote?.ok)}>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field
                  label="Shares you own"
                  htmlFor="shares-owned"
                  hint={verifiedOwned !== null ? <span className="text-good">Checked {tokenShares !== null ? "in your wallet" : "with your broker"}</span> : "We check this in step 3."}
                >
                  {verifiedOwned !== null ? (
                    <div className="input h-12 w-full flex items-center justify-between bg-sunk text-lg tabular">
                      {fmtNum(verifiedOwned, 4)}
                      <span className="text-sm text-muted">{tick}</span>
                    </div>
                  ) : (
                    <UnitInput id="shares-owned" value={sharesHeld} onChange={setSharesHeld} unit={tick} label="Shares you own" />
                  )}
                </Field>
                <Field
                  label="Shares to protect"
                  htmlFor="shares-to-protect"
                  hint={usdClose > 0 && S > 0 ? <>= <b className="text-ink tabular">{fmtMoney(N, { sym: "" })} {stable}</b> at {fmtNum(symbol.lastClose, 2)} {symbol.currency || "USD"} each</> : symbol ? "" : "Pick a stock to see the value."}
                >
                  <UnitInput id="shares-to-protect" value={sharesCover} onChange={setSharesCover} unit={tick} label="Shares to protect" />
                </Field>
              </div>

              {symbol && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {[
                    ["Half of mine", owned / 2, owned > 0],
                    ["All I own", owned, owned > 0],
                    ["Most we can protect", maxShares === null ? 0 : Math.min(maxShares, owned || maxShares), !demo && maxShares !== null && maxShares > 0],
                  ].filter(([, , ok]) => ok).map(([t, x]) => (
                    <button key={t} type="button" className="chip hover:bg-sunk" onClick={() => setShares(x)}>{t}</button>
                  ))}
                </div>
              )}
              {!usdClose && symbol && (
                <div className="mt-4 max-w-xs">
                  <Field label={`Value to protect (we can't convert ${symbol.currency} right now)`} htmlFor="manual-value">
                    <UnitInput id="manual-value" value={manualValue} onChange={setManualValue} unit={stable} label="Value to protect" />
                  </Field>
                </div>
              )}
              {/* the one thing in the way, in plain words */}
              {symbol && overOwned && <p className="text-sm text-bad mt-3">You own {fmtNum(owned, 4)}. You can protect up to that many.</p>}
              {symbol && !overOwned && tooBig && (
                <p className="text-sm text-bad mt-3">
                  We can protect up to <b>{fmtNum(maxShares, 4)}</b> {tick} (about {fmtMoney(maxNotional, { sym: "" })} {stable}) right now.{" "}
                  <button type="button" className="underline underline-offset-2 text-ink" onClick={() => setShares(maxShares)}>Use that</button>
                </p>
              )}
              {symbol && symbol.currency && symbol.currency !== "USD" && usdClose > 0 && (
                <p className="text-xs text-muted mt-2">Paid in {stable}. 1 {symbol.ticker} is about {fmtMoney(usdClose, { sym: "" })} {stable} today.</p>
              )}

              <div className="mt-6 rounded-xl border border-line divide-y divide-line">
                <Setting name="How long" hint="Protection ends on this date">
                  <Seg full value={tenor} onChange={setTenor} options={[{ value: 7, label: "1 week" }, { value: 14, label: "2 weeks" }, { value: 28, label: "1 month" }, { value: "10m", label: "10 min (test)" }]} />
                </Setting>
                <Setting name="Starts paying after a drop of" hint="Higher = cheaper">
                  <Seg value={b} onChange={setB} options={[300, 500, 750, 1000, 1500, 2000, 2500].map((v) => ({ value: v, label: `${v / 100}%` }))} />
                </Setting>
                <Setting name="Pays up to" hint="Of the value you protect">
                  <Seg full value={c} onChange={setC} options={[{ value: 1000, label: "10%" }, { value: 2000, label: "20%" }, { value: 3000, label: "30%" }]} />
                </Setting>
                <p className="p-4 text-sm text-ink2 bg-sunk/60 rounded-b-xl">
                  If {symbol?.ticker || "the stock"} drops more than <b className="text-ink">{fmtPct(b / 10000, 0)}</b>, you get the extra drop, up to <b className="text-ink">{fmtPct(c / 10000, 0)}</b> of the value{N > 0 ? <> (<b className="text-ink">{fmtMoney(maxPayout, { sym: "" })} {stable}</b> at most)</> : null}.
                </p>
              </div>
            </Step>

            <Step n="3" title="Show you own it" done={Boolean(attest?.heldShares) || atsHeld > 0}>
              <p className="text-sm text-ink2">You can only protect shares you own. Where are they?</p>
              <div className="grid sm:grid-cols-2 gap-3 mt-3" role="radiogroup">
                <Choice on={path === "broker"} onClick={() => setPath("broker")} title="At a broker" body="Zerodha, IBKR, Robinhood or any other. Upload a statement or connect." />
                <Choice on={path === "token"} onClick={() => setPath("token")} title="In your wallet" body="A tokenised share. We read your wallet balance." />
              </div>
              <div className="mt-4 rounded-xl border border-line p-4">
                {path === "broker" ? (
                  <>
                    <div className="label">How to check</div>
                    <div className="mt-2">
                      <Seg full value={source} onChange={setSource} options={[{ value: "statement", label: "Statement" }, { value: "kite", label: "Zerodha" }, { value: "ibkr", label: "IBKR" }]} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button className="btn-primary btn-sm" disabled={!symbol || !address || attesting} onClick={doAttest}>
                        {attesting ? "Checking…" : source === "statement" ? "Check my shares" : "Connect and check (test)"}
                      </button>
                      {attest?.heldShares ? (
                        <span className="text-sm text-good" title={attest.ref ? `Reference ${attest.ref}` : undefined}>Done: you own {fmtNum(Number(attest.heldShares) / 1e18, 4)} shares</span>
                      ) : attest?.error ? (
                        <span className="text-sm text-bad" title={attest.error}>We couldn&apos;t check that. Try again or pick another option.</span>
                      ) : (!symbol || !address) ? (
                        <span className="text-xs text-muted">{!symbol ? "Pick a stock first." : "Connect your wallet first."}</span>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="text-sm">
                    {!symbol ? <span className="text-muted">Pick a stock first.</span> : atsToken ? (
                      <span title={atsToken}>Your wallet holds <span className="font-semibold">{fmtNum(atsHeld, 4)}</span> {tick}. We check again when you buy.</span>
                    ) : (
                      <>There is no tokenised {symbol.ticker || symbol.symbol} on this network. Choose “At a broker” instead.</>
                    )}
                  </div>
                )}
              </div>
            </Step>
          </div>

          <div className="lg:sticky lg:top-20 space-y-4 min-w-0">
            <div className="card p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Your price</h3>
                {symbol && <span className="chip font-mono">{symbol.symbol}</span>}
              </div>
              <div className="mt-4 rounded-xl bg-sunk p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="label">You pay</div>
                  {ready && <span className="text-xs text-muted flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${quoting ? "bg-accent animate-pulse" : fresh && quote?.ok ? "bg-good" : "bg-muted"}`} />{quoting ? "Updating price…" : fresh && quote?.ok ? "Live price" : ""}</span>}
                </div>
                <div className="mt-1 text-3xl font-semibold tracking-tight tabular">{prem !== null ? `${fmtMoney(prem, { sym: "" })} ${stable}` : "—"}</div>
                <div className="text-xs text-muted mt-1">{prem !== null ? `${fmtPct(prem / (N || 1), 2)} of the value, paid once` : !symbol ? "Pick a stock to see your price" : !ready ? "Fix the number in red to see your price" : fresh && quoteErr && !quoting ? "Not available at this setting, see below" : "Getting your price…"}</div>
              </div>
              {symbol && (<>
              <div className="mt-3">
                <Row k="Protected amount" v={fmtMoney(N, { sym: "" }) + ` ${stable}`} />
                <Row k="Most you can be paid" v={`${fmtMoney(maxPayout, { sym: "" })} ${stable}`} strong />
                <Row k="How long" v={howLong} />
              </div>
              <More label="More numbers" className="mt-3">
                <Row k="Starts paying after a drop of" v={fmtPct(b / 10000, 0)} />
                <Row k="Chance it pays out" v={pPayout !== undefined ? fmtPct(pPayout, 1) : "—"} />
                <Row k="Cost before our margin" v={quote?.pricing ? fmtPct(quote.pricing.fairBps / 10000, 2) : "—"} />
                <Row k="You come out ahead if it falls more than" v={breakeven !== null ? fmtPct(breakeven, 1) : "—"} />
              </More>
              <div className="rounded-xl border border-line p-4 mt-4 text-sm">
                If {symbol?.ticker || "the stock"} closes <span className="font-semibold">25% lower</span> on the end date, you get{" "}
                <span className="font-semibold text-good">{fmtMoney(pay25, { sym: "" })} {stable}</span>.
              </div>
              </>)}
              {fresh && quoteErr && (
                <div className="mt-3 rounded-xl border border-line bg-accentSoft/60 p-4 text-sm">
                  {suggestion ? (
                    <>
                      <p className="text-ink">{symbol?.name || "This stock"} is moving a lot right now, so protection from a {b / 100}% drop is not available.</p>
                      <p className="text-ink2 mt-1">Protection that starts after a <b className="text-ink">{Number(suggestion.deductibleBps) / 100}% drop</b> costs about {fmtMoney((N * Number(suggestion.premiumBps)) / 1e4, { sym: "" })} {stable} ({fmtPct(Number(suggestion.premiumBps) / 1e4, 2)}).</p>
                      <button type="button" className="btn-primary btn-sm mt-3" onClick={() => setB(Number(suggestion.deductibleBps))}>Switch to {Number(suggestion.deductibleBps) / 100}%</button>
                    </>
                  ) : (
                    <p className="text-ink">{quoteErr}</p>
                  )}
                </div>
              )}
              <button className="btn-primary w-full mt-4" disabled={!fresh || !quote?.ok || quote?.pricing?.refused || quoting || !isConnected || !deployed || !kyc.verified || Boolean(busy) || Boolean(blockReason)} onClick={buy}>
                {busy || (prem !== null ? `Protect ${fmtNum(S, 4)} ${tick} for ${fmtMoney(prem, { sym: "" })} ${stable}` : "Protect my stock")}
              </button>
              {(() => {
                // say why the button is greyed out, one reason at a time
                if (!fresh || !quote?.ok || quoting || busy) return null;
                const why = !isConnected ? "Connect your wallet to buy." : !deployed ? "Switch your wallet to a supported network to buy."
                  : !kyc.verified ? "Verify your ID first (button at the top of the page)." : blockReason;
                return why ? <p className="text-xs text-bad mt-3">{why}</p> : null;
              })()}
              {isConnected && walletBal !== null && (
                <p className="text-xs text-muted mt-3">In your wallet: {fmtMoney(walletBal, { sym: "" })} {stable}.{fresh && quote?.ok ? " The price updates by itself; you pay exactly what is shown." : ""}</p>
              )}
            </div>
          </div>
        </div>
      </Section>

      <HowItWorks title="Three steps, no paperwork" steps={STEPS} aside={<PayoutExample />} />

      <Section className="mt-16">
        <MyPolicies />
      </Section>
      <Faq items={FAQ} />
    </>
  );
}
