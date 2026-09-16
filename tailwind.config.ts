import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0B1220",
          900: "#101A2E",
          800: "#16223B",
          700: "#1E2E4D",
          600: "#2A3F63",
        },
        slate: {
          50: "#F6F8FB",
          100: "#EEF1F6",
          200: "#DFE5EE",
        },
        brand: {
          500: "#2F6FED",
          600: "#2557C7",
          700: "#1E45A0",
        },
        risk: {
          low: "#2E9E6D",
          mid: "#D69A1F",
          high: "#D9622B",
          critical: "#C13C3C",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jbmono)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(16, 26, 46, 0.06), 0 1px 1px 0 rgba(16, 26, 46, 0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
