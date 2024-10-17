'use client'

import React, { useState, useEffect } from 'react';
import Tilt from 'react-parallax-tilt';
import TypewriterTitle from './TypewriterTitle';

export default function Countdown() {
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());
    const [isHovered, setIsHovered] = useState(false);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    function calculateTimeLeft() {
        const difference = +new Date("2024-11-14T00:00:00-03:00") - +new Date();
        let timeLeft = {};

        if (difference > 0) {
            timeLeft = {
                días: Math.floor(difference / (1000 * 60 * 60 * 24)),
                horas: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minutos: Math.floor((difference / 1000 / 60) % 60),
                segundos: Math.floor((difference / 1000) % 60),
            };
        }

        return timeLeft;
    }

    const timeComponents = Object.entries(timeLeft).map(([unit, value]) => (
        <div key={unit} className="flex flex-col items-center">
            <span className={`text-6xl md:text-[11rem] font-bold transition-colors duration-300 ${isHovered ? 'text-primary' : ''}`}>
                {value}
            </span>
            <span className="text-xl md:text-2xl text-zinc-400">{unit}</span>
        </div>
    ));

    return (
        <section className="min-h-screen flex flex-col items-center justify-center p-4 gap-8">
            <TypewriterTitle text="$ apply_countdown.tick()" className="text-2xl md:text-5xl font-bold mb-12 text-center" />
            <p className="text-xl text-center">se te acaba el tiempo para postular. deadline @ 2024-11-14T00:00:00-03:00 </p>
            <Tilt
                className="parallax-effect"
                tiltMaxAngleX={5}
                tiltMaxAngleY={5}
                perspective={1000}
                transitionSpeed={1500}
                scale={1.02}
                gyroscope={true}
            >
                <div 
                    className={`border rounded-lg p-8 shadow-2xl transition-colors duration-300 ${
                        isHovered ? 'border-primary' : 'border-zinc-700'
                    }`}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        {timeComponents}
                    </div>
                </div>
            </Tilt>
            <a 
                href="https://platan.us/hack/apply" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-block bg-primary hover:bg-secondary text-black font-bold py-3 px-6 rounded-lg text-3xl transition duration-300 ease-in-out transform hover:scale-105 mt-8"
            >
                lets go
            </a>
        </section>
    );
}
