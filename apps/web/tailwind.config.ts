import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        base: '#0B0E14',
        elevated: '#11151E',
        overlay: '#161B26',
        line: '#1E2530',
        brand: '#7C5CFF',
        'brand-hover': '#8E72FF',
        accent: '#00D9C0',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
