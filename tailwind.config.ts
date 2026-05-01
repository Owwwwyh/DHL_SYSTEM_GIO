import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        dhl: { yellow: "#FFCC00", red: "#D40511" },
      },
    },
  },
  plugins: [],
};
export default config;
