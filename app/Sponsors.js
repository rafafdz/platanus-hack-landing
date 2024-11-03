import React from 'react';
import Image from 'next/image';
import TypewriterTitle from './TypewriterTitle';
import Tilt from './Tilt';

const Sponsors = () => {
  const sponsorLogosMain = [
    { src: 'fintual-logo-white.png', size: 400, alt: 'Fintual logo', url: 'https://fintual.cl/' },
    { src: 'aws-logo-white.png', size: 200, alt: 'Amazon Web Services logo', url: 'https://aws.amazon.com/' }
  ];
  
  const sponsorLogosSecondary = [
    { src: 'buk-logo-white.png', size: 170, alt: 'Buk logo', url: 'https://buk.cl/' },
  ];
  
  const sponsorLogosTertiary = [
    { src: 'shinkansen-logo-white.svg', size: 205, alt: 'Shinkansen logo', url: 'https://shinkansen.finance/' },
    { src: 'pullpo-logo-white.svg', size: 125, alt: 'Pullpo logo', url: 'https://pullpo.io/' },
    { src: 'oragus-logo-white.svg', size: 125, alt: 'Oragus logo', url: 'https://oragus.com/' },
  ];

  const logos = [sponsorLogosMain, sponsorLogosSecondary, sponsorLogosTertiary];
  
  return (
    <section className="w-full max-w-7xl mx-auto px-4 py-16 min-h-screen flex flex-col items-center justify-center">
      <TypewriterTitle text="$ ls sponsors/*.svg" className="font-oxanium text-2xl md:text-5xl font-bold mb-12 text-center" />

      <div className="flex flex-col gap-16 py-16 lg:gap-28 lg:py-28">
        {logos.map((sponsorLogos, index) => (
          <div className="flex flex-col lg:flex-row flex-wrap items-center justify-center gap-12 lg:gap-32" key={index}>
          {sponsorLogos.map(({ src, size, alt, url }, sponsorIndex) => (
            <Tilt
              key={sponsorIndex}
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
        ))}
      </div>
    </section>
  );
};

export default Sponsors;
