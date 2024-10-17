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
        'ubuntu-mono': ['var(--font-ubuntu-mono)'],
        'source-code-pro': ['var(--font-source-code-pro)'],
      },
      colors: {
        primary: '#FFEC40',
        secondary: '#F9BC12',
      },
    },
  },
  plugins: [],
};
