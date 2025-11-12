import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Confetti from 'react-confetti';
import { ethers } from 'ethers';

interface WinnerData {
  address: string;
  percentage: bigint;
  reward: bigint;
}

interface RaffleDrawAnimationProps {
  participantAddresses: string[];
  winners: WinnerData[];
  isAnimating: boolean;
  onAnimationComplete: () => void;
}

export default function RaffleDrawAnimation({ 
  participantAddresses, 
  winners, 
  isAnimating, 
  onAnimationComplete 
}: RaffleDrawAnimationProps) {
  const [currentAddresses, setCurrentAddresses] = useState<string[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<'cycling' | 'revealing' | 'complete'>('cycling');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [revealedWinners, setRevealedWinners] = useState<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);
  const shuffledAddressesRef = useRef<string[]>([]);
  const isRunningRef = useRef<boolean>(false);

  // Helper function to truncate address
  const truncateAddress = useCallback((address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, []);

  // Helper function to format percentage
  const formatPercentage = useCallback((percentage: bigint) => {
    return (Number(percentage) / 100).toFixed(1);
  }, []);

  // Memoize shuffled addresses to prevent recalculation on every render
  const shuffledAddresses = useMemo(() => {
    if (participantAddresses.length === 0) return [];
    const shuffled = [...participantAddresses].sort(() => Math.random() - 0.5);
    return shuffled;
  }, [participantAddresses]);

  useEffect(() => {
    if (!isAnimating || participantAddresses.length === 0) {
      setCurrentAddresses([]);
      setShowConfetti(false);
      setAnimationPhase('cycling');
      setRevealedWinners(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    // Initialize shuffled addresses
    shuffledAddressesRef.current = shuffledAddresses;
    lastUpdateTimeRef.current = Date.now();

    const cycleSpeed = 300; // Slower speed to reduce flicker (300ms)
    let cycleCount = 0;
    let addressIndex = 0;

    // Reset running flag
    isRunningRef.current = true;

    const startAnimation = () => {
      setAnimationPhase('cycling');
      setCurrentAddresses([]);
      setShowConfetti(false);
      setRevealedWinners(0);
      cycleCount = 0;
      addressIndex = 0;
      isRunningRef.current = true;

      // Use a more stable update mechanism with requestAnimationFrame
      const updateAddresses = () => {
        if (!isRunningRef.current) return;
        
        const now = Date.now();
        if (now - lastUpdateTimeRef.current >= cycleSpeed) {
          // Rotate through shuffled addresses more smoothly
          const selected: string[] = [];
          for (let i = 0; i < Math.min(5, shuffledAddressesRef.current.length); i++) {
            const idx = (addressIndex + i) % shuffledAddressesRef.current.length;
            selected.push(shuffledAddressesRef.current[idx]);
          }
          
          setCurrentAddresses(selected);
          addressIndex = (addressIndex + 1) % Math.max(1, shuffledAddressesRef.current.length);
          cycleCount++;
          lastUpdateTimeRef.current = now;
        }
        
        // Continue animation only if still cycling
        if (isRunningRef.current) {
          animationFrameRef.current = requestAnimationFrame(updateAddresses);
        }
      };

      // Start with initial addresses
      const initialSelected: string[] = [];
      for (let i = 0; i < Math.min(5, shuffledAddressesRef.current.length); i++) {
        initialSelected.push(shuffledAddressesRef.current[i]);
      }
      setCurrentAddresses(initialSelected);

      // Use requestAnimationFrame for smoother updates
      animationFrameRef.current = requestAnimationFrame(updateAddresses);
    };

    startAnimation();

    return () => {
      isRunningRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isAnimating, participantAddresses, shuffledAddresses]);

  // Reveal winners one by one - Define function first
  const revealWinnersSequentially = useCallback(() => {
    let currentIndex = 0;
    const revealSpeed = 1000; // Slightly slower for better visibility (1 second between reveals)

    const revealNext = () => {
      if (currentIndex < winners.length) {
        setRevealedWinners(currentIndex + 1);
        currentIndex++;
        
        if (currentIndex < winners.length) {
          setTimeout(revealNext, revealSpeed);
        } else {
          // All winners revealed
          setTimeout(() => {
            setAnimationPhase('complete');
            setShowConfetti(true);
            
            // Complete animation after confetti (6 seconds)
            setTimeout(() => {
              onAnimationComplete();
            }, 6000);
          }, revealSpeed);
        }
      }
    };

    revealNext();
  }, [winners, onAnimationComplete]);

  // Reveal winners one by one - Use function after definition
  useEffect(() => {
    if (winners.length > 0 && isAnimating && animationPhase === 'cycling') {
      // Stop the cycling animation
      isRunningRef.current = false;
      
      // Clear the animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Start revealing winners after a brief pause
      const revealTimer = setTimeout(() => {
        setAnimationPhase('revealing');
        revealWinnersSequentially();
      }, 1000); // Longer pause for smoother transition

      return () => clearTimeout(revealTimer);
    }
  }, [winners, isAnimating, animationPhase, revealWinnersSequentially]);

  if (!isAnimating) return null;

  const winnerAddresses = winners.map(w => w.address);
  const displayedAddresses = animationPhase === 'cycling' 
    ? currentAddresses 
    : winnerAddresses.slice(0, revealedWinners);

  return (
    <div className="fixed inset-0 bg-orange-50/95 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
      {/* Confetti Animation */}
      {showConfetti && (
        <Confetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={false}
          numberOfPieces={500}
          colors={['#FB923C', '#FFEDD5', '#C2410C', '#EA580C', '#FDBA74', '#FFF7ED', '#EA580C']}
          gravity={0.2}
          initialVelocityY={25}
          initialVelocityX={15}
        />
      )}

      {/* Main Animation Container */}
      <div className="relative w-full max-w-6xl md:max-w-7xl px-4 md:px-8">
        {/* Title */}
        <div className="text-center mb-6 md:mb-10">
          <h2 className="text-3xl md:text-5xl font-black text-[#EA580C] mb-3 md:mb-4 uppercase">
            {animationPhase === 'cycling' && '✨ Drawing Winners...'}
            {animationPhase === 'revealing' && '🎯 Revealing Winners...'}
            {animationPhase === 'complete' && '🎉 Congratulations! 🎉'}
          </h2>
          <p className="text-[#EA580C] text-base md:text-xl font-bold">
            {animationPhase === 'cycling' && 'Using FHE-powered randomness'}
            {animationPhase === 'revealing' && `${revealedWinners} of ${winners.length} winners revealed`}
            {animationPhase === 'complete' && `${winners.length} winners selected!`}
          </p>
        </div>

        {/* Winner Boxes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-10">
          {Array.from({ length: 5 }).map((_, idx) => {
            const winner = winners[idx];
            const address = displayedAddresses[idx];
            const isRevealed = idx < revealedWinners || animationPhase === 'complete';
            const isCycling = animationPhase === 'cycling' && address;
            const isEmpty = !address && !winner;

            return (
              <div
                key={`winner-box-${idx}-${address || 'empty'}`}
                className={`
                  relative p-4 md:p-6 rounded-lg border-4 transition-colors duration-300
                  ${isRevealed && winner
                    ? 'bg-[#FB923C] border-[#C2410C] shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] scale-105'
                    : isCycling
                    ? 'bg-white border-[#EA580C] shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]'
                    : 'bg-white border-[#EA580C] shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]'
                  }
                `}
                style={{
                  willChange: isCycling ? 'contents' : 'auto',
                }}
              >
                {/* Winner Number Badge */}
                <div className="absolute -top-3 -left-3 md:-top-4 md:-left-4 w-8 h-8 md:w-10 md:h-10 rounded-lg bg-[#FB923C] flex items-center justify-center border-4 border-[#EA580C] z-10">
                  <span className="text-white font-black text-sm md:text-base">{idx + 1}</span>
                </div>

                {/* Address Display */}
                <div className="text-center pt-2">
                  {isEmpty ? (
                    <div className="h-12 md:h-16 flex items-center justify-center">
                      <span className="text-gray-500 text-sm md:text-base font-bold">-</span>
                    </div>
                  ) : (
                    <>
                      <div 
                        key={`address-${address}-${idx}`}
                        className={`font-mono text-sm md:text-lg font-black mb-2 md:mb-3 transition-colors duration-200 ${
                          isRevealed && winner ? 'text-white' : 'text-[#EA580C]'
                        }`}
                        style={{
                          opacity: isCycling ? 1 : 1,
                        }}
                      >
                        {truncateAddress(address || '')}
                      </div>
                      
                      {/* Winner Details - Only show when revealed */}
                      {isRevealed && winner && (
                        <div className="space-y-2 animate-fade-in">
                          <div className="text-white font-black text-lg md:text-2xl">
                            {formatPercentage(winner.percentage)}%
                          </div>
                          <div className="text-white text-xs md:text-base font-bold">
                            {ethers.formatEther(winner.reward)} MAZA
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Pulsing effect for revealed winners - removed during cycling to reduce flicker */}
                {isRevealed && winner && animationPhase !== 'cycling' && (
                  <div className="absolute inset-0 rounded-lg bg-[#C2410C]/20 animate-ping opacity-30"></div>
                )}
              </div>
            );
          })}
        </div>

        {/* Status Message */}
        {animationPhase === 'complete' && (
          <div className="text-center bg-white border-4 border-[#EA580C] rounded-lg p-4 md:p-6 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
            <p className="text-[#EA580C] text-lg md:text-2xl font-black mb-2 md:mb-3 uppercase">
              All winners have been selected!
            </p>
            <p className="text-gray-700 text-sm md:text-lg font-bold">
              Check the results below to see full details
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

