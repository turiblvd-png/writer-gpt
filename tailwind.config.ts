import type { Config } from 'tailwindcss';

/**
 * Tokens mirror the writer-gpt.com dashboard: near-black navy canvas, a slightly
 * raised sidebar, and a blue→cyan accent used for the active nav item and CTAs.
 */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#070b14',
        surface: '#0b1220',
        'surface-2': '#111a2b',
        'surface-3': '#18243a',
        line: '#1e2b42',
        'line-soft': '#16213a',
        ink: '#e8eefc',
        'ink-2': '#93a4c4',
        'ink-3': '#5f7192',
        accent: '#1d9bf0',
        'accent-2': '#22d3ee',
        'accent-ink': '#04121f',
        ok: '#22c55e',
        warn: '#f59e0b',
        bad: '#ef4444',
        info: '#8b5cf6',
      },
      borderRadius: { xl: '0.75rem', '2xl': '1rem' },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { 'fade-up': 'fade-up .35s cubic-bezier(.2,.7,.3,1)' },
    },
  },
  plugins: [],
} satisfies Config;
