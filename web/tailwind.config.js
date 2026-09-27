/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0E7A80",
        secondary: "#5C3C7A",
        accent: "#E07B39",
        success: "#2E7D32",
        page: "#F8FAFB",
        ink: "#1A1A2E",
        muted: "#6B7280",
        line: "#E5E7EB",
      },
      fontFamily: {
        sans: ["\"Plus Jakarta Sans\"", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};
