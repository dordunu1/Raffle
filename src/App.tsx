import React, { useState } from 'react';
import { initializeFheInstance } from './lib/fhevm';
import { WagmiConfig, useConfig } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, ConnectButton, lightTheme } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId } from 'wagmi';
import { Shield, Ticket, Lock, Zap, Target, DollarSign, ArrowRight } from 'lucide-react';
import FheRaffle from './components/FheRaffle';
import GlitchText from './components/GlitchText';
import { config, } from './wagmi';
import { sepolia } from 'wagmi/chains';
import '@rainbow-me/rainbowkit/styles.css';
import './App.css';




// Create a query client with refresh on window focus
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true, // Refresh queries when window regains focus
      refetchOnMount: true, // Refresh queries when component mounts
      staleTime: 0, // Always consider data stale to ensure fresh network checks
    },
  },
});

// Main app component that uses RainbowKit hooks
function AppContent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const wagmiConfig = useConfig();
  const [message, setMessage] = useState<string>('');
  const [fhevmStatus, setFhevmStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [fhevmDebugInfo, setFhevmDebugInfo] = useState<string>('');
  const [showIntroModal, setShowIntroModal] = useState(true);

  // Refresh network status when page becomes visible (user returns from another app/tab)
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isConnected) {
        // Force refresh of network state by reconnecting to the provider
        console.log('🔄 Page became visible - refreshing network status...');
        console.log('📊 Current chainId:', chainId);
        console.log('✅ Supported chains:', wagmiConfig.chains.map(c => ({ id: c.id, name: c.name })));
        
        // Check if current chain is supported
        const isSupportedChain = wagmiConfig.chains.some(chain => chain.id === chainId);
        if (!isSupportedChain && chainId !== sepolia.id) {
          console.log('⚠️ Current chain is not in supported chains list');
        }
        
        // Trigger a reconnection check by accessing the provider
        if (window.ethereum) {
          window.ethereum.request({ method: 'eth_chainId' })
            .then((currentChainId: string) => {
              const numericChainId = parseInt(currentChainId, 16);
              console.log('🔍 Wallet reports chainId:', numericChainId);
              if (numericChainId !== chainId) {
                console.log('🔄 ChainId mismatch detected - wagmi should update automatically');
              }
            })
            .catch((error: any) => {
              console.error('❌ Error checking chainId:', error);
            });
        }
      }
    };

    // Refresh on mount as well
    if (isConnected) {
      handleVisibilityChange();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isConnected, chainId, wagmiConfig]);

  // Listen for chain changes from the ethereum provider and log for debugging
  React.useEffect(() => {
    if (!isConnected || !window.ethereum) return;

    const handleChainChanged = (chainIdHex: string) => {
      const newChainId = parseInt(chainIdHex, 16);
      console.log('🔗 Chain changed event received:', newChainId);
      console.log('📊 Current wagmi chainId:', chainId);
      console.log('✅ Expected Sepolia chainId:', sepolia.id);
      console.log('✅ Is Sepolia?', newChainId === sepolia.id);
      
      // Wagmi should automatically update chainId, but we log for debugging
      if (newChainId === sepolia.id && chainId !== sepolia.id) {
        console.log('✅ Chain is correct Sepolia - wagmi should update automatically');
      }
    };

    // Listen for chain changes (EIP-1193 standard)
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [isConnected, chainId]);

  // Debug log chainId changes
  React.useEffect(() => {
    if (isConnected) {
      console.log('📊 ChainId updated:', chainId);
      console.log('✅ Is Sepolia?', chainId === sepolia.id);
      console.log('✅ Is supported?', wagmiConfig.chains.some(chain => chain.id === chainId));
    }
  }, [chainId, isConnected, wagmiConfig]);

  // Initialize FHEVM when wallet connects
  React.useEffect(() => {
    if (isConnected) {
      initializeFhevm();
    } else {
      setFhevmStatus('idle');
    }
  }, [isConnected]);

  // Initialize FHEVM
  const initializeFhevm = async () => {
    setFhevmStatus('loading');
    setFhevmDebugInfo('🔍 Starting FHEVM initialization...');
    
    try {
      // Override console.log to capture debug info
      const originalLog = console.log;
      const debugLogs: string[] = [];
      
      console.log = (...args) => {
        debugLogs.push(args.join(' '));
        setFhevmDebugInfo(debugLogs.join('\n'));
        originalLog(...args);
      };
      
      await initializeFheInstance();
      
      // Restore console.log
      console.log = originalLog;
      
      setFhevmStatus('ready');
      setFhevmDebugInfo('✅ FHEVM initialized successfully!');
      console.log('✅ FHEVM initialized for React!');
    } catch (error: any) {
      setFhevmStatus('error');
      setFhevmDebugInfo(`❌ FHEVM initialization failed: ${error.message}`);
      console.error('FHEVM initialization failed:', error);
    }
  };



  return (
    <div className="min-h-screen bg-orange-50 text-[#EA580C]">
      {/* Header - Orange Design */}
      <header className="flex flex-col w-full items-start gap-2.5 pt-4 md:pt-6 pb-3 md:pb-4 px-4 md:px-6 bg-white border-b-4 border-[#EA580C] shadow-[0px_4px_0px_0px_rgba(234,88,12,0.8)]">
        <div className="flex items-center justify-between w-full max-w-[1400px] mx-auto">
          <div className="inline-flex items-center justify-center gap-2 md:gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-[#FB923C] border-4 border-[#EA580C] rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 md:w-6 md:h-6 text-white" fill="white" />
            </div>
            <h1 className="font-black text-[#EA580C] text-base md:text-xl text-center tracking-[0] leading-[19.2px] whitespace-nowrap uppercase">
              <GlitchText text="FHE Raffle" scrambleSpeed={120} revealSpeed={300} />
            </h1>
          </div>
          
          {/* Wallet Connect Button - Custom Styled */}
          <div className="[&_button]:bg-[#FB923C] [&_button]:text-white [&_button]:border-4 [&_button]:border-[#EA580C] [&_button]:rounded-lg [&_button]:shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] [&_button]:font-black [&_button]:px-4 [&_button]:py-2 [&_button]:hover:translate-x-[4px] [&_button]:hover:translate-y-[4px] [&_button]:hover:shadow-none [&_button]:transition-all">
          <ConnectButton 
            showBalance={false} 
            accountStatus="address"
          />
          </div>
        </div>
      </header>

      {/* Introduction Modal - Raffle Welcome */}
      {showIntroModal && (
        <div className="fixed inset-0 bg-orange-50/95 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-8 overflow-y-auto">
          {/* Pop up Container - Wide and Compact for Desktop */}
          <div 
            className="bg-white rounded-lg md:rounded-xl shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] w-full max-w-md md:max-w-5xl lg:max-w-6xl border-4 border-[#EA580C] relative overflow-hidden max-h-[90vh] md:max-h-[85vh] flex flex-col"
          >
            {/* Scrollable Content - Horizontal Layout on Desktop */}
            <div className="relative flex flex-col md:flex-row items-center md:items-start p-4 md:p-6 lg:p-8 gap-4 md:gap-6 overflow-y-auto flex-1">
              {/* Left Side - Logo and Hero */}
              <div className="flex flex-col items-center md:items-start md:w-1/3 gap-3 md:gap-4">
                {/* Raffle Icon/Logo */}
                <div className="relative w-16 h-16 md:w-20 md:h-24 flex items-center justify-center">
                  <div 
                    className="absolute inset-0 rounded-lg animate-pulse bg-[#FB923C] border-4 border-[#EA580C]"
                  >
                  </div>
                  <Ticket className="absolute w-8 h-8 md:w-10 md:h-12 text-white" />
              </div>

                {/* Hero Text Section */}
                <div className="flex flex-col items-center md:items-start gap-2 md:gap-3 w-full">
                  <h2 className="text-[#EA580C] font-black text-xl md:text-3xl lg:text-4xl leading-tight text-center md:text-left uppercase">
                    Welcome to <span className="text-[#C2410C]"><GlitchText text="FHE Raffle" /></span>
                </h2>
                  <p className="text-gray-700 text-sm md:text-base lg:text-lg leading-relaxed text-center md:text-left font-bold">
                    <GlitchText text="Enter exciting raffle pools and win big with provably fair randomness!" />
                </p>
              </div>

                {/* Key Features - Compact on Mobile */}
                <div className="w-full p-3 md:p-4 bg-[#FFEDD5] rounded-lg border-4 border-[#EA580C] md:hidden">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col items-center gap-1.5 p-2 bg-white rounded-lg border-2 border-[#EA580C]">
                      <Lock className="w-4 h-4 text-[#EA580C]" />
                      <span className="text-[#EA580C] text-xs font-black text-center">FHE Encrypted</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 p-2 bg-white rounded-lg border-2 border-[#EA580C]">
                      <Zap className="w-4 h-4 text-[#EA580C]" />
                      <span className="text-[#EA580C] text-xs font-black text-center">5 Min Pools</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 p-2 bg-white rounded-lg border-2 border-[#EA580C]">
                      <Target className="w-4 h-4 text-[#EA580C]" />
                      <span className="text-[#EA580C] text-xs font-black text-center">5 Winners</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 p-2 bg-white rounded-lg border-2 border-[#EA580C]">
                      <DollarSign className="w-4 h-4 text-[#EA580C]" />
                      <span className="text-[#EA580C] text-xs font-black text-center">90% Payout</span>
                  </div>
                  </div>
                  </div>
                </div>

              {/* Right Side - How It Works and Features */}
              <div className="flex flex-col md:w-2/3 gap-3 md:gap-4 w-full">
                {/* How It Works - Horizontal Layout on Desktop */}
                <div className="flex flex-col gap-3 md:gap-4">
                  <div className="text-center md:text-left">
                    <h3 className="text-[#EA580C] font-black text-base md:text-xl lg:text-2xl uppercase"><GlitchText text="How It Works" /></h3>
                  </div>
                  
                  {/* Sections - Grid on Desktop */}
                  <div className="grid md:grid-cols-3 gap-3 md:gap-4">
                    {/* Section 1 - Pool Entry */}
                    <div className="flex flex-col gap-2 p-3 md:p-4 bg-[#FFEDD5] rounded-lg border-4 border-[#EA580C] hover:border-[#C2410C] transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 bg-[#FB923C] border-2 border-[#EA580C]">
                          <span className="text-white font-black text-sm">1</span>
                        </div>
                        <h3 className="text-[#EA580C] font-black text-sm md:text-base leading-tight"><GlitchText text="Enter Pool" /></h3>
                      </div>
                      <p className="text-gray-700 text-xs md:text-sm leading-relaxed font-bold">
                        Join a 5-minute raffle pool with just <span className="text-[#EA580C] font-black">5 MAZA tokens</span>. Each pool runs for exactly 5 minutes, then closes automatically.
                      </p>
                    </div>

                    {/* Section 2 - Winner Selection */}
                    <div className="flex flex-col gap-2 p-3 md:p-4 bg-[#FFEDD5] rounded-lg border-4 border-[#EA580C] hover:border-[#C2410C] transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 bg-[#FB923C] border-2 border-[#EA580C]">
                          <span className="text-white font-black text-sm">2</span>
                        </div>
                        <h3 className="text-[#EA580C] font-black text-sm md:text-base leading-tight"><GlitchText text="Fair Selection" /></h3>
                      </div>
                      <p className="text-gray-700 text-xs md:text-sm leading-relaxed font-bold">
                        <span className="text-[#EA580C] font-black">5 winners</span> chosen using FHE-powered cryptographic randomness. Impossible to predict or manipulate!
                      </p>
                    </div>

                    {/* Section 3 - Rewards */}
                    <div className="flex flex-col gap-2 p-3 md:p-4 bg-[#FFEDD5] rounded-lg border-4 border-[#EA580C] hover:border-[#C2410C] transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 bg-[#FB923C] border-2 border-[#EA580C]">
                          <span className="text-white font-black text-sm">3</span>
                        </div>
                        <h3 className="text-[#EA580C] font-black text-sm md:text-base leading-tight"><GlitchText text="Win & Claim" /></h3>
                      </div>
                      <p className="text-gray-700 text-xs md:text-sm leading-relaxed font-bold">
                        Winners share <span className="text-[#EA580C] font-black">90% of the pool</span>! Check past pools anytime and claim your rewards instantly.
                    </p>
                    </div>
                  </div>
                </div>

                {/* Key Features - Desktop Only */}
                <div className="hidden md:block w-full p-4 bg-[#FFEDD5] rounded-lg border-4 border-[#EA580C]">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border-2 border-[#EA580C] hover:bg-[#FB923C] transition-colors">
                      <Lock className="w-5 h-5 text-[#EA580C]" />
                      <span className="text-[#EA580C] text-xs font-black text-center">FHE Encrypted</span>
                  </div>
                    <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border-2 border-[#EA580C] hover:bg-[#FB923C] transition-colors">
                      <Zap className="w-5 h-5 text-[#EA580C]" />
                      <span className="text-[#EA580C] text-xs font-black text-center">5 Min Pools</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border-2 border-[#EA580C] hover:bg-[#FB923C] transition-colors">
                      <Target className="w-5 h-5 text-[#EA580C]" />
                      <span className="text-[#EA580C] text-xs font-black text-center">5 Winners</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border-2 border-[#EA580C] hover:bg-[#FB923C] transition-colors">
                      <DollarSign className="w-5 h-5 text-[#EA580C]" />
                      <span className="text-[#EA580C] text-xs font-black text-center">90% Payout</span>
                  </div>
                </div>
              </div>

              {/* Button Container */}
              <div className="flex flex-col gap-3 w-full">
                  {/* Enter Raffle Button */}
                <button 
                  onClick={() => setShowIntroModal(false)}
                    className="w-full h-12 md:h-14 bg-[#FB923C] text-white rounded-lg border-4 border-[#EA580C] shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none flex items-center justify-center transition-all duration-200 group font-black text-base md:text-lg"
                >
                    <span className="leading-tight flex items-center gap-2">
                      Enter Raffle Pool
                      <ArrowRight className="w-5 h-5 md:w-6 md:h-6 group-hover:translate-x-1 transition-transform" />
                    </span>
                </button>
                
                {/* Skip Button */}
                <button 
                  onClick={() => setShowIntroModal(false)}
                    className="w-full h-10 md:h-12 rounded-lg flex items-center justify-center hover:bg-[#FFEDD5] border-2 border-transparent hover:border-[#EA580C] transition-colors"
                >
                    <span className="text-[#EA580C] hover:text-[#C2410C] font-bold text-sm md:text-base underline transition-colors">
                      Skip for now
                    </span>
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="w-full bg-orange-50">
        {message && (
          <div className="mb-6 md:mb-8 mx-auto max-w-[1400px] px-4 md:px-8 pt-4 md:pt-6">
            <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-4 md:p-6 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
            <div className="flex items-center gap-3">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-[#EA580C] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
              </svg>
                <p className="text-[#EA580C] font-black text-sm md:text-base">{message}</p>
              </div>
            </div>
          </div>
        )}


        {!isConnected ? (
          <div className="flex justify-center items-center min-h-[60vh] px-4">
            <div className="bg-white border-4 border-[#EA580C] rounded-lg p-6 md:p-8 max-w-md w-full shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] text-center">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-[#FB923C] border-4 border-[#EA580C] rounded-lg flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 md:w-10 md:h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-[#EA580C] mb-3 uppercase">Connect Your Wallet</h2>
              <p className="text-gray-700 mb-6 leading-relaxed font-bold text-sm md:text-base">
                Connect your wallet to start participating in FHE-powered raffle pools on the Sepolia testnet.
              </p>
              <div className="flex justify-center w-full [&_button]:bg-[#FB923C] [&_button]:text-white [&_button]:border-4 [&_button]:border-[#EA580C] [&_button]:rounded-lg [&_button]:shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] [&_button]:font-black [&_button]:px-6 [&_button]:py-3 [&_button]:hover:translate-x-[4px] [&_button]:hover:translate-y-[4px] [&_button]:hover:shadow-none [&_button]:transition-all">
                <ConnectButton />
              </div>
              <p className="text-gray-600 text-xs md:text-sm mt-4 font-bold">
                Built on Sepolia Testnet
              </p>
            </div>
          </div>
        ) : isConnected && fhevmStatus === 'ready' ? (
          <div className="flex justify-center w-full">
              <FheRaffle 
                account={address || ''}
                chainId={chainId}
                isConnected={isConnected}
                fhevmStatus={fhevmStatus}
                onMessage={setMessage}
              />
          </div>
        ) : (
          <div className="flex justify-center items-center min-h-[60vh] px-4">
            <div className="text-center max-w-2xl mx-auto w-full">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-[#FB923C] border-4 border-[#EA580C] rounded-lg flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 md:w-10 md:h-10 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
              </div>
              
              {fhevmStatus === 'loading' && (
                <div className="mb-6">
                  <h3 className="text-lg md:text-xl font-black text-[#EA580C] mb-4 uppercase">🔐 Setting Up Secure Encryption</h3>
                  <div className="bg-white border-4 border-[#EA580C] rounded-lg p-4 md:p-6 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
                    <div className="space-y-3">
                      {fhevmDebugInfo.includes('Starting FHEVM initialization') && (
                        <div className="flex items-center gap-3 text-green-600">
                          <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                          <span className="text-sm font-bold">Initializing secure encryption...</span>
                        </div>
                      )}
                      {fhevmDebugInfo.includes('User Agent') && (
                        <div className="flex items-center gap-3 text-blue-600">
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                          <span className="text-sm font-bold">Detecting mobile browser...</span>
                        </div>
                      )}
                      {fhevmDebugInfo.includes('Window.ethereum available') && (
                        <div className="flex items-center gap-3 text-[#C2410C]">
                          <div className="w-2 h-2 bg-[#C2410C] rounded-full animate-pulse"></div>
                          <span className="text-sm font-bold">Connecting to MetaMask wallet...</span>
                        </div>
                      )}
                      {fhevmDebugInfo.includes('RelayerSDK available') && (
                        <div className="flex items-center gap-3 text-purple-600">
                          <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse"></div>
                          <span className="text-sm font-bold">Loading encryption libraries...</span>
                        </div>
                      )}
                      {fhevmDebugInfo.includes('Waiting for') && (
                        <div className="flex items-center gap-3 text-orange-600">
                          <div className="w-2 h-2 bg-orange-600 rounded-full animate-pulse"></div>
                          <span className="text-sm font-bold">Waiting for components to load...</span>
                        </div>
                      )}
                      {fhevmDebugInfo.includes('SDK initialized') && (
                        <div className="flex items-center gap-3 text-green-600">
                          <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                          <span className="text-sm font-black">Encryption libraries loaded ✅</span>
                        </div>
                      )}
                      {fhevmDebugInfo.includes('FHE instance created') && (
                        <div className="flex items-center gap-3 text-green-600">
                          <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                          <span className="text-sm font-black">Secure encryption ready ✅</span>
                        </div>
                      )}
                      {fhevmDebugInfo.includes('FHEVM initialized successfully') && (
                        <div className="flex items-center gap-3 text-green-600 font-black">
                          <div className="w-3 h-3 bg-green-600 rounded-full animate-pulse"></div>
                          <span className="text-sm">🎉 All systems ready!</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Technical details (collapsible) */}
                    <details className="mt-4">
                      <summary className="text-xs text-[#EA580C] cursor-pointer hover:text-[#C2410C] font-bold">
                        🔧 Technical Details
                      </summary>
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono mt-2 bg-[#FFEDD5] border-2 border-[#EA580C] p-3 rounded-lg">
                        {fhevmDebugInfo}
                      </pre>
                    </details>
                  </div>
                </div>
              )}
              
              {fhevmStatus === 'error' && (
                <div className="mb-6">
                  <h3 className="text-lg md:text-xl font-black text-red-600 mb-4 uppercase">⚠️ Setup Failed</h3>
                  <div className="bg-red-100 border-4 border-red-600 rounded-lg p-4 md:p-6 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-6 h-6 bg-red-600 border-2 border-[#EA580C] rounded-lg flex items-center justify-center">
                        <span className="text-white text-sm font-black">!</span>
                      </div>
                      <div>
                        <p className="text-red-800 font-black">Unable to initialize secure encryption</p>
                        <p className="text-red-700 text-sm font-bold">This usually happens on mobile browsers</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm text-red-800 font-bold">
                      <p>• Make sure MetaMask is installed and connected</p>
                      <p>• Try refreshing the page after connecting</p>
                      <p>• Check your internet connection</p>
                    </div>
                    
                    {/* Technical details (collapsible) */}
                    <details className="mt-4">
                      <summary className="text-xs text-red-700 cursor-pointer hover:text-red-800 font-black">
                        🔧 Technical Error Details
                      </summary>
                      <pre className="text-xs text-red-800 whitespace-pre-wrap font-mono mt-2 bg-red-50 border-2 border-red-600 p-3 rounded-lg">
                        {fhevmDebugInfo || 'Unknown error occurred'}
                      </pre>
                    </details>
                  </div>
                  
                  <div className="flex flex-col gap-3 mt-4">
                    <button 
                      onClick={initializeFhevm}
                      className="px-6 py-3 bg-[#FB923C] text-white border-4 border-[#EA580C] rounded-lg shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none font-black transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      Try Again
                    </button>
                    <button 
                      onClick={() => window.location.reload()}
                      className="px-6 py-3 bg-gray-300 text-gray-700 border-4 border-[#EA580C] rounded-lg shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none font-black transition-all flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      Refresh Page
                    </button>
                  </div>
                </div>
              )}
              
              {fhevmStatus === 'idle' && (
                <div className="bg-white border-4 border-[#8B6F47] rounded-lg p-6 md:p-8 shadow-[4px_4px_0px_0px_rgba(139,111,71,0.8)]">
                  <h2 className="text-xl md:text-2xl font-black text-[#8B6F47] mb-3 uppercase">Initializing FHE</h2>
                  <p className="text-gray-700 font-bold">
                    Setting up secure encryption for your raffle pools...
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Main App component with providers
function App() {
  return (
    <WagmiConfig config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={lightTheme({
            accentColor: '#FB923C',
            accentColorForeground: 'white',
            borderRadius: 'large',
            overlayBlur: 'small',
          })}
        >
          <AppContent />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiConfig>
  );
}

export default App;
