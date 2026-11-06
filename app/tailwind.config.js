/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
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
        primary: "rgb(var(--primary-rgb) / <alpha-value>)",
        sage: "rgb(var(--sage-rgb) / <alpha-value>)",
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        accentInk: "rgb(var(--accent-ink-rgb) / <alpha-value>)",
        accentSoft: "rgb(var(--accent-soft-rgb) / <alpha-value>)",
        good: "rgb(var(--good-rgb) / <alpha-value>)",
        bad: "rgb(var(--bad-rgb) / <alpha-value>)",
        warn: "rgb(var(--warn-rgb) / <alpha-value>)",
        // shadcn token names (components/ui/*), mapped onto the site palette
        background: "rgb(var(--paper-rgb) / <alpha-value>)",
        foreground: "rgb(var(--ink-rgb) / <alpha-value>)",
        border: "rgb(var(--line-rgb) / <alpha-value>)",
        secondary: "rgb(var(--sunk-rgb) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-rgb) / <alpha-value>)",
        "accent-foreground": "rgb(var(--accent-ink-rgb) / <alpha-value>)",
        "card-foreground": "rgb(var(--ink-rgb) / <alpha-value>)",
      },
      // Tailwind 4 sizes used by shadcn components
      boxShadow: { xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)" },
      borderRadius: { xs: "2px" },
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
