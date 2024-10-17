import React from 'react';
import Image from 'next/image';
import TypewriterTitle from './TypewriterTitle';
import Tilt from 'react-parallax-tilt';

const Sponsors = () => {
  const sponsorLogos = [
    { src: 'fintual-logo-white.png', size: 400, alt: 'Fintual logo', url: 'https://fintual.cl/' },
    { src: 'aws-logo-white.png', size: 200, alt: 'Amazon Web Services logo', url: 'https://aws.amazon.com/' }
  ];

  return (
    <section className="w-full max-w-7xl mx-auto px-4 py-16 min-h-screen flex flex-col items-center justify-center">
      <TypewriterTitle text="$ ls sponsors/*.svg" className="text-2xl md:text-5xl font-bold mb-12 text-center" />

      <div className="flex flex-wrap items-center justify-center gap-32 py-16">
        {sponsorLogos.map(({ src, size, alt, url }, index) => (
          <Tilt
            key={index}
            className="parallax-effect"
            tiltMaxAngleX={10}
            tiltMaxAngleY={10}
            perspective={800}
            transitionSpeed={1500}
            scale={1.05}
            gyroscope={true}
          >
            <a 
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-auto flex items-center justify-center transition-transform duration-300 hover:scale-110"
            >
              <Image
                src={`/sponsors/${src}`}
                alt={alt}
                height={size}
                width={size}
              />
            </a>
          </Tilt>
        ))}
      </div>
    </section>
  );
};

export default Sponsors;
