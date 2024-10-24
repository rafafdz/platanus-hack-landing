import { Ubuntu_Mono, Source_Code_Pro } from 'next/font/google'
import { PostHogProvider } from './PostHogProvider'
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
  title: 'platanus hack',
  description: 'Los mejores techies de Chile construyendo soluciones con impacto. De cero a producto en 36 horas.',
}

export default function RootLayout({ children }) {
  return (
    <PostHogProvider>
      <html lang="es" className={`dark ${ubuntuMono.variable} ${sourceCodePro.variable}`}>
        <body className="font-source-code-pro bg-zinc-950 text-white">{children}</body>
      </html>
    </PostHogProvider>
  )
}
