// Colours follow Apple's system colours and switch with light/dark mode: every grey and accent shade is a CSS
// variable (set in index.css / below), so the pages keep their Tailwind classes and still adapt.
import defaults from 'tailwindcss/colors';

const channels = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
// Greys: iOS grouped backgrounds and labels (light) and their dark counterparts.
const GREY = {
  light: { 50: '#f9f9fb', 100: '#f2f2f7', 200: '#e5e5ea', 300: '#d1d1d6', 400: '#aeaeb2', 500: '#8e8e93', 600: '#636366', 700: '#48484a', 800: '#3a3a3c', 900: '#1c1c1e', 950: '#0b0b0c' },
  dark: { 50: '#2c2c2e', 100: '#000000', 200: '#38383a', 300: '#48484a', 400: '#636366', 500: '#8e8e93', 600: '#aeaeb2', 700: '#c7c7cc', 800: '#e5e5ea', 900: '#f2f2f7', 950: '#ffffff' },
};
// Accents: light shades become dark tinted surfaces and dark shades become light text in dark mode.
const ACCENTS = ['red', 'amber', 'emerald', 'green', 'blue', 'sky', 'orange', 'indigo', 'violet', 'pink', 'yellow', 'teal', 'purple', 'rose'];
const MIRROR = { 50: '950', 100: '900', 200: '800', 300: '600', 400: '400', 500: '500', 600: '500', 700: '300', 800: '200', 900: '100', 950: '50' };
// Apple's tint (systemBlue).
const TINT = { light: '#007aff', dark: '#0a84ff' };

const vars = (mode) => {
  const out = { '--c-tint': channels(TINT[mode]), '--c-cell': channels(mode === 'light' ? '#ffffff' : '#1c1c1e') };
  for (const s of SHADES) out[`--c-slate-${s}`] = channels(GREY[mode][s]);
  for (const f of ACCENTS) for (const s of SHADES) out[`--c-${f}-${s}`] = channels(defaults[f][mode === 'light' ? s : MIRROR[s]]);
  return out;
};

const palette = (name) => Object.fromEntries(SHADES.map((s) => [s, v(`${name}-${s}`)]));

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        zs: { orange: '#f97316', blue: v('tint') },
        slate: palette('slate'),
        ...Object.fromEntries(ACCENTS.map((f) => [f, palette(f)])),
      },
      // A white surface is a cell (dark grey in dark mode); white text and borders stay white.
      backgroundColor: { white: v('cell') },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Helvetica Neue"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '14px', lg: '10px', md: '8px' },
    },
  },
  plugins: [
    ({ addBase }) => {
      const dark = vars('dark');
      addBase({
        // Light everywhere by default and on paper (documents, print); dark when the device asks for it.
        ':root, .paper': { ...vars('light'), colorScheme: 'light' },
        '@media screen and (prefers-color-scheme: dark)': {
          ':root:not([data-theme="light"])': { ...dark, colorScheme: 'dark' },
        },
        ':root[data-theme="dark"]': { ...dark, colorScheme: 'dark' },
        '@media print': { ':root': { ...vars('light'), colorScheme: 'light' } },
      });
    },
  ],
};
