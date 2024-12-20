import React, { useState, useEffect, useRef } from 'react';
import Padding from './Padding';
import TypewriterTitle from './TypewriterTitle';
import Tilt from './Tilt';

const Prize = () => {
  const [amount, setAmount] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const animationRef = useRef(null);
  const startRef = useRef(0);
  const containerRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const end = 3000;
    const duration = 3000;
    const startTime = performance.now();

    const easeOutQuad = (t) => t * (2 - t);

    const animate = (currentTime) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.max(0, Math.min(elapsedTime / duration, 1));
      const easedProgress = easeOutQuad(progress);

      startRef.current = easedProgress * end;
      setAmount(Math.floor(startRef.current));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationRef.current);
  }, [isVisible]);

  return (
    <section className="w-full min-h-screen flex flex-col items-center justify-center">
      <Padding>
        <div ref={containerRef}>
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
            <p className="text-lg md:text-xl text-center">
              en 
              <a href="https://fintual.cl/acciones/" className="hover:text-primary transition-colors" target="_blank" rel="noopener noreferrer"> fintual acciones</a>
              . además mentorías platanus + ✨
            </p>
          </div>
        </div>
      </Padding>
    </section>
  );
};

export default Prize;
