import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "bg-base": "#F8FAFC",
        "bg-card": "#FFFFFF",
        "border-base": "#E2E8F0",
        primary: "#F97316",
        "primary-light": "#FFF7ED",
        "primary-dark": "#EA580C",
        success: "#22C55E",
        "success-light": "#F0FDF4",
        danger: "#EF4444",
        "danger-light": "#FEF2F2",
        warning: "#F59E0B",
        "warning-light": "#FFFBEB",
        info: "#3B82F6",
        "info-light": "#EFF6FF",
        "text-base": "#1E293B",
        "text-muted": "#64748B",
        "text-subtle": "#94A3B8",
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "sans-serif"],
        sans: ["Plus Jakarta Sans", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        "card-hover": "0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
