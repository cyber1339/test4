/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#09090d',
        panel: '#14141c',
        raised: '#1c1c28',
        edge: '#2a2a3a',
        arcane: '#4f8cff',
        frost: '#22d3ee',
        gold: '#f5c451',
        blood: '#ef4466',
        mute: '#8b8ba3',
      },
      fontFamily: {
        display: ['"Barlow Condensed"', 'Impact', 'system-ui', 'sans-serif'],
        body: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
