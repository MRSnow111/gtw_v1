import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "rgba(220, 235, 230, 0.16)",
        input: "rgba(220, 235, 230, 0.12)",
        ring: "rgba(143, 184, 174, 0.35)",
        background: "#0A1412",
        foreground: "rgba(220, 235, 230, 0.80)",
        primary: {
          DEFAULT: "#8FB8AE",
          foreground: "#0A1412",
        },
        secondary: {
          DEFAULT: "rgba(143, 184, 174, 0.12)",
          foreground: "rgba(220, 235, 230, 0.80)",
        },
        destructive: {
          DEFAULT: "rgba(220, 80, 80, 0.8)",
          foreground: "rgba(220, 235, 230, 0.80)",
        },
        muted: {
          DEFAULT: "rgba(143, 184, 174, 0.08)",
          foreground: "rgba(220, 235, 230, 0.42)",
        },
        accent: {
          DEFAULT: "rgba(143, 184, 174, 0.13)",
          foreground: "rgba(220, 235, 230, 0.80)",
        },
        popover: {
          DEFAULT: "rgba(143, 184, 174, 0.07)",
          foreground: "rgba(220, 235, 230, 0.80)",
        },
        card: {
          DEFAULT: "rgba(143, 184, 174, 0.07)",
          foreground: "rgba(220, 235, 230, 0.80)",
        },
        // Midnight Fern palette
        midnight: "#0A1412",
        deepForest: "#17322E",
        emerald: "#27524B",
        forestSage: "#4D7B73",
        softMint: "#8FB8AE",
        paleMint: "#DCEBE6",
        success: "#75D6A8",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        full: "var(--radius-full)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-slow": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.7" },
        },
        "shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.6s ease-out forwards",
        "fade-in-slow": "fade-in-slow 1.2s ease-out forwards",
        "glow-pulse": "glow-pulse 4s ease-in-out infinite",
        "shimmer": "shimmer 2.5s ease-in-out infinite",
      },
      typography: {
        DEFAULT: {
          css: {
            color: "rgba(220, 235, 230, 0.7)",
            '--tw-prose-headings': 'rgba(220, 235, 230, 0.85)',
            '--tw-prose-body': 'rgba(220, 235, 230, 0.7)',
            '--tw-prose-bold': 'rgba(220, 235, 230, 0.85)',
            '--tw-prose-links': '#8FB8AE',
            '--tw-prose-code': '#8FB8AE',
            '--tw-prose-pre-bg': 'rgba(143, 184, 174, 0.08)',
            '--tw-prose-pre-code': 'rgba(220, 235, 230, 0.85)',
          },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
