"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { EXCHANGES, REGIONS } from "@/lib/exchanges";
import { fmtNum, fmtPct } from "@/lib/format";
import Flag from "./Flag";
import StockLogo from "./StockLogo";

/**
 * Stock picker for the Protect page: a command-palette dropdown under the trigger.
 *
 *   ┌ search: any stock, exchange or country ─────────────────────────┐
 *   │ EXCHANGES (by region, real flags)  │ STOCKS (of that exchange)   │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Typing filters the exchanges by name/country/city and searches stocks on every exchange at once.
 * Keyboard: ↑ ↓ move, ← → switch column, Enter picks, Esc closes. Fixed size: it never jumps.
 *
 * @param {object} props
 * @param {string} props.marketId - Current exchange id (EXCHANGES[].id)
 * @param {object|null} props.symbol - Current stock (server symbol object) or null
 * @param {(e: object) => object[]} props.symbolsFor - Stocks listed for an exchange
 * @param {boolean} [props.loading]
 * @param {boolean} [props.offline]
 * @param {(marketId: string, symbol: object) => void} props.onChoose
 */
export default function StockPicker({ marketId, symbol, symbolsFor, loading, offline, onChoose }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [exId, setExId] = useState(marketId);
  const [col, setCol] = useState(1); // 0 = exchanges, 1 = stocks
  const [row, setRow] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const chosen = EXCHANGES.find((e) => e.id === marketId) || EXCHANGES[0];

  const q = query.trim().toLowerCase();
  const exchanges = useMemo(
    () => (q ? EXCHANGES.filter((e) => `${e.exchange} ${e.country} ${e.city} ${e.code} ${e.currency}`.toLowerCase().includes(q)) : EXCHANGES),
    [q],
  );
  const ex = EXCHANGES.find((e) => e.id === exId) || chosen;
  const stocks = useMemo(() => {
    if (!q) return symbolsFor(ex).map((s) => ({ s, e: ex }));
    const match = (s) => `${s.symbol} ${s.name} ${s.ticker}`.toLowerCase().includes(q);
    // An exchange that matches the query lists all its stocks; otherwise stocks that match, on every exchange.
    const exMatch = exchanges.find((e) => e.id === exId);
    if (exMatch) return symbolsFor(exMatch).map((s) => ({ s, e: exMatch }));
    return EXCHANGES.flatMap((e) => symbolsFor(e).filter(match).map((s) => ({ s, e }))).slice(0, 60);
  }, [q, ex, exId, exchanges, symbolsFor]);

  // Open: focus the search, start on the chosen exchange.
  const show = () => {
    setExId(marketId);
    setQuery("");
    setCol(1);
    setRow(Math.max(0, symbolsFor(chosen).findIndex((s) => s.symbol === symbol?.symbol)));
    setOpen(true);
  };
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const away = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // While typing, follow the first matching exchange (if any) so the right column shows something useful.
  useEffect(() => {
    if (!open) return;
    if (q && exchanges.length && !exchanges.some((e) => e.id === exId)) setExId(exchanges[0].id);
    if (q && !exchanges.length) setCol(1); // nothing to move through on the left: keys go to the stock matches
    setRow(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Keep the active row in view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-k="${col}-${row}"]`)?.scrollIntoView({ block: "nearest" });
  }, [col, row]);

  const pick = (e, s) => {
    onChoose(e.id, s);
    setOpen(false);
  };
  const onKey = (ev) => {
    const exIndex = exchanges.findIndex((e) => e.id === exId);
    if (ev.key === "Escape") return setOpen(false);
    if (ev.key === "ArrowRight" && col === 0) return ev.preventDefault(), setCol(1), setRow(0);
    if (ev.key === "ArrowLeft" && col === 1) return ev.preventDefault(), setCol(0), setRow(Math.max(0, exIndex));
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const d = ev.key === "ArrowDown" ? 1 : -1;
      if (col === 0) {
        const next = Math.min(exchanges.length - 1, Math.max(0, (exIndex < 0 ? 0 : exIndex) + d));
        if (exchanges[next]) setExId(exchanges[next].id);
        setRow(next);
      } else setRow((r) => Math.min(stocks.length - 1, Math.max(0, r + d)));
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (col === 0) return setCol(1), setRow(0);
      const it = stocks[row];
      if (it) pick(it.e, it.s);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`group w-full flex items-center gap-4 rounded-2xl border bg-card px-4 py-3.5 text-left transition ${open ? "border-primary shadow-md" : "border-line shadow-sm hover:border-ink/25"}`}
      >
        {symbol ? <StockLogo key={symbol.symbol} symbol={symbol} className="h-10 w-10" selected /> : <Flag code={chosen.code} className="h-8 w-12 shrink-0 rounded-md ring-1 ring-black/10" />}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold truncate">{symbol ? symbol.name || symbol.ticker : "Choose a stock"}</span>
          <span className="block text-xs text-muted truncate">
            {symbol ? (
              <>
                <span className="font-mono">{symbol.symbol}</span>
                {symbol.lastClose ? ` · ${fmtNum(symbol.lastClose, 2)} ${symbol.currency || ""}` : ""}
              </>
            ) : (
              `${EXCHANGES.length} exchanges · search by name, ticker or country`
            )}
          </span>
        </span>
        <kbd className="hidden sm:inline-flex items-center rounded-md border border-line bg-sunk px-2 py-1 text-[11px] font-medium text-ink2">{symbol ? "Change" : "Pick"}</kbd>
        <svg width="14" height="14" viewBox="0 0 24 24" className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 rounded-2xl border border-line bg-card shadow-[0_24px_60px_-24px_rgb(26_36_35/.45)] overflow-hidden origin-top animate-[sp-in_.16s_ease-out]" onKeyDown={onKey}>
          <div className="relative border-b border-line">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Stock, ticker, exchange or country…"
              className="w-full h-12 bg-transparent pl-11 pr-4 text-[15px] outline-none placeholder:text-muted"
              aria-label="Search stocks"
            />
          </div>

          <div ref={listRef} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] h-[360px]">
            {/* exchanges */}
            <div className="overflow-y-auto border-r border-line py-2" role="listbox" aria-label="Exchanges">
              {exchanges.length === 0 && <div className="px-4 py-6 text-sm text-muted">No exchange is called that. Stock matches from every exchange are on the right →</div>}
              {REGIONS.map((r) => {
                const here = exchanges.filter((e) => e.region === r);
                if (!here.length) return null;
                return (
                  <div key={r} className="mb-1">
                    <div className="px-4 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{r}</div>
                    {here.map((e) => {
                      const i = exchanges.indexOf(e);
                      const on = e.id === ex.id;
                      const kb = col === 0 && on;
                      const n = symbolsFor(e).length;
                      return (
                        <button
                          key={e.id}
                          data-k={`0-${i}`}
                          role="option"
                          aria-selected={on}
                          onMouseEnter={() => setExId(e.id)}
                          onClick={() => {
                            setExId(e.id);
                            setCol(1);
                            setRow(0);
                            inputRef.current?.focus();
                          }}
                          className={`relative w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${on ? "bg-sunk" : "hover:bg-sunk/60"}`}
                        >
                          {on && <span className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r ${kb ? "bg-accent" : "bg-primary"}`} />}
                          <Flag code={e.code} className="h-4 w-6 shrink-0 rounded-[3px] ring-1 ring-black/10" />
                          <span className="min-w-0 flex-1 truncate">
                            <span className={on ? "font-semibold" : ""}>{e.country}</span>
                            <span className="text-muted"> · {e.exchange}</span>
                          </span>
                          <span className="shrink-0 text-[11px] tabular text-muted">{n || ""}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* stocks */}
            <div className="overflow-y-auto py-2" role="listbox" aria-label="Stocks">
              <div className="px-4 pt-2 pb-1 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                <span className="truncate">{q && !exchanges.some((e) => e.id === exId) ? "Matches on every exchange" : `${ex.exchange} · ${ex.city}`}</span>
                <span className="tabular normal-case tracking-normal font-normal">{stocks.length}</span>
              </div>
              {loading && <div className="px-4 py-6 text-sm text-muted">Loading stocks…</div>}
              {!loading && stocks.length === 0 && (
                <div className="px-4 py-6 text-sm text-muted">{offline ? "Stocks load from the pricing server, which is offline." : q ? `Nothing matches “${query}”.` : "No stocks listed here yet."}</div>
              )}
              {stocks.map(({ s, e }, i) => {
                const kb = col === 1 && i === row;
                const cur = symbol?.symbol === s.symbol;
                return (
                  <button
                    key={s.symbol}
                    data-k={`1-${i}`}
                    role="option"
                    aria-selected={cur}
                    onMouseEnter={() => {
                      setCol(1);
                      setRow(i);
                    }}
                    onClick={() => pick(e, s)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${kb ? "bg-sunk" : ""}`}
                  >
                    <StockLogo symbol={s} selected={cur} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{s.name || s.ticker}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-muted truncate">
                        {e.id !== ex.id && <Flag code={e.code} className="h-2.5 w-4 rounded-[2px] ring-1 ring-black/10" />}
                        <span className="font-mono">{s.symbol}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular">
                      <span className="block text-sm">{s.lastClose ? fmtNum(s.lastClose, 2) : "—"} <span className="text-[11px] text-muted">{s.currency || ""}</span></span>
                      {s.monthlyPremiumBps ? <span className="block text-[11px] text-accent">≈{fmtPct(s.monthlyPremiumBps / 1e4, 2)}/mo</span> : !s.quotable ? <span className="block text-[11px] text-warn">not quotable</span> : null}
                    </span>
                    {kb && <kbd className="hidden sm:block shrink-0 rounded border border-line bg-card px-1.5 text-[10px] text-muted">↵</kbd>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-4 border-t border-line bg-sunk/50 px-4 py-2 text-[11px] text-muted">
            <span><kbd className="font-sans">↑↓</kbd> move</span>
            <span><kbd className="font-sans">←→</kbd> exchanges / stocks</span>
            <span><kbd className="font-sans">↵</kbd> pick</span>
            <span><kbd className="font-sans">esc</kbd> close</span>
            <span className="ml-auto">premium shown at a 10% deductible</span>
          </div>
        </div>
      )}
    </div>
  );
}
