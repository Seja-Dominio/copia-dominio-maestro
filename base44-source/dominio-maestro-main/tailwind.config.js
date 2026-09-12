/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        inter: ['var(--font-inter)'],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          active: "hsl(var(--sidebar-active))",
          hover: "hsl(var(--sidebar-hover))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-in": "slideIn 0.25s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
  safelist: [
    "bg-amber-100", "text-amber-700", "bg-blue-100", "text-blue-700",
    "bg-green-100", "text-green-700", "bg-red-100", "text-red-700",
    "bg-purple-100", "text-purple-700", "bg-orange-100", "text-orange-700",
    "bg-cyan-100", "text-cyan-700", "bg-pink-100", "text-pink-700",
    "bg-violet-100", "text-violet-700", "bg-indigo-100", "text-indigo-700",
    "bg-teal-100", "text-teal-700", "bg-emerald-100", "text-emerald-700",
    "bg-slate-100", "text-slate-700",
    "border-violet-200", "border-indigo-200", "border-teal-200", "border-emerald-200",
    "border-amber-200", "border-blue-200", "border-cyan-200", "border-green-200",
    "border-orange-200", "border-pink-200", "border-purple-200", "border-gray-200",
    "border-red-200", "border-slate-200",
    "border-amber-300", "border-blue-300", "border-green-300", "border-red-300",
    "border-purple-300",
    "bg-blue-100", "text-blue-700", "border-blue-300", "text-blue-600",
    "bg-rose-100", "text-rose-700", "border-rose-200", "bg-rose-500",
    "bg-sky-100", "text-sky-700", "border-sky-200", "bg-sky-500",
    "bg-fuchsia-100", "text-fuchsia-700", "border-fuchsia-200", "bg-fuchsia-500",
    "bg-lime-100", "text-lime-700", "border-lime-200", "bg-lime-500",
    "bg-yellow-100", "text-yellow-700", "border-yellow-200", "bg-yellow-500",
  ],
}