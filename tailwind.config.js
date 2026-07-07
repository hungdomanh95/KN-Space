/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: {
      sm: '480px',
      md: '640px',
      lg: '980px',
    },
    extend: {
      keyframes: {
        fadeInPop: {
          from: { opacity: '0', transform: 'translateY(4px) scale(.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        newestPulse: {
          '0%, 100%': { background: 'rgba(var(--accent-rgb),.10)' },
          '50%': { background: 'rgba(var(--accent-rgb),.22)' },
        },
        homeEnterBounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(4px)' },
        },
        overlayFadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        modalPopIn: {
          from: { opacity: '0', transform: 'translateY(8px) scale(.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        fadeInPop: 'fadeInPop .22s var(--ease-standard)',
        newestPulse: 'newestPulse 2s ease-in-out infinite',
        homeEnterBounce: 'homeEnterBounce 1.6s ease-in-out infinite',
        overlayFadeIn: 'overlayFadeIn .18s var(--ease-standard)',
        modalPopIn: 'modalPopIn .22s var(--ease-standard)',
      },
    },
  },
  plugins: [],
};
