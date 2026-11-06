"use client";
import { useMemo, useState } from "react";
import { useData } from "@/lib/api";
import { fmtMoney, fmtPct } from "@/lib/format";
import { Seg, Placeholder } from "./ui";

const VARIANTS = [
  { key: "tbill", label: "T-bills only", note: "The benchmark: lock the same rate, no underwriting." },
  { key: "income", label: "Income note", note: "Whole sleeve underwrites; profit paid as coupons and at maturity." },
  { key: "split", label: "Income + upside", note: "Half the sleeve underwrites, half buys calls on the asset." },
  { key: "ppn_call", label: "Classic PPN", note: "Whole sleeve buys a call. No underwriting." },
  { key: "hold_asset", label: "Hold the asset", note: "Not protected. For comparison only." },
];

function Outcome({ label, value, sub, tone }) {
  const cls = tone === "accent" ? "bg-primary text-white border-primary" : "bg-card";
  return (
    <div className={`rounded-2xl border border-line p-5 ${cls}`}>
      <div className={`text-xs font-medium uppercase tracking-[0.08em] ${tone === "accent" ? "text-white/70" : "text-muted"}`}>{label}</div>
      <div className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight tabular">{value}</div>
      <div className={`mt-1 text-sm ${tone === "accent" ? "text-white/80" : "text-ink2"}`}>{sub}</div>
    </div>
  );
}

export default function SaverCalculator() {
  const q = useData("saver.json");
  const [deposit, setDeposit] = useState(1000);
  const [T, setT] = useState(3);
  const [asset, setAsset] = useState("SPY");
  const [rate, setRate] = useState("flat0.04");
  const [compare, setCompare] = useState(false);
  const rows = Array.isArray(q.data) ? q.data : [];
  const assets = useMemo(() => [...new Set(rows.map((r) => r.asset))], [rows]);
  const pools = useMemo(() => [...new Set(rows.map((r) => r.pool || "recommended"))], [rows]);
  const base = pools.includes("recommended") ? "recommended" : pools[0];
  const poolKey = rate === "hist" ? base : pools.includes(`${base}_${rate}`) ? `${base}_${rate}` : base;
  const pick = (v) => rows.find((r) => r.asset === asset && r.T === T && r.variant === v && (r.pool || "recommended") === poolKey);

  if (q.isError) return <Placeholder title="Backtest data is still being generated">The calculator reads saver.json from the research run.</Placeholder>;
  if (!rows.length) return <div className="card h-64 animate-pulse" />;

  const val = (x) => fmtMoney(deposit * (1 + x), { dp: 0 });
  const note = pick("income");
  const tbill = pick("tbill");

  return (
    <div className="card p-5 sm:p-8">
      <div className="flex flex-wrap gap-x-6 gap-y-4 items-end">
        <label className="space-y-1.5"><span className="label block">You deposit</span>
          <input className="input w-36 text-lg font-semibold" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(Number(e.target.value) || 0)} /></label>
        <div className="space-y-1.5"><div className="label">For</div><Seg value={T} onChange={setT} options={[1, 3, 5].map((v) => ({ value: v, label: `${v} yr` }))} /></div>
        <div className="space-y-1.5"><div className="label">T-bill rate</div><Seg value={rate} onChange={setRate} options={[{ value: "hist", label: "Historical" }, { value: "flat0.04", label: "4%" }, { value: "flat0.05", label: "5%" }]} /></div>
      </div>

      {note && (
        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          <Outcome label="Worst case" value={val(note.min)} sub="Lowest result of any month in history" />
          <Outcome tone="accent" label="Typical" value={val(note.median)} sub={`About ${fmtPct(note.apy_median, 1)} a year`} />
          <Outcome label="Good year" value={val(note.p95)} sub="Top 5% of historical starts" />
        </div>
      )}
      {note && tbill && (
        <p className="mt-4 text-[15px] text-ink2">
          Beat plain T-bills in <b className="text-ink">{fmtPct(note.beat_tbill, 0)}</b> of {note.n} historical start dates. Never returned less than your deposit.
        </p>
      )}

      <button type="button" className="mt-6 text-sm font-medium text-accent hover:underline underline-offset-4" onClick={() => setCompare((c) => !c)} aria-expanded={compare}>
        {compare ? "Hide comparison" : "Compare with other strategies →"}
      </button>

      {compare && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="label">Upside asset</span>
            <Seg value={asset} onChange={setAsset} options={assets.map((a) => ({ value: a, label: a }))} />
          </div>
          <div className="overflow-x-auto">
            <table className="table-x">
              <thead>
                <tr><th>Strategy</th><th>Worst</th><th>Bad year (P5)</th><th>Median</th><th>Good year (P95)</th><th>Median APY</th><th>Beats T-bills</th></tr>
              </thead>
              <tbody>
                {VARIANTS.map((v) => {
                  const r = pick(v.key);
                  if (!r) return null;
                  const protectedV = v.key !== "hold_asset";
                  return (
                    <tr key={v.key} className={v.key === "income" ? "bg-accentSoft/60" : ""}>
                      <td className="whitespace-normal min-w-[180px]"><div className="font-medium">{v.label}</div><div className="text-xs text-muted">{v.note}</div></td>
                      <td className={!protectedV && r.min < 0 ? "text-bad" : ""}>{val(r.min)}</td>
                      <td>{val(r.p5)}</td>
                      <td className="font-semibold">{val(r.median)}</td>
                      <td>{val(r.p95)}</td>
                      <td>{fmtPct(r.apy_median, 2)}</td>
                      <td>{r.beat_tbill === null || r.beat_tbill === undefined ? "—" : fmtPct(r.beat_tbill, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-muted mt-6">
        Backtest on historical prices, net of a 7.5% option spread, no protocol fee. Past results are not a promise of future returns.
      </p>
    </div>
  );
}
