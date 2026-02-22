/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#020617",
        surface: "#080c1d",    // Deeper, more neutral navy
        border: "#1e293b",
        primary: "#f1f5f9",
        accent: "#22d3ee",     // Bio-cyan
        chitin: "#fb7185",     // Soft rose
        muted: "#475569",
        glass: "rgba(15, 23, 42, 0.4)",
        "glass-edge": "rgba(255, 255, 255, 0.08)",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"], // More professional sans
        display: ["Space Grotesk", "sans-serif"], // High-tech display
      },
      boxShadow: {
        'abyss': '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        'biolume': '0 0 20px rgba(34, 211, 238, 0.2)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'drift': 'drift 10s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        drift: {
          '0%, 100%': { transform: 'translateX(0) rotate(0deg)' },
          '50%': { transform: 'translateX(10px) rotate(1deg)' },
        }
      }
    },
  },
  plugins: [],
}
