import React from 'react';
import Tilt from 'react-parallax-tilt';
import TypewriterTitle from './TypewriterTitle';
import {FaVideo, FaChalkboardTeacher, FaBed, FaMicrophone, FaGlobeAmericas, FaUtensils, FaHandshake, FaUsers } from 'react-icons/fa';
import { GiMoneyStack } from 'react-icons/gi';
import { RiOpenSourceFill } from 'react-icons/ri';

const FeatureCard = ({ title, description, Icon, isPrimary = true }) => (
  <Tilt
    className="parallax-effect w-[240px] aspect-square"
    tiltMaxAngleX={10}
    tiltMaxAngleY={10}
    perspective={800}
    transitionSpeed={1500}
    scale={1.03}
    gyroscope={true}
  >
    <div className="bg-gradient-to-br from-zinc-800 to-zinc-950 p-4 rounded-xl shadow-lg h-full">
      <div className="text-4xl mb-3">
        <Icon className={`w-10 h-10 ${isPrimary ? 'text-primary' : 'text-zinc-400'}`} />
      </div>
      <h3 className={`text-lg font-bold mb-2 ${isPrimary ? 'text-primary' : 'text-zinc-300'}`}>{title}</h3>
      <p className={`${isPrimary ? 'text-zinc-300' : 'text-zinc-400'} text-sm`}>{description}</p>
    </div>
  </Tilt>
);

const Features = () => {
  const primaryFeatures = [
    {
      title: "mentores",
      description: "los mejores founders del ecosistema tech chileno te ayudarán desde el brainstorm hasta el pitch.",
      Icon: FaChalkboardTeacher
    },
    {
      title: "aloja aquí",
      description: "36 horas de hacking y probablemente un par de horas de sueño. tendremos un espacio especial para ese último par de horas.",
      Icon: FaBed
    },
    {
      title: "pitches",
      description: "en muchas hackatones se pierden buenos proyectos por malos pitches. te ayudaremos a que el pitch le haga justicia a tu proyecto.",
      Icon: FaMicrophone
    },
    {
      title: "chin chin",
      description: "1000 dólares en AWS por grupo para construir como una startup platanus.",
      Icon: GiMoneyStack
    },
    {
      title: "deploy it",
      description: "tu solución la tiene que poder usar cualquier persona del mundo. terminarás con un producto accesible públicamente.",
      Icon: FaGlobeAmericas
    },
    {
      title: "open source",
      description: "todos los proyectos serán open source, licencia MIT.",
      Icon: RiOpenSourceFill
    },
    {
      title: "livestream",
      description: "los demos / pitches serán transmitidos en vivo. tu abuelita juzgará tu proyecto.",
      Icon: FaVideo
    }
  ];

  const secondaryFeatures = [
    {
      title: "comida",
      description: "suficiente comida para que sólo te preocupes en hackear y suficiente cafeína para quedar tiritando. no lo hagas.",
      Icon: FaUtensils
    },
    {
      title: "sponsors",
      description: "las mejores empresas tech estarán acá. es posible que termines con trabajo.",
      Icon: FaHandshake
    },
    {
      title: "networking",
      description: "nos enfocamos en filtrar a los mejores techies. vale la pena que los conozcas.",
      Icon: FaUsers
    }
  ];

  return (
    <section className="w-full max-w-7xl mx-auto px-4 py-16 min-h-screen flex flex-col items-center justify-center">
      <TypewriterTitle text="$ diff platanus-hack other-hacks" className="font-oxanium text-2xl md:text-5xl font-bold mb-12 text-center" />
      <p className="text-xl leading-relaxed mb-16 text-center max-w-3xl mx-auto">
        tomamos elementos de las hackatones top del mundo para crear una hackatón de primer nivel en chile.
      </p>
      <div className="flex flex-col items-center lg:flex-row flex-wrap justify-center gap-4 w-full">
        {primaryFeatures.map((feature, index) => (
          <FeatureCard key={index} {...feature} />
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-4 mt-8 w-full">
        {secondaryFeatures.map((feature, index) => (
          <FeatureCard key={index} {...feature} isPrimary={false} />
        ))}
      </div>
    </section>
  );
};

export default Features;
