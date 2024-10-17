import React, { useEffect, useRef, useState } from 'react';
import Typewriter from 'typewriter-effect';

const TypewriterTitle = ({ text, className }) => {
  const [isVisible, setIsVisible] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0.1,
      }
    );

    if (titleRef.current) {
      observer.observe(titleRef.current);
    }

    return () => {
      if (titleRef.current) {
        observer.unobserve(titleRef.current);
      }
    };
  }, []);

  return (
    <div ref={titleRef} className={className}>
      {isVisible && (
        <Typewriter
          options={{
            strings: text,
            autoStart: true,
            loop: false,
            delay: 35,
          }}
        />
      )}
    </div>
  );
};

export default TypewriterTitle;
