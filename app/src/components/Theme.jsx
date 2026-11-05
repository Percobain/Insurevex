"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const ThemeCtx = createContext({ theme: "light", toggle: () => {} });

export function useTheme() {
  return useContext(ThemeCtx);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    let t = null;
    try {
      t = localStorage.getItem("ivx-theme");
    } catch {}
    if (!t) t = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  const toggle = useCallback(() => {
    setTheme((cur) => {
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("ivx-theme", next);
      } catch {}
      return next;
    });
  }, []);

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="h-9 w-9 grid place-items-center rounded-lg border border-line text-ink2 hover:text-ink hover:bg-sunk"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title="Toggle theme"
    >
      {theme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}
