"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "./navbar-utils/utils";

/**
 * Ticket-style navbar (shadcn-style component, ported from TSX).
 * Props: brand, items [{ label, href, active }], action (right slot), plus any <header> attributes.
 * Links use next/link; below `lg` the links move to a scrollable second row.
 */
export function Navbar({
  brand = "BIGBULL",
  items = [
    { label: "EVENTS", href: "#", active: true },
    { label: "STUBS", href: "#" },
    { label: "VENUES", href: "#" },
  ],
  action,
  className,
  ...props
}) {
  const links = (
    <>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "shrink-0 rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors",
            item.active ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </>
  );

  return (
    <header className={cn("relative w-full border-b-2 border-dashed border-border bg-card font-mono shadow-xs select-none", className)} {...props}>
      <div className="mx-auto flex w-full max-w-page items-center justify-between gap-4 px-4 py-3">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2" aria-label={`${brand} home`}>
          <span className="flex size-6 items-center justify-center rounded-xs bg-foreground text-[11px] font-bold text-background">{brand.charAt(0)}</span>
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-foreground">{brand}</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden lg:flex items-center gap-1">{links}</nav>

        {/* Right action */}
        {action ? (
          <div className="flex items-center gap-2">{action}</div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="rounded-xs border border-dashed border-border bg-secondary px-2 py-1 text-[10px] font-bold uppercase text-foreground">ADMIT ONE</span>
          </div>
        )}
      </div>

      {/* Links on small screens */}
      <nav className="lg:hidden flex items-center gap-1 overflow-x-auto border-t border-dashed border-border px-4 py-2">{links}</nav>
    </header>
  );
}

export default Navbar;
