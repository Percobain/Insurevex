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

  const floor = deductible && last ? last * (1 - deductible) : null;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <Seg value={win} onChange={setWin} options={WINDOWS.map((w) => ({ value: w.secs, label: w.label }))} />
        {points.length > 0 && (
          <span className="flex items-baseline gap-2 tabular">
            <span className="font-semibold text-ink">{fmtNum(last, 2)}<span className="text-xs font-normal text-muted">{cur}</span></span>
            <span className={`font-medium ${up ? "text-good" : "text-bad"}`}>{up ? "+" : ""}{fmtNum(change * 100, 1)}%</span>
          </span>
        )}
      </div>
      <div className="h-56 mt-2">
        <Liveline
          data={points}
          value={last}
          loading={q.isLoading}
          theme="light"
          color="#1f3d3c"
          window={win}
          momentum={false}
          pulse={false}
          badge={false}
          referenceLine={floor ? { value: floor } : undefined}
          formatValue={(v) => fmtNum(v, v >= 1000 ? 0 : 2)}
          formatTime={(t) => {
            const d = new Date((t - offset) * 1000);
            return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
          }}
          emptyText="Price history unavailable"
        />
      </div>
      {floor && (
        <div className="mt-2 flex items-center gap-2 text-xs text-ink2">
          <span className="w-5 border-t border-dashed border-muted" aria-hidden="true" />
          Cover starts paying below <span className="font-medium text-ink tabular">{fmtNum(floor, 2)}{cur}</span>
        </div>
      )}
    </div>
  );
}
