import type { Config } from 'tailwindcss';

/** Puzzle-box palette: warm table, deep ink, tomato and mustard accents. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        table: '#F6F0E4',
        card: '#FFFDF8',
        line: '#E3D8C6',
        ink: { DEFAULT: '#1F2A44', soft: '#3B4661' },
        muted: '#6F7486',
        tomato: { DEFAULT: '#E4572E', dark: '#C5461F', soft: '#FBE3DA' },
        mustard: { DEFAULT: '#F3A712', soft: '#FDF0D2' },
        teal: { DEFAULT: '#2A9D8F', soft: '#DDF1EE' },
        plum: { DEFAULT: '#6D597A', soft: '#ECE6F0' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        body: ['Figtree', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(31,42,68,0.06), 0 8px 24px -12px rgba(31,42,68,0.25)',
        lift: '0 2px 0 #1F2A44',
        pop: '0 3px 0 #1F2A44',
      },
      borderRadius: { xl2: '1.25rem' },
      keyframes: {
        rise: { from: { transform: 'translateY(6px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(228,87,46,0.45)' }, '100%': { boxShadow: '0 0 0 14px rgba(228,87,46,0)' } },
      },
      animation: {
        rise: 'rise 0.35s ease-out both',
        pulseRing: 'pulseRing 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
