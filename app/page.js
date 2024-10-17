'use client'
import React, { useEffect } from 'react'
import { useState } from 'react'
import Image from 'next/image'
import Tilt from 'react-parallax-tilt'
import TypewriterTitle from './TypewriterTitle'
import CodeTyper from './CodeTyper'
import Description from './Description'
import Features from './Features'
import Countdown from './Countdown'
import Location from './Location'
import Sponsors from './Sponsors'
import Footer from './Footer'

export default function Home() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [hasLoggedMessage, setHasLoggedMessage] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || hasLoggedMessage) return;

    console.log('%chey, you look like a hacker. we have a cool hackathon for you. apply at https://platan.us/hack/apply/devtools', 'font-size: 30px; color: #FFEC40; font-weight: bold;');
    setHasLoggedMessage(true);
  }, [hasLoggedMessage]);

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
        <div className="relative h-full text-xs w-screen">
          <div className="size-[170px] lg:size-[450px] mr-12 lg:mr-0 absolute top-[60px] left-1/4 lg:left-1/2 lg:top-1/4 lg:ml-4">
            <Tilt
              className="parallax-effect size-full"
              tiltMaxAngleX={15}
              tiltMaxAngleY={15}
              perspective={1000}
              transitionSpeed={1500}
              scale={1.05}
              gyroscope={true}
              tiltAngleXManual={calculateTiltAngleX()}
              tiltAngleYManual={calculateTiltAngleY()}
            >
              <Image
                src="/banana.svg"
                alt="Banana Logo"
                fill
                className="opacity-100 z-10 bg-transparent"
              />
            </Tilt>
          </div>
          <CodeTyper />
        </div>
      </div>
      <div className="relative z-10 flex h-screen" >
        <div className="flex flex-col justify-center items-start pl-10 md:pl-20 lg:pl-32">
          <div className="h-[20%] lg:hidden">
          </div>
          <h1 className="font-ubuntu-mono text-6xl md:text-7xl lg:text-8xl font-bold mb-4 relative z-10">platanus hack</h1>
          <TypewriterTitle text={'22-24 nov. santiago.'} className="text-2xl md:text-3xl relative z-10 mb-8 h-8" />
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
      <Countdown />
      <Location />
      <Sponsors />
      <Footer />
    </main>
  )
}
