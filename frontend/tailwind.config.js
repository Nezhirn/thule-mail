/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Семантические цвета завязаны на CSS-переменные — темы переключаются
      // мгновенно сменой класса на <html> (light/dark), значения в theme.css.
      colors: {
        sidebar: "rgb(var(--c-sidebar) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        elevated: "rgb(var(--c-elevated) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        "accent-soft": "rgb(var(--c-accent-soft) / <alpha-value>)",
        content: "rgb(var(--c-text) / <alpha-value>)",
        muted: "rgb(var(--c-text-muted) / <alpha-value>)",
        faint: "rgb(var(--c-text-faint) / <alpha-value>)",
        separator: "rgb(var(--c-separator) / <alpha-value>)",
        hover: "rgb(var(--c-hover) / <alpha-value>)",
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "SF Pro Text",
          "Inter", "Segoe UI", "Roboto", "sans-serif",
        ],
      },
      borderRadius: { xl: "10px" },
    },
  },
  plugins: [],
};
