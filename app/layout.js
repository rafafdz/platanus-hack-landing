import { Ubuntu_Mono, Source_Code_Pro } from 'next/font/google'
import "./globals.css"

const ubuntuMono = Ubuntu_Mono({ 
  weight: ['700'],
  subsets: ['latin'],
  variable: '--font-ubuntu-mono',
  display: 'swap',
})

const sourceCodePro = Source_Code_Pro({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-source-code-pro',
  display: 'swap',
})

export const metadata = {
  title: 'Platanus Hack',
  description: 'Únete a nuestro emocionante evento de hackathon',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`dark ${ubuntuMono.variable} ${sourceCodePro.variable}`}>
      <body className="font-source-code-pro bg-zinc-950 text-white">{children}</body>
    </html>
  )
}
