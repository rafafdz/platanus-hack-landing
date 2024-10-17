import React from 'react';
import TypewriterTitle from './TypewriterTitle';

const Description = () => {
  const lines = [
    [
      { text: "Platanus Hack es un evento intensivo de " },
      { text: "36 horas", style: "font-bold text-green-400" },
      { text: " donde" }
    ],
    "desarrolladores, diseñadores y emprendedores se unen para crear",
    "soluciones innovadoras a problemas reales. Inspirado en las",
    "mejores hackatones del mundo, este evento pionero en Chile",
    "busca fomentar la creatividad, la colaboración y el desarrollo",
    "de habilidades en un ambiente desafiante y emocionante.",
    "",
    "Durante el evento, los participantes tendrán acceso a mentores",
    "expertos, recursos tecnológicos de vanguardia y la oportunidad",
    "de trabajar en equipos multidisciplinarios. Desde la concepción",
    "de la idea hasta la presentación final, Platanus Hack ofrece",
    "una experiencia inmersiva que culmina con la posibilidad de",
    "presentar tu proyecto ante un panel de jueces de la industria",
    "tech y potenciales inversores.",
    "",
    [
      { text: "¿Estás listo para " },
      { text: "desafiar tus límites", style: "font-bold text-yellow-400" },
      { text: " y crear algo" }
    ],
    "extraordinario? Únete a nosotros en Platanus Hack y sé parte",
    "de la próxima generación de innovadores tecnológicos en Chile.",
    "",
    "~ EOF"
  ];

  const renderLine = (line) => {
    if (typeof line === 'string') {
      return <span className="text-zinc-300">{line}</span>;
    }

    return line.map((segment, index) => (
      <span key={index} className={segment.style ? `text-zinc-300 ${segment.style}` : "text-zinc-300"}>
        {segment.text}
      </span>
    ));
  };

  return (
    <section className="w-full max-w-7xl mx-auto px-4 py-16 min-h-screen flex flex-col items-center justify-center">
      <TypewriterTitle text="$ vim hack-description.txt" className="text-4xl md:text-5xl font-bold mb-12 text-center" />
      <div className="leading-relaxed mb-16 text-left max-w-3xl mx-auto font-mono whitespace-pre-wrap">
        {lines.map((line, index) => (
          <div key={index} className="flex">
            <span className="text-zinc-500 w-8 text-right mr-4">{index + 1}</span>
            {renderLine(line)}
          </div>
        ))}
      </div>
    </section>
  );
};

export default Description;
