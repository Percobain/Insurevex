"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "./navbar-utils/utils";

const linkClass = (active) =>
  cn(
    "relative shrink-0 rounded-md px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors",
    "after:absolute after:left-2.5 after:right-2.5 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-accent after:transition-transform after:duration-200 after:origin-left",
    active ? "text-foreground after:scale-x-100" : "text-muted-foreground hover:text-foreground after:scale-x-0 hover:after:scale-x-100 hover:after:bg-border",
  );

/** Desktop "More" dropdown: a button with aria-expanded; closes on outside click, Escape and navigation. */
function MoreMenu({ label, items }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const btn = React.useRef(null);
  const id = React.useId();
  const active = items.some((i) => i.active);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(linkClass(active), "inline-flex items-center gap-1")}
      >
        {label}
        <svg aria-hidden="true" viewBox="0 0 12 12" className={cn("h-3 w-3 transition-transform", open && "rotate-180")}>
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul id={id} className="absolute right-0 top-full mt-2 min-w-[11rem] rounded-md border-2 border-dashed border-border bg-card p-1 shadow-xs z-50">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-xs px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors hover:bg-secondary",
                  item.active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Ticket-style navbar (shadcn-style component, ported from TSX).
 * Props: brand, items [{ label, href, active }], more [{ label, href, active }] (secondary links behind a
 * "More" dropdown on desktop, listed inline after a divider on small screens), moreLabel, action (right slot),
 * plus any <header> attributes. Links use next/link; below `lg` the links move to a scrollable second row.
 */
export function Navbar({
  brand = "BIGBULL",
  items = [
    { label: "EVENTS", href: "#", active: true },
    { label: "STUBS", href: "#" },
    { label: "VENUES", href: "#" },
  ],
  more = [],
  moreLabel = "More",
  action,
  className,
  ...props
}) {
  const renderLinks = (list) =>
    list.map((item) => (
      <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} className={linkClass(item.active)}>
        {item.label}
      </Link>
    ));

  return (
    <header className={cn("relative w-full border-b-2 border-dashed border-border bg-card font-mono shadow-xs select-none", className)} {...props}>
      <div className="mx-auto flex w-full max-w-page items-center justify-between gap-4 px-4 py-3">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2" aria-label={`${brand} home`}>
          <span className="flex size-6 items-center justify-center rounded-xs bg-foreground text-[11px] font-bold text-background">{brand.charAt(0)}</span>
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-foreground">{brand}</span>
        </Link>

        {/* Nav links */}
        <nav aria-label="Main" className="hidden lg:flex items-center gap-1">
          {renderLinks(items)}
          {more.length > 0 && <MoreMenu label={moreLabel} items={more} />}
        </nav>

        {/* Right action */}
        {action ? (
          <div className="flex items-center gap-2">{action}</div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="rounded-xs border border-dashed border-border bg-secondary px-2 py-1 text-[10px] font-bold uppercase text-foreground">ADMIT ONE</span>
          </div>
        )}
      </div>

      {/* Links on small screens: main links, then the "More" links after a divider */}
      <nav aria-label="Main" className="lg:hidden flex items-center gap-1 overflow-x-auto border-t border-dashed border-border px-4 py-2">
        {renderLinks(items)}
        {more.length > 0 && (
          <>
            <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />
            {renderLinks(more)}
          </>
        )}
      </nav>
    </header>
  );
}

export default Navbar;
