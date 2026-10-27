/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#070a12', 925: '#0a0e18', 900: '#0d121e', 850: '#121827', 800: '#172033' },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Chakra Petch"', '"Inter Variable"', 'sans-serif'],
      },
      keyframes: {
        viewIn: { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        sheetIn: { '0%': { opacity: 0, transform: 'translateY(24px) scale(.98)' }, '100%': { opacity: 1, transform: 'none' } },
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        flicker: { '0%,100%': { transform: 'scale(1) rotate(-2deg)' }, '50%': { transform: 'scale(1.08) rotate(2deg)' } },
        pulseDot: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
        expand: { '0%': { opacity: 0, transform: 'translateY(-4px)' }, '100%': { opacity: 1, transform: 'none' } },
      },
      animation: {
        view: 'viewIn .35s cubic-bezier(.2,.8,.2,1) backwards',
        sheet: 'sheetIn .3s cubic-bezier(.2,.8,.2,1) both',
        fade: 'fadeIn .2s ease-out both',
        flicker: 'flicker 1.6s ease-in-out infinite',
        pulsedot: 'pulseDot 2s ease-in-out infinite',
        expand: 'expand .25s ease-out backwards',
      },
      boxShadow: {
        'glow-em': '0 0 0 1px rgba(16,185,129,.25), 0 8px 32px -8px rgba(16,185,129,.45)',
        'glow-ro': '0 0 0 1px rgba(244,63,94,.25), 0 8px 32px -8px rgba(244,63,94,.4)',
      },
    },
  },
  plugins: [],
};
