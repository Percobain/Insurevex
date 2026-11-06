"use client";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar, Cell, ReferenceLine,
} from "recharts";
import { fmtPct, fmtNum, marketLabel } from "@/lib/format";

export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const tip = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12, color: "var(--ink)" };
const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false };
const seriesLabel = (k) => (k === "TBILLS" ? "Government bonds only" : marketLabel(k));

export function EquityChart({ data }) {
  const markets = Object.keys(data?.series || {}).filter((k) => k !== "GLOBAL" && k !== "TBILLS");
  const [extra, setExtra] = useState(markets.includes("US") ? "US" : markets[0]);
  const keys = ["GLOBAL", extra, "TBILLS"].filter((k) => k && data.series[k]);
  const rows = useMemo(
    () => (data?.dates || []).map((d, i) => Object.fromEntries([["d", d], ...keys.map((k) => [k, data.series[k][i]])])),
    [data, keys.join()],
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="label mr-1">Compare with</span>
        <select className="input h-9 w-auto text-sm" value={extra} onChange={(e) => setExtra(e.target.value)}>
          {markets.map((m) => <option key={m} value={m}>{marketLabel(m)}</option>)}
        </select>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="d" {...axis} minTickGap={40} />
            <YAxis {...axis} width={44} tickFormatter={(v) => `${fmtNum(v, 1)}×`} domain={["auto", "auto"]} />
            <Tooltip contentStyle={tip} formatter={(v, k) => [`${fmtNum(v, 3)}×`, seriesLabel(k)]} />
            <Legend formatter={(k) => <span style={{ color: "var(--ink2)", fontSize: 12 }}>{seriesLabel(k)}</span>} />
            {keys.map((k, i) => (
              <Line key={k} type="monotone" dataKey={k} dot={false} strokeWidth={2} stroke={k === "TBILLS" ? "var(--muted)" : SERIES[i]} strokeDasharray={k === "TBILLS" ? "4 4" : undefined} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LossRatioChart({ rows, breakeven = 1 / 1.5 }) {
  const data = (rows || []).map((r) => ({ year: r.year, lr: Math.min(r.loss_ratio ?? 0, 3), raw: r.loss_ratio, uw: r.uw }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="year" {...axis} />
          <YAxis {...axis} width={36} tickFormatter={(v) => fmtNum(v, 1)} />
          <Tooltip contentStyle={tip} cursor={{ fill: "var(--sunk)" }} formatter={(v, k, p) => [k === "lr" ? `${fmtNum(p.payload.raw, 2)} (pool ${fmtPct(p.payload.uw, 1, { sign: true })})` : v, "Payouts ÷ fees"]} />
          <ReferenceLine y={breakeven} stroke="var(--muted)" strokeDasharray="4 4" label={{ value: "break-even (price 1.5× fair)", position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }} />
          <Bar dataKey="lr" radius={[4, 4, 0, 0]} maxBarSize={22}>
            {data.map((d) => <Cell key={d.year} fill={d.raw > 1 ? "var(--bad)" : "var(--chart-1)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WalkForwardChart({ rows }) {
  const data = (rows || []).map((r) => ({ year: r.year, oos: r.oos_total, uw: r.oos_uw }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="year" {...axis} />
          <YAxis {...axis} width={44} tickFormatter={(v) => fmtPct(v, 0)} />
          <Tooltip contentStyle={tip} cursor={{ fill: "var(--sunk)" }} formatter={(v) => [fmtPct(v, 1), "Pool return, no hindsight"]} />
          <ReferenceLine y={0} stroke="var(--muted)" />
          <Bar dataKey="oos" radius={[4, 4, 0, 0]} maxBarSize={22}>
            {data.map((d) => <Cell key={d.year} fill={d.oos < 0 ? "var(--bad)" : "var(--chart-3)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Correlation heatmap: single-hue sequential blue, value in tooltip and title attribute. */
export function CorrHeatmap({ markets, matrix }) {
  if (!markets?.length) return null;
  const n = markets.length;
  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `110px repeat(${n}, 22px)` }}>
        <div />
        {markets.map((m) => (
          <div key={m} className="text-[10px] text-muted h-[90px] flex items-end justify-center">
            <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap">{marketLabel(m)}</span>
          </div>
        ))}
        {markets.map((row, i) => (
          <div key={row} className="contents">
            <div className="text-[11px] text-ink2 pr-2 truncate leading-[22px]">{marketLabel(row)}</div>
            {matrix[i].map((v, j) => {
              const a = Math.max(0, Math.min(1, v));
              return (
                <div key={j} title={`${marketLabel(row)} × ${marketLabel(markets[j])}: ${fmtNum(v, 2)}`} className="h-[22px] w-[22px] rounded-[3px]"
                  style={{ background: `rgb(var(--accent-rgb) / ${0.08 + a * 0.85})` }} />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted mt-3">
        <span>0</span><div className="h-2 w-32 rounded" style={{ background: "linear-gradient(90deg, rgb(var(--accent-rgb) / .08), rgb(var(--accent-rgb) / .93))" }} /><span>1 (move together)</span>
      </div>
    </div>
  );
}
