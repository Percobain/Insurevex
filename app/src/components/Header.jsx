"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ThemeToggle } from "./Theme";
import KycBadge from "./KycBadge";

const NAV = [
  { href: "/protect", label: "Protect" },
  { href: "/save", label: "Save" },
  { href: "/pool", label: "Pool" },
  { href: "/agent", label: "Agent" },
  { href: "/docs", label: "Research" },
  { href: "/activity", label: "Activity" },
  { href: "/issuer", label: "Issuer" },
];

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="InsureVEX home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--ink)" />
        <path d="M8 19.5 L13 14 L17 17.5 L24 10" stroke="var(--paper)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 23.5 H25" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="font-semibold tracking-tight text-[17px]">
        Insure<span className="text-accent">VEX</span>
      </span>
    </Link>
  );
}

export default function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
      <div className="mx-auto max-w-page px-4 h-16 flex items-center gap-4">
        <Logo />
        <nav className="hidden lg:flex items-center gap-1 ml-4">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 h-9 grid place-items-center rounded-lg text-sm ${path?.startsWith(n.href) ? "text-ink bg-sunk" : "text-ink2 hover:text-ink"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block"><KycBadge /></div>
          <ThemeToggle />
          <ConnectButton chainStatus={{ smallScreen: "icon", largeScreen: "full" }} accountStatus={{ smallScreen: "avatar", largeScreen: "address" }} showBalance={false} />
          <button className="lg:hidden h-9 w-9 grid place-items-center rounded-lg border border-line" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="lg:hidden border-t border-line px-4 py-2 grid grid-cols-2 gap-1 bg-paper">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={`px-3 h-10 flex items-center rounded-lg text-sm ${path?.startsWith(n.href) ? "bg-sunk text-ink" : "text-ink2"}`}>
              {n.label}
            </Link>
          ))}
          <div className="col-span-2 py-2"><KycBadge /></div>
        </nav>
      )}
    </header>
  );
}
