import React, { useEffect, useRef, useState } from 'react';
import TypewriterTitle from './TypewriterTitle';

const Description = () => {
  const [lines, setLines] = useState([]);
  const containerRef = useRef(null);

  const paragraphs = [
    [
      { text: "Platanus Hack es un evento intensivo de" },
      { text: " 36 horas ", style: "font-bold text-green-400" },
      { text: "donde desarrolladores, diseñadores y emprendedores se unen para crear soluciones innovadoras a problemas reales. Inspirado en las mejores hackatones del mundo, este evento pionero en Chile busca fomentar la creatividad, la colaboración y el desarrollo de habilidades en un ambiente desafiante y emocionante." }
    ],
    [
      { text: "Durante el evento, los participantes tendrán acceso a mentores expertos, recursos tecnológicos de vanguardia y la oportunidad de trabajar en equipos multidisciplinarios. Desde la concepción de la idea hasta la presentación final, Platanus Hack ofrece una experiencia inmersiva que culmina con la posibilidad de presentar tu proyecto ante un panel de jueces de la industria tech y potenciales inversores." }
    ],
    [
      { text: "¿Estás listo para" },
      { text: " desafiar tus límites ", style: "font-bold text-yellow-400" },
      { text: "y crear algo extraordinario? Únete a nosotros en Platanus Hack y sé parte de la próxima generación de innovadores tecnológicos en Chile." }
    ],
  ];

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

      paragraphs.forEach((paragraph) => {
        if (typeof paragraph === 'string') {
          processText([{ text: paragraph, style: null }]);
        } else {
          processText(paragraph);
        }
        newLines.push({ number: lineNumber++, content: [{ text: '', style: null }] });
      });

      document.body.removeChild(tempElement);
      setLines(newLines);
    };

    splitTextIntoLines();
    window.addEventListener('resize', splitTextIntoLines);
    return () => window.removeEventListener('resize', splitTextIntoLines);
  }, []);

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
    <section className="w-full max-w-7xl mx-auto px-4 py-16 min-h-screen flex flex-col items-center justify-center">
      <TypewriterTitle text="$ vim hack-description.txt" className="text-2xl md:text-5xl font-bold mb-12 text-center" />
      <div ref={containerRef} className="leading-relaxed mb-16 text-left max-w-2xl w-full mx-auto font-mono whitespace-pre-wrap">
        {lines.map((line, index) => (
          <div key={index} className="flex">
            <span className="text-zinc-500 w-8 text-right mr-4 flex-shrink-0">{line.number}</span>
            <div className="flex-1 flex flex-wrap">{renderLine(line)}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Description;
