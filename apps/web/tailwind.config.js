/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base: {
          950: "#08090c",
          900: "#0d0f14",
          850: "#11141b",
          800: "#161a23",
          700: "#1f2430",
          600: "#2a3040",
          500: "#3a4256",
        },
        accent: {
          400: "#5b8cff",
          500: "#3d6fff",
          600: "#2d55e0",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
