import Padding from './Padding'
import CodeTyper from './CodeTyper'
import Image from 'next/image'
import TypewriterTitle from './TypewriterTitle'
import { deadline } from './constants';

const Hero = () => {
  const isDeadlinePassed = new Date() > deadline;

  return (
    <>
      <div className="absolute inset-0 overflow-hidden w-full h-screen bg-gradient-to-b from-zinc-800 to-zinc-950">
        <div className="relative h-full text-xs w-screen">
          <CodeTyper />
        </div>
      </div>
      <div className="relative z-10 flex h-screen w-full" >
        <Padding>
          <div className="flex flex-col size-full">
            <div className="flex flex-col mt-12">
              <TypewriterTitle text="$ ls main-sponsors/*.svg" className="h-8 font-oxanium text-lg font-bold text-zinc-200 w-fit" />

              <div className="flex">
                <Image src="/hero-sponsors.svg" alt="main-sponsors" height={500} width={200} />
              </div>
            </div>
            <div className="flex flex-col justify-center items-start grow pb-36">
              <div className="flex flex-col md:flex-row w-full justify-center gap-3">
                <h1 className="font-oxanium text-7xl md:text-8xl 2xl:text-9xl font-medium relative z-10 tracking-tighter text-center">platanus hack</h1>
                <div className="flex flex-col text-center md:text-left justify-center text-lg 2xl:text-3xl md:mt-4">
                  <p>22-24.nov</p>
                  <p>santiago</p>
                </div>
              </div>
              <div className="px-12 md:px-0 flex flex-col sm:flex-row gap-4 mt-8 justify-center w-full">
                <div className="relative group flex items-center justify-center">
                  <button
                    className={`w-full md:w-auto font-bold py-3 px-8 rounded-full transition duration-300 ease-in-out
                      ${isDeadlinePassed
                        ? 'bg-zinc-600 cursor-not-allowed opacity-70'
                        : 'bg-primary hover:bg-secondary text-black'
                      }`}
                    disabled={isDeadlinePassed}
                    onClick={() => !isDeadlinePassed && window.open('https://platan.us/hack/apply', '_blank')}
                  >
                    postular
                  </button>
                  {isDeadlinePassed && (
                    <div className="absolute z-30 w-72 -top-28 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 ease-out bg-zinc-800 text-white px-4 py-2 rounded-lg text-sm border-primary border-1">
                      <p>
                        las postulaciones cerraron el 13 de noviembre a las 23:59. dudas? <a href="mailto:rafael@platan.us" className="text-primary">rafael@platan.us</a>
                      </p>
                    </div>
                  )}
                </div>
                <a href="https://platan.us/hack/sponsor-deck" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center">
                  <button className="w-full md:w-auto text-white border-white hover:text-primary hover:border-primary font-bold py-3 px-8 transition-all duration-300 ease-in-out rounded-full border backdrop-blur-sm">
                    quiero ser sponsor
                  </button>
                </a>
              </div>
            </div>
          </div>
        </Padding>
      </div>
    </>
  );
};

export default Hero;