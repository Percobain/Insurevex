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

export default function SaverCalculator() {
  const q = useData("saver.json");
  const [deposit, setDeposit] = useState(1000);
  const [T, setT] = useState(3);
  const [asset, setAsset] = useState("SPY");
  const [rate, setRate] = useState("flat0.04");
  const rows = Array.isArray(q.data) ? q.data : [];
  const assets = useMemo(() => [...new Set(rows.map((r) => r.asset))], [rows]);
  const pools = useMemo(() => [...new Set(rows.map((r) => r.pool || "recommended"))], [rows]);
  const base = pools.includes("recommended") ? "recommended" : pools[0];
  const poolKey = rate === "hist" ? base : pools.includes(`${base}_${rate}`) ? `${base}_${rate}` : base;
  const pick = (v) => rows.find((r) => r.asset === asset && r.T === T && r.variant === v && (r.pool || "recommended") === poolKey);

  if (q.isError) return <Placeholder title="Backtest data is still being generated">The calculator reads saver.json from the research run.</Placeholder>;
  if (!rows.length) return <div className="card h-64 animate-pulse" />;

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
        <div>
          <div className="eyebrow">Calculator</div>
          <h3 className="font-display text-3xl tracking-tight mt-2">What would {fmtMoney(deposit, { dp: 0 })} have become?</h3>
          <p className="text-sm text-ink2 mt-1">Every monthly cohort in the backtest, worst case included. Principal was never touched.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="space-y-1"><span className="label">Deposit</span>
            <input className="input w-32" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(Number(e.target.value) || 0)} /></label>
          <div className="space-y-1"><div className="label">Term</div><Seg value={T} onChange={setT} options={[1, 3, 5].map((v) => ({ value: v, label: `${v}y` }))} /></div>
          <div className="space-y-1"><div className="label">Upside asset</div><Seg value={asset} onChange={setAsset} options={assets.map((a) => ({ value: a, label: a }))} /></div>
          <div className="space-y-1"><div className="label">Rates</div><Seg value={rate} onChange={setRate} options={[{ value: "hist", label: "History" }, { value: "flat0.04", label: "4%" }, { value: "flat0.05", label: "5%" }]} /></div>
        </div>
      </div>
      <div className="overflow-x-auto mt-6">
        <table className="table-x">
          <thead>
            <tr><th>Strategy</th><th>Worst</th><th>Bad year (P5)</th><th>Median</th><th>Good year (P95)</th><th>Median APY</th><th>Beats T-bills</th></tr>
          </thead>
          <tbody>
            {VARIANTS.map((v) => {
              const r = pick(v.key);
              if (!r) return null;
              const val = (x) => fmtMoney(deposit * (1 + x), { dp: 0 });
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
      <p className="text-xs text-muted mt-3">
        Simulated on historical prices, net of a 7.5% option spread, with no protocol fee. “History” uses the Treasury yield on each issue date; 4% and 5% hold the rate
        flat. Cohorts: {pick("income")?.n ?? "—"} monthly issues.
      </p>
    </div>
  );
}
