"use client";
import { useMemo, useState } from "react";
import { useData } from "@/lib/api";
import { fmtMoney, fmtPct } from "@/lib/format";
import { Seg, Placeholder } from "./ui";

const VARIANTS = [
  { key: "tbill", label: "Government bonds only", note: "Same rate, nothing extra." },
  { key: "income", label: "This savings plan", note: "Bonds, plus earnings from protection fees." },
  { key: "split", label: "Savings plan + stock upside", note: "Half earns fees, half follows the stock up." },
  { key: "ppn_call", label: "Classic bank version", note: "Bonds, plus a bet the stock goes up." },
  { key: "hold_asset", label: "Just buy the stock", note: "No guarantee. For comparison only." },
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

  if (q.isError) return <Placeholder title="Past results are not ready yet">Check back in a few minutes.</Placeholder>;
  if (!rows.length) return <div className="card h-64 animate-pulse" />;

  const val = (x) => fmtMoney(deposit * (1 + x), { dp: 0 });
  const note = pick("income");
  const tbill = pick("tbill");

  return (
    <div className="card p-5 sm:p-8">
      <div className="flex flex-wrap gap-x-6 gap-y-4 items-end">
        <label className="space-y-1.5"><span className="label block">You save ($)</span>
          <input className="input w-36 text-lg font-semibold" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(Number(e.target.value) || 0)} /></label>
        <div className="space-y-1.5"><div className="label">For</div><Seg value={T} onChange={setT} options={[1, 3, 5].map((v) => ({ value: v, label: `${v} yr` }))} /></div>
        <div className="space-y-1.5"><div className="label">Government bond rate</div><Seg value={rate} onChange={setRate} options={[{ value: "hist", label: "Past rates" }, { value: "flat0.04", label: "4%" }, { value: "flat0.05", label: "5%" }]} /></div>
      </div>

      {note && (
        <div className="mt-6 grid sm:grid-cols-3 gap-3">
          <Outcome label="Worst case" value={val(note.min)} sub="Lowest result of any month" />
          <Outcome tone="accent" label="Typical" value={val(note.median)} sub={`About ${fmtPct(note.apy_median, 1)} a year`} />
          <Outcome label="Good year" value={val(note.p95)} sub="Top 5% of months" />
        </div>
      )}
      {note && tbill && (
        <p className="mt-4 text-[15px] text-ink2">
          Beat plain government bonds in <b className="text-ink">{fmtPct(note.beat_tbill, 0)}</b> of {note.n} past months. Never paid back less than was put in.
        </p>
      )}

      <button type="button" className="mt-6 text-sm font-medium text-accent hover:underline underline-offset-4" onClick={() => setCompare((c) => !c)} aria-expanded={compare}>
        {compare ? "Hide comparison" : "Compare with other choices →"}
      </button>

      {compare && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="label">Stock market</span>
            <Seg value={asset} onChange={setAsset} options={assets.map((a) => ({ value: a, label: a }))} />
          </div>
          <div className="overflow-x-auto">
            <table className="table-x">
              <thead>
                <tr><th>Choice</th><th>Worst</th><th>Bad year</th><th>Typical</th><th>Good year</th><th>Per year</th><th>Beat bonds</th></tr>
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
        Based on past prices, after trading costs. Past results do not promise future ones.
      </p>
    </div>
  );
}
