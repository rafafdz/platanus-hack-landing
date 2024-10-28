/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'jetbrains-mono': ['var(--font-jetbrains-mono)'],
        'oxanium': ['var(--font-oxanium)'],
      },
      colors: {
        primary: '#FFEC40',
        secondary: '#F9BC12',
      },
    },
  },
  plugins: [],
};
