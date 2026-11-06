"use client";
import { useQuery } from "@tanstack/react-query";

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").replace(/\/$/, "");

async function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

export async function apiGet(path, { timeout = 8000 } = {}) {
  const res = await withTimeout(fetch(`${API_BASE}${path}`, { cache: "no-store" }), timeout);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export async function apiPost(path, body, { timeout = 10000 } = {}) {
  const res = await withTimeout(
    fetch(`${API_BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    timeout,
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

/** Server data hook. Never retries aggressively: the app must stay usable when the server is down. */
export function useApi(path, { enabled = true, refetchInterval = false, timeout } = {}) {
  return useQuery({
    queryKey: ["api", path],
    queryFn: () => apiGet(path, timeout ? { timeout } : undefined),
    enabled: Boolean(path) && enabled,
    retry: 0,
    refetchInterval,
    staleTime: 15_000,
  });
}

/** Static backtest data shipped in /public/data. */
export function useData(file) {
  return useQuery({
    queryKey: ["data", file],
    queryFn: async () => {
      const res = await fetch(`/data/${file}`, { cache: "force-cache" });
      if (!res.ok) throw new Error("missing");
      return res.json();
    },
    retry: 0,
    staleTime: Infinity,
  });
}
