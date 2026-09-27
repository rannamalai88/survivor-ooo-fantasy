/** @type {import('tailwindcss').Config} */
// Colours map to the CSS variables in src/styles/globals.css, so every class
// follows the active light/dark theme and supports alpha (e.g. bg-accent/10).
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        raised: token('raised'),
        ink: token('ink'),
        muted: token('muted'),
        faint: token('faint'),
        line: token('line'),
        accent: token('accent'),
        'accent-fill': token('accent-fill'),
        'on-accent': token('on-accent'),
        positive: token('positive'),
        negative: token('negative'),
        warn: token('warn'),
        savu: token('savu'),
        'savu-on': token('savu-on'),
        toka: token('toka'),
        'toka-on': token('toka-on'),
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
      },
    },
  },
  plugins: [],
};
