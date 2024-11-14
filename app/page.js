'use client'
import React, { useEffect } from 'react'
import { useState } from 'react'
import Hero from './Hero'
import Description from './Description'
import Prize from './Prize'
import Features from './Features'
import Countdown from './Countdown'
import Location from './Location'
import Sponsors from './Sponsors'
import Footer from './Footer'
import { deadline } from './constants';

export default function Home() {
  const [hasLoggedMessage, setHasLoggedMessage] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || hasLoggedMessage) return;

    console.log('%chey, you look like a hacker. we have a cool hackathon for you. apply at https://platan.us/hack/apply/devtools', 'font-size: 30px; color: #FFEC40; font-weight: bold;');
    setHasLoggedMessage(true);
  }, [hasLoggedMessage]);

  return (
    <main className="relative">
      <Hero />
      <Description />
      <Prize />
      <Features />
      {deadline > new Date() && <Countdown />}
      <Location />
      <Sponsors />
      <Footer />
    </main>
  )
}
