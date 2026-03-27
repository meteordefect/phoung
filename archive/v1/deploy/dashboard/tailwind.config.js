/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds — resolved from CSS custom properties
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        card: 'rgb(var(--color-card) / <alpha-value>)',
        subtle: 'rgb(var(--color-subtle) / <alpha-value>)',

        // Text
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
        tertiary: 'rgb(var(--color-tertiary) / <alpha-value>)',

        // Accents
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          dark: 'rgb(var(--color-accent-dark) / <alpha-value>)',
          light: 'rgb(var(--color-accent-light) / <alpha-value>)',
        },

        // Status
        working: 'rgb(var(--color-working) / <alpha-value>)',
        review: 'rgb(var(--color-review) / <alpha-value>)',
        done: 'rgb(var(--color-done) / <alpha-value>)',
        waiting: 'rgb(var(--color-waiting) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger: 'rgb(var(--color-danger) / <alpha-value>)',

        // UI Chrome
        border: 'rgb(var(--color-border) / <alpha-value>)',
        ring: 'rgb(var(--color-ring) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
      },
      fontSize: {
        'xs':   ['clamp(0.7rem, 0.5vw + 0.5rem, 0.75rem)',   { lineHeight: '1rem' }],
        'sm':   ['clamp(0.8rem, 0.5vw + 0.6rem, 0.875rem)',  { lineHeight: '1.25rem' }],
        'base': ['clamp(0.9rem, 0.5vw + 0.7rem, 1rem)',      { lineHeight: '1.5rem' }],
        'lg':   ['clamp(1rem, 0.5vw + 0.8rem, 1.125rem)',    { lineHeight: '1.75rem' }],
        'xl':   ['clamp(1.1rem, 0.6vw + 0.9rem, 1.25rem)',   { lineHeight: '1.75rem' }],
        '2xl':  ['clamp(1.3rem, 0.8vw + 1rem, 1.5rem)',      { lineHeight: '2rem' }],
        '3xl':  ['clamp(1.6rem, 1vw + 1.2rem, 1.875rem)',    { lineHeight: '2.25rem' }],
        '4xl':  ['clamp(2rem, 1.5vw + 1.4rem, 2.25rem)',     { lineHeight: '2.5rem' }],
        '5xl':  ['clamp(2.5rem, 2vw + 1.6rem, 3rem)',        { lineHeight: '1' }],
        '6xl':  ['clamp(3rem, 2.5vw + 2rem, 3.75rem)',       { lineHeight: '1' }],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
        'card-hover': '0 4px 6px rgba(0,0,0,0.15), 0 8px 20px rgba(0,0,0,0.12)',
      },
      borderRadius: {
        'sm': 'calc(var(--radius) - 4px)',
        'md': 'calc(var(--radius) - 2px)',
        'lg': 'var(--radius)',
        'xl': 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
      },
    },
  },
  plugins: [],
}
