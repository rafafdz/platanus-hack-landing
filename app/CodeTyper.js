'use client'
import { useEffect, useState, useRef } from 'react'
import { codes } from './codes'
import TypingCanvas from './TypingCanvas'

export default function CodeTyper() {
  const [code, setCode] = useState('')
  const codeRef = useRef(null)

  useEffect(() => {
    const randomCode = codes[Math.floor(Math.random() * codes.length)]
    
    setCode(randomCode.code.replace(/\s+/g, ' ').trim())
  }, [])

  return (
    <div className="relative h-full">
      <pre 
        ref={codeRef} 
        className={`z-10 bg-transparent text-zinc-600 mix-blend-plus-lighter top-0 left-0 overflow-y-auto h-full smooth-scroll whitespace-pre-wrap`}
      >
        <TypingCanvas code={code} speed={0.3} />
      </pre>
      <div className="absolute bottom-0 left-0 right-0 h-[15%] bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none"></div>
    </div>
  )
}