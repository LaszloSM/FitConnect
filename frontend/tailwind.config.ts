import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand — Volt
        primary: "oklch(0.78 0.19 128)",
        "primary-hover": "oklch(0.72 0.20 128)",
        "primary-light": "oklch(0.96 0.05 128)",
        "primary-dark": "oklch(0.66 0.20 128)",
        "primary-foreground": "var(--color-primary-contrast)",
        // Status
        success: "#22C55E",
        "success-light": "#F0FDF4",
        danger: "#EF4444",
        "danger-light": "#FEF2F2",
        warning: "#F59E0B",
        "warning-light": "#FFFBEB",
        info: "#3B82F6",
        "info-light": "#EFF6FF",
        // Semantic (light mode defaults — dark mode overrides via CSS vars)
        "bg-base": "var(--bg-base)",
        "bg-card": "var(--bg-card)",
        "bg-sidebar": "var(--bg-sidebar)",
        "border-base": "var(--border-base)",
        "text-base": "var(--text-base)",
        "text-muted": "var(--text-muted)",
        "text-subtle": "var(--text-subtle)",
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "sans-serif"],
        sans: ["Plus Jakarta Sans", "sans-serif"],
        mono: ["DM Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        "card-hover": "0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
        glow: "0 0 20px oklch(0.78 0.19 128 / 0.25)",
        "glow-lg": "0 0 40px oklch(0.78 0.19 128 / 0.30)",
        "glow-sm": "0 0 12px oklch(0.78 0.19 128 / 0.20)",
      },
      animation: {
        "fade-in-up": "fadeInUp 0.35s cubic-bezier(0.16,1,0.3,1) both",
        "slide-in-left": "slideInLeft 0.3s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scaleIn 0.25s cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
