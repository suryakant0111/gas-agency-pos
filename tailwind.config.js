/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          main: '#0f1923',
          panel: '#16202c',
          card: '#1c2b3a',
          surface: '#243447',
          input: '#1e2d3d',
          border: '#2a3f54',
        },
        accent: {
          gold: '#e8a838',
          green: '#34d399',
          red: '#f87171',
          blue: '#60a5fa',
          purple: '#a78bfa',
          cyan: '#22d3ee',
        }
      },
      fontFamily: {
        mono: ['Consolas', 'Monaco', 'Courier New', 'monospace'],
      }
    }
  },
  plugins: []
}
