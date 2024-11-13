import React from 'react';
import Image from 'next/image';
import TypewriterTitle from './TypewriterTitle';
import Padding from './Padding';
import Tilt from './Tilt';

const Sponsors = () => {
  const sponsorLogosMain = [
    { src: 'fintual-logo-white.png', size: 400, alt: 'Fintual logo', url: 'https://fintual.cl/' },
    { src: 'aws-logo-white.png', size: 200, alt: 'Amazon Web Services logo', url: 'https://aws.amazon.com/' }
  ];

  const sponsorLogosSecondary = [
    { src: 'buk-logo-white.png', size: 170, alt: 'Buk logo', url: 'https://buk.cl/' },
    { src: 'ria-logo.png', size: 165, alt: 'RIA logo', url: 'https://www.riamoneytransfer.com/', className: 'filter brightness-0 invert' }
  ];

  const sponsorLogosTertiary = [
    { src: 'ey-logo.svg', size: 60, alt: 'EY logo', url: 'https://ey.com/', className: 'grayscale invert pb-8' },
    { src: 'shinkansen-logo-white.svg', size: 205, alt: 'Shinkansen logo', url: 'https://shinkansen.finance/' },
    { src: 'pullpo-logo-white.svg', size: 125, alt: 'Pullpo logo', url: 'https://pullpo.io/' },
    { src: 'fingo-logo-white.svg', size: 125, alt: 'Fingo logo', url: 'https://fingo.cl/' },
    { src: 'oragus-logo-white.svg', size: 125, alt: 'Oragus logo', url: 'https://oragus.com/' },
    { src: 'soyio-logo-white.png', size: 140, alt: 'Soyio logo', url: 'https://soyio.id/', className: 'grayscale pt-2' },
    { src: 'salduu-logo-white.svg', size: 105, alt: 'Salduu logo', url: 'https://salduu.com/' },
    { src: 'mok-logo-white.png', size: 105, alt: 'Mok logo', url: 'https://mok.cl/' },
  ]

  const logos = [sponsorLogosMain, sponsorLogosSecondary, sponsorLogosTertiary];

  return (
    <section className="w-full min-h-screen flex flex-col items-center justify-center pt-24">
      <Padding>
        <TypewriterTitle text="$ ls sponsors/*.svg" className="font-oxanium text-2xl md:text-5xl font-bold mb-12 text-center" />

        <div className="flex flex-col gap-16 py-16 lg:gap-28 lg:py-28">
          {logos.map((sponsorLogos, index) => (
            <div className="flex flex-col lg:flex-row flex-wrap items-center justify-center gap-12 lg:gap-32" key={index}>
              {sponsorLogos.map(({ src, size, alt, url, className }, sponsorIndex) => (
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
                      className={className}
                    />
                  </a>
                </Tilt>
              ))}
            </div>
          ))}
        </div>
      </Padding>
    </section>
  );
};

export default Sponsors;
