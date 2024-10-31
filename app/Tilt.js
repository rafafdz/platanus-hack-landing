import { useState, useEffect } from 'react';
import ReactParallaxTilt from 'react-parallax-tilt';

const Tilt = (props) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <ReactParallaxTilt 
      {...props} 
      tiltEnable={!isMobile}
    />
  );
};

export default Tilt;
