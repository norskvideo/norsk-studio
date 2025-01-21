/** @type {import('tailwindcss').Config} */
const defaultTheme = require('@norskvideo/norsk-studio/tailwind-theme')
module.exports = {
  ...defaultTheme,
  content: ["src/**/*.{html,js,ejs,ts,tsx}"],
}
