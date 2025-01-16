/** @type {import('tailwindcss').Config} */
const defaultTheme = require('@norskvideo/norsk-studio/tailwind-theme')
module.exports = {
  ...defaultTheme,
  content: ["src/**/*.{html,js,ejs,ts,tsx}"],
  corePlugins: {
    // Preflight is already included by the core studio stylesheet
    preflight: false,
  },
  experimental: {
    // This removes the var(--tw-*) reset
    optimizeUniversalDefaults: true,
  },
}
