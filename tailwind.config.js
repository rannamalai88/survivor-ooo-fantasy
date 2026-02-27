/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Core brand
        survivor: {
          flame: '#FF6B35',
          'flame-dark': '#E55A2B',
          gold: '#FFD700',
          dark: '#0d0d15',
          'dark-card': '#14141f',
          'dark-border': 'rgba(255,255,255,0.06)',
        },
        // Tribe colors
        tribe: {
          vatu: '#9B59B6',
          kalo: '#1ABC9C',
          cila: '#E67E22',
        },
        // Status colors
        status: {
          active: '#1ABC9C',
          drowned: '#E74C3C',
          burnt: '#95a5a6',
          finished: '#FFD54F',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
