'use client'
import React, { useEffect } from 'react'
import { useState } from 'react'
import CodeTyper from './CodeTyper'
import Description from './Description'
import Features from './Features'
import Countdown from './Countdown'
import Location from './Location'
import Sponsors from './Sponsors'
import Footer from './Footer'

export default function Home() {
  const [hasLoggedMessage, setHasLoggedMessage] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || hasLoggedMessage) return;

    console.log('%chey, you look like a hacker. we have a cool hackathon for you. apply at https://platan.us/hack/apply/devtools', 'font-size: 30px; color: #FFEC40; font-weight: bold;');
    setHasLoggedMessage(true);
  }, [hasLoggedMessage]);

  return (
    <main className="relative">
      <div className="absolute inset-0 overflow-hidden w-full h-screen bg-gradient-to-b from-zinc-800 to-zinc-950">
        <div className="relative h-full text-xs w-screen">
          <CodeTyper />
        </div>
      </div>
      <div className="relative z-10 flex h-screen w-full" >
        <div className="flex flex-col justify-center items-start w-full">
          <div className="flex flex-col md:flex-row w-full justify-center gap-3">
            <h1 className="font-oxanium text-7xl md:text-9xl font-medium relative z-10 text-center">platanus hack</h1>
            <div className="flex flex-col text-center md:text-left justify-center text-lg md:text-3xl md:mt-4">
              <p>22-24.nov</p>
              <p>santiago</p>
            </div>
          </div>
          <div className="px-12 md:px-0 flex flex-col sm:flex-row gap-4 mt-8 justify-center w-full">
            <a href="https://platan.us/hack/apply" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center">
              <button className="w-full md:w-auto bg-primary hover:bg-secondary text-black font-bold py-3 px-8 transition duration-300 ease-in-out rounded-full">
                postular
              </button>
            </a>
            <a href="https://platan.us/hack/apply" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center">
              <button className="w-full md:w-auto text-white border-white hover:text-primary hover:border-primary font-bold py-3 px-8 transition-all duration-300 ease-in-out rounded-full border backdrop-blur-sm">
                quiero ser sponsor
              </button>
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
