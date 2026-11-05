import { keccak256, toBytes, formatUnits, parseUnits } from "viem";

export const DEC = 6;

/** keccak256(utf8("EXCHANGE:TICKER")) — the on-chain symbol id. */
export function symbolId(symbol) {
  return keccak256(toBytes(symbol));
}

export function roleId(name) {
  return keccak256(toBytes(name));
}

export function toUnits(v, dec = DEC) {
  try {
    return parseUnits(String(v || "0"), dec);
  } catch {
    return 0n;
  }
}

export function fromUnits(v, dec = DEC) {
  if (v === undefined || v === null) return 0;
  try {
    return Number(formatUnits(BigInt(v), dec));
  } catch {
    return 0;
  }
}

export function fmtMoney(n, { dp = 2, sym = "$" } = {}) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return "—";
  const x = Number(n);
  const abs = Math.abs(x);
  const s = abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : abs.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return `${x < 0 ? "−" : ""}${sym}${s}`;
}

export function fmtUnits(v, { dec = DEC, dp = 2, sym = "" } = {}) {
  return fmtMoney(fromUnits(v, dec), { dp, sym });
}

export function fmtPct(x, dp = 1, { sign = false } = {}) {
  if (x === undefined || x === null || Number.isNaN(Number(x))) return "—";
  const v = Number(x) * 100;
  const s = `${Math.abs(v).toFixed(dp)}%`;
  if (v < 0) return `−${s}`;
  return sign && v > 0 ? `+${s}` : s;
}

export function fmtBps(bps, dp = 1) {
  return fmtPct(Number(bps) / 10_000, dp);
}

export function fmtNum(x, dp = 0) {
  if (x === undefined || x === null || Number.isNaN(Number(x))) return "—";
  return Number(x).toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp });
}

export function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function shortHash(h) {
  if (!h) return "";
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

export function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtDuration(seconds) {
  let s = Math.max(0, Math.floor(Number(seconds)));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const MARKET_LABELS = {
  US: "United States", Canada: "Canada", Brazil: "Brazil", Mexico: "Mexico", UK: "United Kingdom", Germany: "Germany",
  France: "France", Netherlands: "Netherlands", Switzerland: "Switzerland", Spain: "Spain", Italy: "Italy", Sweden: "Sweden",
  Japan: "Japan", HongKong: "Hong Kong", ChinaA: "China A-shares", Taiwan: "Taiwan", Korea: "South Korea", India: "India",
  Singapore: "Singapore", Australia: "Australia", SouthAfrica: "South Africa", Saudi: "Saudi Arabia", Indonesia: "Indonesia",
  GLOBAL: "Global pool", TBILLS: "T-bills only",
};

export function marketLabel(m) {
  return MARKET_LABELS[m] || m;
}
