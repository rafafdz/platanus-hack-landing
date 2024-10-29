import React, { useEffect, useRef, useState, useCallback } from 'react';
import Tilt from 'react-parallax-tilt';
import Image from 'next/image';
import Padding from './Padding';
import TypewriterTitle from './TypewriterTitle';

const Description = () => {
  const [lines, setLines] = useState([]);
  const [isVisible, setIsVisible] = useState(false);
  const [tiltAngles, setTiltAngles] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const tilesRef = useRef(null);
  const frameRef = useRef();

  const logoTiles = [
    "logo-tile-banana.svg",
    "logo-tile-parenthesis.svg",
    "logo-tile-slash.svg",
    "logo-tile-bracket.svg",
  ]

  const paragraphs = [
    [
      { text: "platanus hack reúne el mejor talento techie de chile para crear soluciones a problemas reales." },
      { text: " de cero a producto en 36 horas.", style: "font-bold text-primary" }
    ],
    [
      { text: "unimos equipos de 3 a 5 personas, cafeína, mentores y pitches asistidos por platanus para tener una hackatón de nivel internacional en chile." }
    ],
    [
      { text: "el foco es crear soluciones a problemas reales, presentarlas como corresponde con pitches que estén a la altura de la solución y que quede deployeado, disponible a cualquier persona alrededor del mundo." },
    ],
  ];

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (tilesRef.current) {
      observer.observe(tilesRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const splitTextIntoLines = () => {
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.offsetWidth;
      const tempElement = document.createElement('span');
      tempElement.style.visibility = 'hidden';
      tempElement.style.position = 'absolute';
      tempElement.style.whiteSpace = 'normal';
      tempElement.style.font = window.getComputedStyle(containerRef.current).font;
      document.body.appendChild(tempElement);

      const newLines = [];
      let lineNumber = 1;

      const processText = (paragraph) => {
        let currentLine = '';
        let currentLineSegments = [];
        let words = [];

        paragraph.forEach(segment => {
          words = words.concat(segment.text.split(' ').map(word => ({ word, style: segment.style })));
        });

        words.forEach((wordObj) => {
          const testLine = currentLine + (currentLine ? ' ' : '') + wordObj.word;
          tempElement.textContent = testLine;
          const lineWidth = tempElement.offsetWidth;

          if (lineWidth > containerWidth - 50) { // 50px buffer for line number
            if (currentLine) {
              newLines.push({ number: lineNumber++, content: currentLineSegments });
              currentLine = wordObj.word;
              currentLineSegments = [{ text: wordObj.word, style: wordObj.style }];
            } else {
              currentLine = wordObj.word;
              currentLineSegments = [{ text: wordObj.word, style: wordObj.style }];
            }
          } else {
            currentLine = testLine;
            if (currentLineSegments.length > 0 && currentLineSegments[currentLineSegments.length - 1].style === wordObj.style) {
              currentLineSegments[currentLineSegments.length - 1].text += ' ' + wordObj.word;
            } else {
              currentLineSegments.push({ text: wordObj.word, style: wordObj.style });
            }
          }
        });

        if (currentLine) {
          newLines.push({ number: lineNumber++, content: currentLineSegments });
        }
      };

      paragraphs.forEach((paragraph, index) => {
        if (typeof paragraph === 'string') {
          processText([{ text: paragraph, style: null }]);
        } else {
          processText(paragraph);
        }
        if (index < paragraphs.length - 1) {
          newLines.push({ number: lineNumber++, content: [{ text: '', style: null }] });
        }
      });

      document.body.removeChild(tempElement);
      setLines(newLines);
    };

    splitTextIntoLines();
    window.addEventListener('resize', splitTextIntoLines);
    return () => window.removeEventListener('resize', splitTextIntoLines);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      if (!tilesRef.current) return;

      const rect = tilesRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;

      const tiltY = (deltaX / window.innerWidth) * 30;
      const tiltX = -(deltaY / window.innerHeight) * 30;

      setTiltAngles({
        x: Math.max(-20, Math.min(20, tiltX)),
        y: Math.max(-20, Math.min(20, tiltY))
      });
    });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [handleMouseMove]);

  const renderLine = (line) => {
    return line.content.map((segment, index) => (
      <span
        key={index}
        className={`inline-block ${segment.style || 'text-zinc-300'}`}
      >
        {segment.text}
      </span>
    ));
  };

  return (
    <section className="w-full min-h-screen flex flex-col items-center justify-center">
      <Padding>
        <div className="flex flex-col md:flex-row">
          <div className="flex flex-col md:w-1/2">
            <TypewriterTitle text="$ vim hack-description.txt" className="font-oxanium text-2xl md:text-5xl font-bold mb-12 text-center" />
            <div ref={containerRef} className="leading-relaxed mb-16 text-left max-w-2xl w-full mx-auto font-mono whitespace-pre-wrap">
              {lines.map((line, index) => (
                <div key={index} className="flex">
                  <span className="text-zinc-500 w-8 text-right mr-4 flex-shrink-0">{line.number}</span>
                  <div className="flex-1 flex flex-wrap">{renderLine(line)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex md:grow items-center justify-center">
            <div ref={tilesRef} className="grid grid-cols-2 grid-rows-2 gap-0 items-center justify-center">
              {logoTiles.map((tile, index) => (
                <Tilt
                  key={index}
                  tiltAngleXManual={tiltAngles.x}
                  tiltAngleYManual={tiltAngles.y}
                  perspective={1000}
                  scale={1.01}
                  transitionSpeed={1000}
                  className="transition-opacity duration-300"
                >
                  <Image 
                    src={`${tile}`}
                    alt={tile} 
                    width={150}
                    height={150} 
                    className={`
                      box-border m-0 p-0 
                      opacity-0 transition-opacity duration-500 ease-in-out
                      ${isVisible ? 'opacity-100' : ''}
                    `}
                    style={{
                      transition: `opacity 500ms ease-in-out ${index * 200}ms`,
                    }}
                  />
                </Tilt>
              ))}
            </div>
          </div>
        </div>
      </Padding>
    </section>
  );
};

export default Description;
