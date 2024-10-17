'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Tilt from 'react-parallax-tilt'
import TypewriterTitle from './TypewriterTitle'
import CodeTyper from './CodeTyper'
import Description from './Description'
import Features from './Features'
import Location from './Location'
import Sponsors from './Sponsors'
import Footer from './Footer'

export default function Home() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  const calculateTiltAngleX = () => {
    if (typeof window === "undefined") return 0;
    return (mousePosition.y / window.innerHeight || 1) * 30 - 15;
  }

  const calculateTiltAngleY = () => {
    if (typeof window === "undefined") return 0;
    return (mousePosition.x / window.innerWidth || 1) * 30 - 15;
  }

  return (
    <main className="relative font-source-code-pro">
      <div className="absolute inset-0 overflow-hidden w-full h-screen bg-gradient-to-b from-zinc-800 to-zinc-950">
        <div className="w-full h-full">
          <div className="relative h-full text-xs">
            <Tilt
              className="parallax-effect absolute top-[30px] left-1/4 lg:top-1/4 lg:left-1/2 transform -translate-y-1/2 -translate-x-1/2"
              tiltMaxAngleX={15}
              tiltMaxAngleY={15}
              perspective={1000}
              transitionSpeed={1500}
              scale={1.05}
              gyroscope={true}
              tiltAngleXManual={calculateTiltAngleX()}
              tiltAngleYManual={calculateTiltAngleY()}
            >
              <div className="relative size-[150px] lg:size-[450px]">
                <Image
                  src="/banana.svg"
                  alt="Banana Logo"
                  fill
                  className="opacity-100 z-10 bg-transparent"
                />
              </div>
            </Tilt>
            <CodeTyper />
          </div>
        </div>
      </div>
      <div className="relative z-10 flex h-screen" >
        <div className="flex flex-col justify-center items-start pl-10 md:pl-20 lg:pl-32">
          <h1 className="font-ubuntu-mono text-6xl md:text-7xl lg:text-8xl font-bold mb-4 relative z-10">platanus hack</h1>
          <TypewriterTitle text={'22-24 nov. santiago.'} className="text-2xl md:text-3xl relative z-10 mb-8" />
          <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <a href="https://platan.us/hack/apply" target="_blank" rel="noopener noreferrer" className="inline-block bg-primary hover:bg-secondary text-black font-bold py-3 px-6 rounded-lg text-xl transition duration-300 ease-in-out transform hover:scale-105">
              postular
            </a>
            <a href="https://platan.us/hack/sponsor-deck" target="_blank" rel="noopener noreferrer" className="bg-transparent hover:bg-zinc-800/30 backdrop-blur-sm text-white font-semibold py-3 px-6 border border-white hover:border-primary hover:text-primary rounded-lg text-xl transition duration-300 ease-in-out">
              quiero ser sponsor
            </a>
          </div>
        </div>
      </div>
      <Description />
      <Features />
      <Location />
      <Sponsors />
      <Footer />
    </main>
  )
}
