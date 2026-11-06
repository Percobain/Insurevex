"use client";
import { useMemo, useState } from "react";
import { Liveline } from "liveline";
import { useApi } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import { Seg } from "./ui";

const DAY = 86400;
const WINDOWS = [
  { label: "1M", secs: 30 * DAY },
  { label: "3M", secs: 91 * DAY },
  { label: "6M", secs: 182 * DAY },
  { label: "1Y", secs: 365 * DAY },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Daily closes drawn with Liveline. Liveline anchors its right edge at "now", so every point is shifted forward by the
 * gap between the last close and now; the axis labels add that gap back so they show the real trading dates.
 * `deductible` (0–1) draws the price below which the cover starts paying.
 */
export default function PriceChart({ symbol, currency, deductible }) {
  const q = useApi(symbol ? `/api/price?symbol=${encodeURIComponent(symbol)}` : null);
  const [win, setWin] = useState(182 * DAY);

  const { points, offset } = useMemo(() => {
    const raw = (q.data?.history || []).map(([d, c]) => ({ time: Date.parse(`${d}T00:00:00Z`) / 1000, value: Number(c) }));
    if (!raw.length) return { points: [], offset: 0 };
    const off = Math.floor(Date.now() / 1000) - raw[raw.length - 1].time;
    return { points: raw.map((p) => ({ time: p.time + off, value: p.value })), offset: off };
  }, [q.data]);

  if (!symbol) return null;
  if (!q.isLoading && !points.length) return <div className="h-40 rounded-xl bg-sunk grid place-items-center text-xs text-muted">Price history unavailable</div>;

  const last = points.length ? points[points.length - 1].value : 0;
  const cutoff = (points.length ? points[points.length - 1].time : 0) - win;
  const first = points.find((p) => p.time >= cutoff)?.value ?? last;
  const change = first ? last / first - 1 : 0;
  const up = change >= 0;
  const cur = currency ? ` ${currency}` : "";

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <Seg value={win} onChange={setWin} options={WINDOWS.map((w) => ({ value: w.secs, label: w.label }))} />
        {points.length > 0 && (
          <span className={`tabular font-medium ${up ? "text-good" : "text-bad"}`}>{up ? "+" : ""}{fmtNum(change * 100, 1)}%</span>
        )}
      </div>
      <div className="h-56 mt-2 -mx-1">
        <Liveline
          data={points}
          value={last}
          loading={q.isLoading}
          theme="light"
          color="#1f3d3c"
          window={win}
          momentum={false}
          pulse={false}
          badgeVariant="minimal"
          referenceLine={deductible && last ? { value: last * (1 - deductible), label: `Payout below ${fmtNum(last * (1 - deductible), 2)}` } : undefined}
          formatValue={(v) => `${fmtNum(v, 2)}${cur}`}
          formatTime={(t) => {
            const d = new Date((t - offset) * 1000);
            return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
          }}
          emptyText="Price history unavailable"
        />
      </div>
    </div>
  );
}
