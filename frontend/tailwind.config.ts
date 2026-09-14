import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // The hold of a reefer at night: near-black navy with a cold cast.
        frost: {
          950: "#050e14",
          900: "#08161f",
          850: "#0c1f2a",
          800: "#112836",
          line: "#1b3a4a",
          mute: "#7a98a6",
        },
        ice: "#e6f2f6",
        // One temperature ramp carries all meaning: cool = holding,
        // warm = judgment pending, hot = breach or failure. Payout green is
        // the only colour outside it.
        thermal: { cool: "#5cc8e4", warm: "#f0b65a", hot: "#ff6a55" },
        paid: "#48d19c",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
