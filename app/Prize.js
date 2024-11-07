import React, { useState, useEffect, useRef } from 'react';
import Padding from './Padding';
import TypewriterTitle from './TypewriterTitle';
import Tilt from './Tilt';

const Prize = () => {
  const [amount, setAmount] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const animationRef = useRef(null);
  const startRef = useRef(0);

  useEffect(() => {
    const end = 3000;
    const duration = 3000; // 2 seconds
    const startTime = performance.now();

    const easeOutQuad = (t) => t * (2 - t);

    const animate = (currentTime) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.max(0, Math.min(elapsedTime / duration, 1)); // Ensure progress is between 0 and 1
      const easedProgress = easeOutQuad(progress);

      startRef.current = easedProgress * end;
      setAmount(Math.floor(startRef.current));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  return (
    <section className="w-full min-h-screen flex flex-col items-center justify-center">
      <Padding>
        <TypewriterTitle text="$$$ more prizes.csv" className="font-oxanium text-2xl md:text-5xl font-bold mb-12 text-center" />

        <div className="flex flex-col items-center gap-12">
          <Tilt
            className="parallax-effect"
            tiltMaxAngleX={5}
            tiltMaxAngleY={5}
            perspective={1000}
            transitionSpeed={1500}
            scale={1.02}
            gyroscope={true}
          >
            <div
              className={`text-6xl md:text-[11rem] font-bold transition-colors duration-300 ${isHovered ? 'text-primary' : ''}`}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              ${amount}
              <span className="md:text-[8rem] text-3xl"> USD</span>
            </div>
          </Tilt>
          <p className="text-lg md:text-xl">
            en 
            <a href="https://fintual.cl/acciones/" className="hover:text-primary transition-colors" target="_blank" rel="noopener noreferrer"> fintual acciones</a>
          </p>
        </div>
      </Padding>
    </section>
  );
};

export default Prize;
