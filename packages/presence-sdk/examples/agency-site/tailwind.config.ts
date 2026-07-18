import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './site/chrome/**/*.html',
    './site/components/**/*.{html,js,css}',
  ],
  theme: {
    extend: {
      colors: {
        presence: {
          primary: 'var(--presence-primary)',
          accent: 'var(--presence-accent)',
          bg: 'var(--presence-bg)',
          fg: 'var(--presence-fg)',
          muted: 'var(--presence-muted)',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
