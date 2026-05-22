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
        // Brand
        primary: "oklch(0.70 0.20 47)",
        "primary-hover": "oklch(0.63 0.21 47)",
        "primary-light": "oklch(0.97 0.02 47)",
        "primary-dark": "oklch(0.58 0.22 47)",
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
glow: "0 0 20px oklch(0.70 0.20 47 / 0.25)",
        "glow-lg": "0 0 40px oklch(0.70 0.20 47 / 0.30)",
        "glow-sm": "0 0 12px oklch(0.70 0.20 47 / 0.20)",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInLeft: {
          "0%": { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
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
