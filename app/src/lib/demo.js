"use client";
import { useEffect, useState } from "react";

/**
 * Demo mode for recording walkthroughs: open any page with ?demo=1 (remembered in this browser, ?demo=0 turns it off).
 * The wallet looks connected and verified, quotes are computed locally and every "transaction" only plays its toasts.
 * Nothing is signed or sent.
 */
export const DEMO_ADDR = "0x7a3f5c2e9b14d8a06c3e2f1b5d4a9c8e7f6091ce";
export const DEMO_BALANCE = 25_000_000_000n; // 25,000 test USD (6 decimals)

function read() {
  try {
    const q = new URLSearchParams(window.location.search).get("demo");
    if (q === "1") localStorage.setItem("ivx-demo", "1");
    if (q === "0") localStorage.removeItem("ivx-demo");
    return localStorage.getItem("ivx-demo") === "1";
  } catch {
    return false;
  }
}

export function useDemo() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(read()), []);
  return on;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const fakeHash = () => "0x" + Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
