import type { Config } from 'tailwindcss';

/**
 * Colours are CSS variables (see globals.css) so the light/dark toggle swaps
 * every surface at once. Each is an "r g b" triple, which keeps Tailwind's
 * opacity modifiers (bg-accent/10) working.
 */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'canvas': 'rgb(var(--c-canvas) / <alpha-value>)',
        'surface': 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--c-surface-3) / <alpha-value>)',
        'line': 'rgb(var(--c-line) / <alpha-value>)',
        'line-soft': 'rgb(var(--c-line-soft) / <alpha-value>)',
        'ink': 'rgb(var(--c-ink) / <alpha-value>)',
        'ink-2': 'rgb(var(--c-ink-2) / <alpha-value>)',
        'ink-3': 'rgb(var(--c-ink-3) / <alpha-value>)',
        'accent': 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-2': 'rgb(var(--c-accent-2) / <alpha-value>)',
        'accent-ink': 'rgb(var(--c-accent-ink) / <alpha-value>)',
        'ok': 'rgb(var(--c-ok) / <alpha-value>)',
        'warn': 'rgb(var(--c-warn) / <alpha-value>)',
        'bad': 'rgb(var(--c-bad) / <alpha-value>)',
        'info': 'rgb(var(--c-info) / <alpha-value>)',
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
