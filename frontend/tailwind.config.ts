import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        border: 'var(--border)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        primary: 'var(--primary)',
        primaryContrast: 'var(--primary-contrast)',
        secondary: 'var(--secondary)',
        accent: 'var(--accent)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
      },
      borderRadius: {
        lg: 'var(--radius)',
      },
      boxShadow: {
        glass: 'var(--glass-shadow)',
      },
      backdropBlur: {
        glass: 'var(--glass-blur)',
      },
    },
  },
  plugins: [],
} satisfies Config

