"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Navbar from "@/components/ui/navbar";
import KycBadge from "./KycBadge";
import WalletButton from "./WalletButton";

const NAV = [
  { label: "Protect", href: "/protect" },
  { label: "Save", href: "/save" },
  { label: "Pool", href: "/pool" },
  { label: "Agent", href: "/agent" },
  { label: "Research", href: "/docs" },
  { label: "Activity", href: "/activity" },
  { label: "Issuer", href: "/issuer" },
];

export default function Header() {
  const path = usePathname();
  // Hide while scrolling down, come back on any scroll up (and always at the top of the page).
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    const on = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      if (y < 80) setHidden(false);
      else if (dy > 6) setHidden(true);
      else if (dy < -6) setHidden(false);
      if (Math.abs(dy) > 6) lastY.current = y;
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => setHidden(false), [path]);
  return (
    <Navbar
      brand="InsureVEX"
      className={`sticky top-0 z-40 transition-transform duration-300 ease-out ${hidden ? "-translate-y-full" : "translate-y-0"}`}
      items={NAV.map((n) => ({ ...n, active: Boolean(path?.startsWith(n.href)) }))}
      action={
        <>
          <div className="hidden sm:block font-sans">
            <KycBadge />
          </div>
          <div className="font-sans">
            <WalletButton />
          </div>
        </>
      }
    />
  );
}
