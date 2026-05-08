/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#0B1222",
          900: "#0F172A",
          800: "#111C33",
          700: "#172554",
        },
        emerald: {
          500: "#10B981"
        },
        slateInk: {
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155"
        }
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(16,185,129,0.25), 0 10px 30px rgba(0,0,0,0.35)"
      }
    },
  },
  plugins: [],
};

