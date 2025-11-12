import { useEffect } from 'react';
// @ts-ignore - canvas-confetti types may not be available
import confetti from 'canvas-confetti';

interface ClaimConfettiProps {
  show: boolean;
  onComplete?: () => void;
}

export default function ClaimConfetti({ show, onComplete }: ClaimConfettiProps) {
  useEffect(() => {
    // Only trigger confetti when show is true
    if (show) {
      // Trigger confetti animation
      const duration = 3000; // 3 seconds
      const animationEnd = Date.now() + duration;
      const defaults = { 
        startVelocity: 30, 
        spread: 360, 
        ticks: 60, 
        zIndex: 10000,
        colors: ['#FB923C', '#FFEDD5', '#C2410C', '#EA580C', '#FDBA74', '#FFF7ED', '#F97316', '#FFA500']
      };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: NodeJS.Timeout = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          clearInterval(interval);
          if (onComplete) {
            onComplete();
          }
          return;
        }

        const particleCount = 50 * (timeLeft / duration);
        
        // Launch from left side
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        });
        
        // Launch from right side
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        });
      }, 250);

      // Cleanup
      return () => {
        clearInterval(interval);
      };
    }
  }, [show, onComplete]);

  // This component doesn't render anything, it just triggers confetti
  return null;
}

