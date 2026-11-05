"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { useApi } from "@/lib/api";
import { fmtNum } from "@/lib/format";

export default function PriceChart({ symbol, currency }) {
  const q = useApi(symbol ? `/api/price?symbol=${encodeURIComponent(symbol)}` : null);
  const hist = (q.data?.history || []).slice(-180).map(([d, c]) => ({ d, c: Number(c) }));
  if (!symbol) return null;
  if (q.isLoading) return <div className="h-40 rounded-xl bg-sunk animate-pulse" />;
  if (!hist.length) return <div className="h-40 rounded-xl bg-sunk grid place-items-center text-xs text-muted">Price history unavailable</div>;
  const first = hist[0].c, last = hist[hist.length - 1].c;
  const up = last >= first;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink2">Last 6 months</span>
        <span className={`tabular ${up ? "text-good" : "text-bad"}`}>{up ? "+" : ""}{fmtNum(((last / first) - 1) * 100, 1)}%</span>
      </div>
      <div className="h-40 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={hist} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="pc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="d" hide />
            <YAxis domain={["auto", "auto"]} hide />
            <Tooltip
              contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: "var(--muted)" }}
              formatter={(v) => [`${fmtNum(v, 2)} ${currency || ""}`, "Close"]}
            />
            <Area type="monotone" dataKey="c" stroke="var(--chart-1)" strokeWidth={2} fill="url(#pc)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
