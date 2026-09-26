import type { Config } from 'tailwindcss';

/**
 * Puzzle-box palette: kraft cardboard for menus, a printed cream lid for panels,
 * green felt for the table you actually solve on. Ink, tomato and mustard are the "print" colours.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kraft: { DEFAULT: '#E6D5B5', dark: '#D3BD94', deep: '#B89C6C' },
        paper: '#FFFAF0',
        table: '#F4ECDC',
        card: '#FFFAF0',
        line: '#E0D2B8',
        ink: { DEFAULT: '#1F2A44', soft: '#3B4661' },
        muted: '#6E6656',
        felt: { DEFAULT: '#245A4C', deep: '#1A443A', light: '#2F6D5D' },
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
        card: '0 1px 0 rgba(31,42,68,0.08), 0 12px 28px -16px rgba(31,42,68,0.5)',
        lift: '0 2px 0 #1F2A44',
        pop: '0 3px 0 #1F2A44',
        hard: '3px 3px 0 #1F2A44',
        lid: '0 2px 0 #B89C6C, 0 18px 40px -20px rgba(31,42,68,0.55)',
      },
      borderRadius: { xl2: '1.25rem' },
      keyframes: {
        rise: { from: { transform: 'translateY(6px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        pulseRing: { '0%': { boxShadow: '0 0 0 0 rgba(228,87,46,0.45)' }, '100%': { boxShadow: '0 0 0 14px rgba(228,87,46,0)' } },
        bob: { '0%, 100%': { transform: 'translate(0, 0) rotate(-4deg)' }, '50%': { transform: 'translate(2px, -7px) rotate(-1deg)' } },
        wobble: { '0%, 100%': { transform: 'rotate(-2deg)' }, '50%': { transform: 'rotate(2deg)' } },
      },
      animation: {
        rise: 'rise 0.35s ease-out both',
        pulseRing: 'pulseRing 1.6s ease-out infinite',
        bob: 'bob 3.2s ease-in-out infinite',
        wobble: 'wobble 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
