"use client";
import { useMemo } from "react";
import { useApi } from "./api";
import { EXCHANGES } from "./exchanges";
import { symbolId } from "./format";

/** Map of on-chain symbol id (bytes32) -> "EXCHANGE:TICKER", built from the server's market list (plus samples). */
export function useSymbolNames() {
  const markets = useApi("/api/markets");
  return useMemo(() => {
    const m = {};
    const add = (s) => { if (s) m[symbolId(s).toLowerCase()] = s; };
    EXCHANGES.forEach((e) => e.sample.forEach(add));
    (markets.data?.markets || []).forEach((mk) => (mk.symbols || []).forEach((s) => add(s.symbol)));
    return (id) => (id ? m[String(id).toLowerCase()] || `${String(id).slice(0, 10)}…` : "—");
  }, [markets.data]);
}
