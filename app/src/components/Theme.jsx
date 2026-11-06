"use client";
import { createContext, useContext } from "react";

/** The site has one light theme (see globals.css). Kept as a context so callers of useTheme keep working. */
const ThemeCtx = createContext({ theme: "light", toggle: () => {} });

export function useTheme() {
  return useContext(ThemeCtx);
}

export function ThemeProvider({ children }) {
  return <ThemeCtx.Provider value={{ theme: "light", toggle: () => {} }}>{children}</ThemeCtx.Provider>;
}

export function ThemeToggle() {
  return null;
}
