"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import KycBadge from "./KycBadge";

/** What you can do, in plain words. Shown in the Product menu and the mobile menu. */
const PRODUCT = [
  { href: "/protect", label: "Protect a stock", sub: "Cover your shares against a crash", icon: "shield" },
  { href: "/save", label: "Save safely", sub: "Get your money back, plus extra", icon: "coins" },
  { href: "/pool", label: "The pool", sub: "Where the protection money sits", icon: "stack" },
];
const LINKS = [
  { href: "/docs", label: "Research" },
  { href: "/activity", label: "Activity" },
  { href: "/issuer", label: "Issuer" },
];

/** Small isometric line icons for the menu tiles. */
function Icon({ name }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinejoin: "round", strokeLinecap: "round" };
  if (name === "shield")
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" {...common}>
        <path d="M12 3 L19 6 V12 C19 16.5 15.8 19.4 12 21 C8.2 19.4 5 16.5 5 12 V6 Z" />
        <path d="M9 12 L11.2 14.2 L15.5 9.8" />
      </svg>
    );
  if (name === "coins")
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" {...common}>
        <ellipse cx="12" cy="7" rx="7" ry="3" />
        <path d="M5 7 V11 C5 12.7 8.1 14 12 14 C15.9 14 19 12.7 19 11 V7" />
        <path d="M5 11 V15 C5 16.7 8.1 18 12 18 C15.9 18 19 16.7 19 15 V11" />
      </svg>
    );
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...common}>
      <path d="M12 3 L20 7 L12 11 L4 7 Z" />
      <path d="M4 11.5 L12 15.5 L20 11.5" />
      <path d="M4 16 L12 20 L20 16" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 shrink-0" aria-label="InsureVEX home">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="8" fill="var(--primary)" />
        <path d="M16 6.5 L24 10 V16 C24 20.6 20.6 23.6 16 25.5 C11.4 23.6 8 20.6 8 16 V10 Z" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 16.5 L15 19.2 L20.5 13" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-semibold tracking-tight text-[17px]">
        Insure<span className="text-accent">VEX</span>
      </span>
    </Link>
  );
}

function NavLink({ href, label, active }) {
  return (
    <Link href={href} className={`relative px-3 h-9 grid place-items-center text-[12px] font-medium uppercase tracking-[0.08em] transition-colors ${active ? "text-ink" : "text-muted hover:text-ink"}`}>
      {label}
      <span className={`absolute bottom-0.5 h-1 w-1 rounded-full bg-accent transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
    </Link>
  );
}

function ProductMenu({ path }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = PRODUCT.some((p) => path?.startsWith(p.href));
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`relative px-3 h-9 flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.08em] transition-colors ${active || open ? "text-ink" : "text-muted hover:text-ink"}`}
      >
        Product
        <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-accent transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
      </button>
      <div className={`absolute left-1/2 -translate-x-1/2 top-full pt-3 transition-all duration-200 ${open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-1 pointer-events-none"}`}>
        <div className="w-[560px] rounded-2xl border border-line bg-card shadow-[0_18px_50px_-20px_rgb(26_36_35/0.35)] p-2">
          <div className="grid grid-cols-3 gap-1">
            {PRODUCT.map((p) => (
              <Link key={p.href} href={p.href} className={`group rounded-xl p-3 transition-colors ${path?.startsWith(p.href) ? "bg-sunk" : "hover:bg-sunk"}`}>
                <div className="h-11 w-11 rounded-lg bg-sunk text-ink grid place-items-center border border-line group-hover:bg-primary group-hover:text-white transition-colors">
                  <Icon name={p.icon} />
                </div>
                <div className="mt-3 text-sm font-semibold">{p.label}</div>
                <div className="text-xs text-ink2 mt-0.5 leading-snug">{p.sub}</div>
              </Link>
            ))}
          </div>
          <Link href="/#how" className="mt-1 flex items-center justify-between rounded-xl px-3 py-2.5 text-xs text-ink2 hover:bg-sunk">
            <span>
              <span className="font-semibold text-ink">New to this?</span> See how savers and holders fund each other.
            </span>
            <span className="text-accent font-semibold">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className="sticky top-0 z-40">
      <div className={`border-b transition-[background-color,box-shadow,border-color] duration-300 ${scrolled ? "bg-paper/90 backdrop-blur border-line shadow-[0_8px_24px_-18px_rgb(26_36_35/0.4)]" : "bg-paper border-line/70"}`}>
        <div className="mx-auto max-w-page px-4 h-16 flex items-center gap-4">
          <Logo />
          <nav className="hidden lg:flex items-center gap-1 mx-auto">
            <ProductMenu path={path} />
            {LINKS.map((n) => (
              <NavLink key={n.href} href={n.href} label={n.label} active={path?.startsWith(n.href)} />
            ))}
          </nav>
          <div className="ml-auto lg:ml-0 flex items-center gap-2">
            <div className="hidden sm:block">
              <KycBadge />
            </div>
            <ConnectButton chainStatus={{ smallScreen: "icon", largeScreen: "icon" }} accountStatus={{ smallScreen: "avatar", largeScreen: "address" }} showBalance={false} label="Connect wallet" />
            <button className="lg:hidden h-10 w-10 grid place-items-center rounded-xl border border-line bg-card" onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {open ? <path d="M6 6 L18 18 M18 6 L6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
              </svg>
            </button>
          </div>
        </div>
      </div>
      {open && (
        <nav className="lg:hidden border-b border-line bg-paper px-4 pb-4 pt-2 shadow-[0_18px_30px_-24px_rgb(26_36_35/0.5)]">
          <div className="grid gap-1">
            {PRODUCT.map((p) => (
              <Link key={p.href} href={p.href} className={`flex items-center gap-3 rounded-xl p-2.5 ${path?.startsWith(p.href) ? "bg-sunk" : ""}`}>
                <span className="h-10 w-10 shrink-0 rounded-lg bg-sunk text-ink grid place-items-center border border-line">
                  <Icon name={p.icon} />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="block text-xs text-ink2">{p.sub}</span>
                </span>
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1 mt-2 pt-2 border-t border-line">
            {LINKS.map((n) => (
              <Link key={n.href} href={n.href} className={`h-10 grid place-items-center rounded-lg text-[12px] font-medium uppercase tracking-[0.08em] ${path?.startsWith(n.href) ? "bg-sunk text-ink" : "text-ink2"}`}>
                {n.label}
              </Link>
            ))}
          </div>
          <div className="pt-3">
            <KycBadge />
          </div>
        </nav>
      )}
    </header>
  );
}
