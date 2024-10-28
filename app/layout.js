import { JetBrains_Mono, Oxanium} from 'next/font/google'
import { PostHogProvider } from './PostHogProvider'
import "./globals.css"

const oxanium = Oxanium({ 
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-oxanium',
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({ 
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})


export const metadata = {
  title: 'platanus hack',
  description: 'Los mejores techies de Chile construyendo soluciones con impacto. De cero a producto en 36 horas.',
}

export default function RootLayout({ children }) {
  return (
    <PostHogProvider>
      <html lang="es" className={`dark ${jetBrainsMono.variable} ${oxanium.variable}`}>
        <body className="font-jetbrains-mono bg-zinc-950 text-white">{children}</body>
      </html>
    </PostHogProvider>
  )
}
