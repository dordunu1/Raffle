import React, { useState, useEffect, useRef, useCallback } from 'react';

interface GlitchTextProps {
  text: string;
  className?: string;
  scrambleSpeed?: number; // milliseconds between character updates
  revealSpeed?: number; // milliseconds between revealing each character
}

const GlitchText: React.FC<GlitchTextProps> = ({ 
  text, 
  className = '', 
  scrambleSpeed = 80,
  revealSpeed = 200 
}) => {
  // Characters used for scrambling (alphanumeric + some symbols)
  const scrambleChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';

  // Get a random scramble character
  const getRandomChar = () => {
    return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
  };

  // Initialize with scrambled text immediately
  const getInitialScrambled = () => {
    return text.split('').map(() => getRandomChar()).join('');
  };

  const [displayText, setDisplayText] = useState<string>(getInitialScrambled());
  const [isRevealing, setIsRevealing] = useState<boolean>(false);
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());
  const revealedIndicesRef = useRef<Set<number>>(new Set());
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Function to start the animation
  const startAnimation = useCallback(() => {
    const scrambled = text.split('').map(() => getRandomChar()).join('');
    setDisplayText(scrambled);
    setRevealedIndices(new Set());
    revealedIndicesRef.current = new Set();
    setIsRevealing(false);
    
    // Start revealing after a brief delay
    setTimeout(() => {
      setIsRevealing(true);
    }, 300);
  }, [text]);

  // Initialize with scrambled text
  useEffect(() => {
    startAnimation();
    
    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
    };
  }, [startAnimation]);

  // Restart animation every 30 seconds after completion
  useEffect(() => {
    // When animation completes (isRevealing becomes false and all characters are revealed)
    if (!isRevealing && revealedIndices.size === text.length && text.length > 0) {
      // Clear any existing restart timer
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
      
      // Set timer to restart animation after 30 seconds
      restartTimerRef.current = setTimeout(() => {
        startAnimation();
      }, 30000); // 30 seconds
    }

    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
    };
  }, [isRevealing, revealedIndices.size, text, startAnimation]);

  // Scramble effect - continuously randomize non-revealed characters
  useEffect(() => {
    if (!isRevealing) return;

    const scrambleInterval = setInterval(() => {
      setDisplayText(prev => {
        return prev.split('').map((char, index) => {
          // Keep revealed characters as they are
          if (revealedIndicesRef.current.has(index)) {
            return text[index];
          }
          // Scramble non-revealed characters
          return getRandomChar();
        }).join('');
      });
    }, scrambleSpeed);

    return () => clearInterval(scrambleInterval);
  }, [isRevealing, text, scrambleSpeed]);

  // Reveal characters one by one
  useEffect(() => {
    if (!isRevealing) return;

    const revealInterval = setInterval(() => {
      setRevealedIndices(prev => {
        const newSet = new Set(prev);
        
        // Find the first unrevealed index
        for (let i = 0; i < text.length; i++) {
          if (!newSet.has(i)) {
            newSet.add(i);
            revealedIndicesRef.current = newSet;
            break;
          }
        }
        
        // If all characters are revealed, stop the interval
        if (newSet.size === text.length) {
          setIsRevealing(false);
        }
        
        return newSet;
      });
    }, revealSpeed);

    return () => clearInterval(revealInterval);
  }, [isRevealing, text, revealSpeed]);

  // Update display text when revealed indices change
  useEffect(() => {
    setDisplayText(prev => {
      return prev.split('').map((char, index) => {
        if (revealedIndices.has(index)) {
          return text[index];
        }
        return char;
      }).join('');
    });
  }, [revealedIndices, text]);

  // Ensure we always have something to display
  if (!displayText || displayText.length === 0) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className} style={{ fontVariantNumeric: 'normal', display: 'inline-block' }}>
      {displayText.split('').map((char, index) => {
        const isRevealed = revealedIndices.has(index);
        const isSpace = text[index] === ' ';
        const currentChar = isRevealed ? text[index] : char;
        
        return (
          <span
            key={`${index}-${currentChar}-${isRevealed}`}
            style={{
              display: 'inline-block',
              opacity: isRevealed ? 1 : 0.8,
              transition: isRevealed ? 'opacity 0.15s ease-in' : 'none',
              color: 'inherit',
            }}
          >
            {isSpace ? '\u00A0' : currentChar}
          </span>
        );
      })}
    </span>
  );
};

export default GlitchText;

