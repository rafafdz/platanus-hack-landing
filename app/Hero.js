import Padding from './Padding'
import CodeTyper from './CodeTyper'
import Image from 'next/image'
import TypewriterTitle from './TypewriterTitle'

const Hero = () => {
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
                <h1 className="font-oxanium text-7xl md:text-9xl font-medium relative z-10 tracking-tighter text-center">platanus hack</h1>
                <div className="flex flex-col text-center md:text-left justify-center text-lg md:text-3xl md:mt-4">
                  <p>22-24.nov</p>
                  <p>santiago</p>
                </div>
              </div>
              <div className="px-12 md:px-0 flex flex-col sm:flex-row gap-4 mt-8 justify-center w-full">
                <a href="https://platan.us/hack/apply" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center">
                  <button className="w-full md:w-auto bg-primary hover:bg-secondary text-black font-bold py-3 px-8 transition duration-300 ease-in-out rounded-full">
                    postular
                  </button>
                </a>
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