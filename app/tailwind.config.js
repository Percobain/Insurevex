/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: "rgb(var(--paper-rgb) / <alpha-value>)",
        card: "rgb(var(--card-rgb) / <alpha-value>)",
        sunk: "rgb(var(--sunk-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        ink2: "rgb(var(--ink2-rgb) / <alpha-value>)",
        muted: "rgb(var(--muted-rgb) / <alpha-value>)",
        line: "rgb(var(--line-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        accentInk: "rgb(var(--accent-ink-rgb) / <alpha-value>)",
        accentSoft: "rgb(var(--accent-soft-rgb) / <alpha-value>)",
        good: "rgb(var(--good-rgb) / <alpha-value>)",
        bad: "rgb(var(--bad-rgb) / <alpha-value>)",
        warn: "rgb(var(--warn-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "ui-serif", "Georgia"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      maxWidth: { page: "1180px" },
    },
  },
  plugins: [],
};
