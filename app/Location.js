import React, { useState } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import Tilt from 'react-parallax-tilt';
import { FaWaze, FaPlay, FaStop, FaMapMarkerAlt } from 'react-icons/fa';
import { SiGooglemaps } from 'react-icons/si';
import TypewriterTitle from './TypewriterTitle';

const DynamicMap = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => <p>Loading map...</p>
});

const Location = () => {
  const position = [-33.43586850387162, -70.6302271011865]
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section className="min-h-screen flex flex-col items-center justify-center p-4">
      <TypewriterTitle text="$ curl ipinfo.io/geo" className="text-2xl md:text-5xl font-bold mb-12 text-center" />
      
      <Tilt
        className="parallax-effect w-full max-w-xl"
        tiltMaxAngleX={5}
        tiltMaxAngleY={5}
        perspective={1000}
        transitionSpeed={1500}
        scale={1.02}
        gyroscope={true}
      >
        <div 
          className="border border-zinc-400 rounded-lg overflow-hidden mb-8 transition-all duration-300 hover:border-primary"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="flex flex-col md:flex-row">
            <div className={`md:w-1/3 relative h-64 md:h-auto transition-all duration-300 ${isHovered ? '' : 'grayscale'}`}>
              <Image
                src="/oficina-fintual-resize.jpg"
                alt="Event Location"
                fill
              />
            </div>
            <div className="md:w-2/3 p-6 flex flex-col justify-between bg-transparent">
              <div>
                <h2 className={`text-2xl font-bold mb-2 ${isHovered ? 'text-primary' : 'text-zinc-300'}`}>platanus hack</h2>
              </div>
              <div className="space-y-2 font-mono">
                <div className={`flex items-center ${isHovered ? 'text-primary' : 'text-zinc-300'}`}>
                  <FaPlay className="mr-2" />
                  <span>2024-11-22T18:45:00-03:00</span>
                </div>
                <div className={`flex items-center ${isHovered ? 'text-primary' : 'text-zinc-300'}`}>
                  <FaStop className="mr-2" />
                  <span>2024-11-24T17:00:00-03:00</span>
                </div>
                <div className={`flex items-center ${isHovered ? 'text-primary' : 'text-zinc-300'}`}>
                  <FaMapMarkerAlt className="mr-2" />
                  <span>fintual hq, providencia 229 🇨🇱</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Tilt>

      <Tilt
        className="parallax-effect max-w-4xl w-full"
        tiltMaxAngleX={5}
        tiltMaxAngleY={5}
        perspective={1000}
        transitionSpeed={1500}
        scale={1.05}
        gyroscope={true}
      >
        <div className="rounded-lg shadow-2xl overflow-hidden">
          <div className="h-96 relative">
            <DynamicMap position={position} />
            <div className="absolute bottom-4 left-4 flex space-x-2 z-30">
              <a
                href="https://www.google.com/maps/search/?api=1&query=Providencia+229,+Santiago,+Chile"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full shadow-md hover:bg-zinc-700 transition duration-300 bg-zinc-950"
              >
                <SiGooglemaps className="w-6 h-6 text-primary" />
              </a>
              <a
                href="https://www.waze.com/ul?ll=-33.4267,-70.6167&navigate=yes"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-full shadow-md hover:bg-zinc-700 transition duration-300 bg-zinc-950"
              >
                <FaWaze className="w-6 h-6 text-primary" />
              </a>
            </div>
          </div>
        </div>
      </Tilt>
    </section>
  );
};

export default Location;
