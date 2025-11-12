import { useState } from 'react';
import { ethers } from 'ethers';
import { publicDecrypt } from '../lib/fhevm';
import DrawAnimation from './DrawAnimation';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';

  // Contract configuration
  const CONTRACT_ADDRESSES = {
    31337: import.meta.env.VITE_CONTRACT_ADDRESS_LOCALHOST || '0x4a44ab6Ab4EC21C31fca2FC25B11614c9181e1DF', // Local Hardhat
    11155111: import.meta.env.VITE_CONTRACT_ADDRESS_SEPOLIA || '0x1b5eb8a4c52acf68ACcf773B58a40120295E48ea', // Sepolia
  }

const CONTRACT_ABI = [
  // Coin Toss Functions
  {
    inputs: [],
    name: "tossCoin",
    outputs: [{ internalType: "ebool", name: "", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tossId", type: "uint256" }],
    name: "requestTossReveal",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getTossCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tossId", type: "uint256" }],
    name: "getToss",
    outputs: [
      { internalType: "address", name: "tosser", type: "address" },
      { internalType: "uint256", name: "timestamp", type: "uint256" },
      { internalType: "bool", name: "revealed", type: "bool" },
      { internalType: "bool", name: "result", type: "bool" }
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tossId", type: "uint256" }],
    name: "getEncryptedResult",
    outputs: [{ internalType: "ebool", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  // Draw Lots Functions
  {
    inputs: [{ internalType: "string[]", name: "_entries", type: "string[]" }],
    name: "createDraw",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "drawId", type: "uint256" },
      { internalType: "uint256", name: "decryptedIndex", type: "uint256" }
    ],
    name: "revealWinner",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "drawId", type: "uint256" }],
    name: "getDraw",
    outputs: [
      { internalType: "address", name: "creator", type: "address" },
      { internalType: "uint256", name: "timestamp", type: "uint256" },
      { internalType: "string[]", name: "entries", type: "string[]" },
      { internalType: "bool", name: "revealed", type: "bool" },
      { internalType: "uint256", name: "winnerIndex", type: "uint256" },
      { internalType: "string", name: "winnerName", type: "string" }
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "drawId", type: "uint256" }],
    name: "getEncryptedWinnerIndex",
    outputs: [{ internalType: "euint8", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getDrawCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "tossId", type: "uint256" },
      { indexed: true, internalType: "address", name: "tosser", type: "address" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" }
    ],
    name: "CoinTossed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "tossId", type: "uint256" },
      { indexed: false, internalType: "bool", name: "result", type: "bool" }
    ],
    name: "TossRevealed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "drawId", type: "uint256" },
      { indexed: true, internalType: "address", name: "creator", type: "address" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" }
    ],
    name: "DrawCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "drawId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "winnerIndex", type: "uint256" },
      { indexed: false, internalType: "string", name: "winnerName", type: "string" }
    ],
    name: "WinnerRevealed",
    type: "event",
  }
];

interface FheCoinTossProps {
  account: string;
  chainId: number;
  isConnected: boolean;
  fhevmStatus: 'idle' | 'loading' | 'ready' | 'error';
  onMessage: (message: string) => void;
}

// interface TossResult {
//   tosser: string;
//   timestamp: number;
//   revealed: boolean;
//   result: boolean;
// }

interface DrawResult {
  creator: string;
  timestamp: number;
  entries: string[];
  revealed: boolean;
  winnerIndex: number;
  winnerName: string;
}

export default function FheCoinToss({ account, chainId, isConnected, fhevmStatus, onMessage }: FheCoinTossProps) {
  // Coin Toss State (commented out for now)
  // const [tossCount, setTossCount] = useState<number>(0);
  // const [tossResult, setTossResult] = useState<TossResult | null>(null);
  // const [isProcessing, setIsProcessing] = useState(false);
  // const [coinAnimation, setCoinAnimation] = useState(false);

  // Draw Lots State
  const [drawCount, setDrawCount] = useState<number>(0);
  const [drawResult, setDrawResult] = useState<DrawResult | null>(null);
  const [isDrawProcessing, setIsDrawProcessing] = useState(false);
  const [entries, setEntries] = useState<string[]>([]);
  const [newEntry, setNewEntry] = useState<string>('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  // const [currentDrawId, setCurrentDrawId] = useState<number | null>(null);
  
  // Animation State
  const [showDrawAnimation, setShowDrawAnimation] = useState(false);
  const [animationWinner, setAnimationWinner] = useState<string>('');

  const contractAddress = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES] || 'Not supported chain';

  // Get toss count (commented out for now)
  // const getTossCount = async () => {
  //   if (!isConnected || !contractAddress || !window.ethereum) return;
  //   
  //   try {
  //     onMessage('Getting toss count...');
  //     const provider = new ethers.BrowserProvider(window.ethereum as any);
  //     const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);
  //     const count = await contract.getTossCount();
  //     setTossCount(Number(count));
  //     onMessage('Toss count retrieved!');
  //     setTimeout(() => onMessage(''), 3000);
  //   } catch (error) {
  //     console.error('Get toss count failed:', error);
  //     onMessage('Failed to get toss count');
  //   }
  // };

  // Mobile-friendly transaction receipt polling helper
  const waitForTransactionReceipt = async (
    provider: ethers.BrowserProvider,
    txHash: string,
    timeout: number = 120000
  ): Promise<ethers.ContractTransactionReceipt> => {
    const startTime = Date.now();
    const pollInterval = 2000; // Poll every 2 seconds
    
    while (Date.now() - startTime < timeout) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          console.log('✅ Transaction receipt found via polling');
          return receipt as ethers.ContractTransactionReceipt;
        }
      } catch (error) {
        console.log('⏳ Still waiting for transaction receipt...');
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error('Transaction receipt polling timeout');
  };

  // Get draw count
  const getDrawCount = async () => {
    if (!isConnected || !contractAddress) {
      onMessage('Please connect your wallet first');
      return;
    }
    
    // Enhanced mobile browser ethereum detection
    let ethereum = window.ethereum;
    
    if (!ethereum) {
      // Check for ethereum in different locations (mobile browsers often inject differently)
      const possibleProviders = [
        window.ethereum,
        (window as any).web3?.currentProvider,
        (window as any).web3,
        window.ethereum?.providers?.[0],
        window.ethereum?.providers?.find((p: any) => p.isMetaMask),
        // Check for mobile wallet providers
        (window as any).trust,
        (window as any).coinbase,
        (window as any).phantom,
      ].filter(Boolean);
      
      if (possibleProviders.length > 0) {
        ethereum = possibleProviders[0];
        console.log('✅ Found ethereum provider in alternative location');
      }
    }
    
    if (!ethereum) {
      onMessage('Ethereum provider not found. Please ensure MetaMask is installed and connected, then refresh the page.');
      console.log('❌ No ethereum provider found. Available window properties:', 
        Object.keys(window).filter(k => k.toLowerCase().includes('eth') || k.toLowerCase().includes('web3')));
      return;
    }
    
    try {
      onMessage('Getting draw count...');
      console.log('🔍 Mobile Debug - Getting draw count...');
      console.log('📱 User Agent:', navigator.userAgent);
      console.log('🌐 Window.ethereum available:', !!window.ethereum);
      console.log('🔗 Contract Address:', contractAddress);
      
      const provider = new ethers.BrowserProvider(ethereum as any);
      console.log('✅ Provider created successfully');
      
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, provider);
      console.log('✅ Contract created successfully');
      
      const count = await contract.getDrawCount();
      console.log('✅ Draw count retrieved:', count.toString());
      
      setDrawCount(Number(count));
      onMessage('Draw count retrieved!');
      setTimeout(() => onMessage(''), 3000);
    } catch (error: any) {
      console.error('❌ Get draw count failed:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        reason: error.reason,
        data: error.data
      });
      
      if (error.message?.includes('user rejected') || error.message?.includes('User rejected')) {
        onMessage('Transaction rejected by user');
      } else if (error.message?.includes('network') || error.message?.includes('Network')) {
        onMessage('Network error. Please check your connection.');
      } else if (error.message?.includes('provider') || error.message?.includes('Provider')) {
        onMessage('Provider error. Please refresh the page.');
      } else {
        onMessage(`Failed to get draw count: ${error.message}`);
      }
    }
  };

  // Add entry to draw
  const addEntry = () => {
    if (newEntry.trim() && entries.length < 5) {
      setEntries([...entries, newEntry.trim()]);
      setNewEntry('');
    }
  };

  // Remove entry from draw
  const removeEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  // Handle animation completion - close animation and reset
  const handleAnimationComplete = () => {
    console.log('🎬 Animation complete - closing overlay');
    // Reset all animation state
    setShowDrawAnimation(false);
    setAnimationWinner('');
    // Clear any pending states
    setTimeout(() => {
      setAnimationWinner('');
    }, 100);
  };

  // Handle transaction rejection
  const handleTransactionRejected = () => {
    setShowDrawAnimation(false);
    setAnimationWinner('');
    setIsDrawProcessing(false);
    onMessage('Transaction rejected');
  };

  // Create draw and reveal winner automatically
  const createDraw = async () => {
    if (!isConnected || !contractAddress) {
      onMessage('Please connect your wallet first');
      return;
    }
    
    // Enhanced mobile browser ethereum detection
    let ethereum = window.ethereum;
    
    if (!ethereum) {
      // Check for ethereum in different locations (mobile browsers often inject differently)
      const possibleProviders = [
        window.ethereum,
        (window as any).web3?.currentProvider,
        (window as any).web3,
        window.ethereum?.providers?.[0],
        window.ethereum?.providers?.find((p: any) => p.isMetaMask),
        // Check for mobile wallet providers
        (window as any).trust,
        (window as any).coinbase,
        (window as any).phantom,
      ].filter(Boolean);
      
      if (possibleProviders.length > 0) {
        ethereum = possibleProviders[0];
        console.log('✅ Found ethereum provider in alternative location');
      }
    }
    
    if (!ethereum) {
      onMessage('Ethereum provider not found. Please ensure MetaMask is installed and connected, then refresh the page.');
      console.log('❌ No ethereum provider found. Available window properties:', 
        Object.keys(window).filter(k => k.toLowerCase().includes('eth') || k.toLowerCase().includes('web3')));
      return;
    }
    
    if (entries.length === 0) {
      onMessage('Please add at least one entry');
      return;
    }
    
    try {
      setIsDrawProcessing(true);
      setShowDrawAnimation(true);
      
      // Start animation immediately when button is clicked
      setShowDrawAnimation(true);
      onMessage('Creating draw with FHE randomness...');
      
      console.log('🔍 Mobile Debug - Creating draw...');
      console.log('📱 User Agent:', navigator.userAgent);
      console.log('🌐 Window.ethereum available:', !!window.ethereum);
      console.log('🔗 Contract Address:', contractAddress);
      console.log('📝 Entries:', entries);
      
      const provider = new ethers.BrowserProvider(ethereum as any);
      console.log('✅ Provider created successfully');
      
      const signer = await provider.getSigner();
      console.log('✅ Signer obtained:', await signer.getAddress());
      
      const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);
      console.log('✅ Contract created successfully');
      
      onMessage('Generating encrypted random winner index...');
      console.log('🎲 Calling contract.createDraw()...');
      const tx = await contract.createDraw(entries);
      console.log('📝 Transaction hash:', tx.hash);
      
      onMessage('Waiting for confirmation...');
      
      // Mobile-friendly transaction confirmation with polling fallback
      let receipt;
      
      // Set up visibility change listener for mobile browsers (when user switches to MetaMask app)
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          console.log('📱 Page became visible again - checking transaction status...');
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      try {
        // Try the standard wait() method first (works on desktop)
        console.log('⏳ Waiting for transaction confirmation (standard method)...');
        receipt = await Promise.race([
          tx.wait(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction wait timeout')), 120000) // 2 minute timeout
          )
        ]);
        console.log('✅ Transaction confirmed via standard wait()');
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      } catch (waitError: any) {
        // Fallback to manual polling (better for mobile browsers)
        console.log('📱 Standard wait() failed, using polling fallback:', waitError.message);
        console.log('🔄 Polling for transaction receipt...');
        onMessage('Confirming transaction (mobile mode)...');
        
        try {
          receipt = await waitForTransactionReceipt(provider, tx.hash, 120000); // 2 minute timeout
          console.log('✅ Transaction confirmed via polling');
        } catch (pollError: any) {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          throw pollError;
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      
      // Get the draw ID from the event
      let drawId: number | null = null;
      
      const event = receipt.logs?.find((log: any) => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed?.name === 'DrawCreated';
        } catch {
          return false;
        }
      });
      
      if (event) {
        const parsed = contract.interface.parseLog(event);
        drawId = Number(parsed?.args.drawId);
        console.log('✅ Draw ID found from event:', drawId);
      } else {
        // Fallback: Get the latest draw ID from the contract (for mobile browsers where events might not be parsed correctly)
        console.log('⚠️ Event not found in receipt, trying fallback method...');
        try {
          const latestDrawCount = await contract.getDrawCount();
          drawId = Number(latestDrawCount) - 1; // Latest draw is count - 1 (0-indexed)
          console.log('✅ Draw ID found via fallback (latest draw count):', drawId);
        } catch (fallbackError) {
          console.error('❌ Could not get draw ID via fallback:', fallbackError);
          onMessage('Could not determine draw ID. Please refresh and check your transaction.');
          throw new Error('Could not determine draw ID from transaction');
        }
      }
      
      if (drawId !== null && drawId >= 0) {
        // setCurrentDrawId(drawId);
        
        // Since the result is now publicly decryptable, decrypt it immediately
        onMessage('Decrypting winner index immediately...');
        console.log('📞 Calling contract.getEncryptedWinnerIndex() for drawId:', drawId);
        const encryptedWinnerIndex = await contract.getEncryptedWinnerIndex(drawId);
        console.log('📞 Contract returned encrypted winner index:', encryptedWinnerIndex);
        
        // Log the encrypted result (ciphertext)
        console.log('🔐 Encrypted Winner Index (Ciphertext):', encryptedWinnerIndex);
        console.log('📦 Encrypted Winner Index Type:', typeof encryptedWinnerIndex);
        console.log('📏 Encrypted Winner Index Length:', encryptedWinnerIndex?.length);
        
        const decryptedIndex = await publicDecrypt(encryptedWinnerIndex);
        
        // Log the decrypted result
        console.log('🔓 Decrypted Winner Index:', decryptedIndex);
        console.log('📊 Decrypted Winner Index Type:', typeof decryptedIndex);
        console.log('🎯 Number Conversion:', Number(decryptedIndex));
        
        // Calculate winner directly (no need for revealWinner transaction)
        const winnerIndex = Number(decryptedIndex) % entries.length;
        const winnerName = entries[winnerIndex];
        
        // Set the winner for the animation (animation is already running)
        setAnimationWinner(winnerName);
        
        // Set result directly (no blockchain transaction needed)
        // Use the entries that were actually used in the draw (before they might be cleared)
        const drawEntries = [...entries]; // Create a copy of entries at draw time
        setDrawResult({
          creator: account,
          timestamp: Math.floor(Date.now() / 1000),
          entries: drawEntries, // Use the actual entries from the draw
          revealed: true,
          winnerIndex: winnerIndex,
          winnerName: winnerName
        });
        
        onMessage(`Winner: ${winnerName}!`);
        
        // Summary log
        console.log('🎯 === DRAW LOTS SUMMARY ===');
        console.log('🎲 Draw ID:', drawId);
        console.log('📝 Entries:', entries);
        console.log('🔐 Encrypted Index (Ciphertext):', encryptedWinnerIndex);
        console.log('🔓 Decrypted Index (Plaintext):', decryptedIndex);
        console.log('🏆 Winner Index:', winnerIndex);
        console.log('🏆 Winner Name:', winnerName);
        console.log('🎯 === END SUMMARY ===');
      } else {
        throw new Error('Invalid draw ID');
      }
      
      // Update draw count
      await getDrawCount();
      
      // Don't hide animation immediately - let result screen show
      // The result screen will handle closing via onAnimationComplete
    } catch (error: any) {
      console.error('❌ Draw creation failed:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        reason: error.reason,
        data: error.data
      });
      
      setShowDrawAnimation(false);
      
      // Handle different types of errors
      if (error.message?.includes('rejected') || error.message?.includes('denied') || error.message?.includes('User rejected')) {
        handleTransactionRejected();
        return;
      } else if (error.message?.includes('network') || error.message?.includes('Network')) {
        onMessage('Network error. Please check your connection.');
      } else if (error.message?.includes('provider') || error.message?.includes('Provider')) {
        onMessage('Provider error. Please refresh the page.');
      } else if (error.message?.includes('insufficient funds') || error.message?.includes('gas')) {
        onMessage('Insufficient funds for gas. Please add ETH to your wallet.');
      } else {
        onMessage(`Draw creation failed: ${error.message}`);
      }
    } finally {
      setIsDrawProcessing(false);
    }
  };


  if (!isConnected || fhevmStatus !== 'ready') {
    return null;
  }

  return (
    <>
      {/* Draw Animation Overlay */}
      {showDrawAnimation && (
        <DrawAnimation
          entries={entries}
          winnerName={animationWinner}
          isAnimating={showDrawAnimation}
          onAnimationComplete={handleAnimationComplete}
          onTransactionRejected={handleTransactionRejected}
        />
      )}
      
      {/* Main Content - Matching extracted HomeScreenDraw design exactly */}
      <div className="flex flex-col items-center px-5 py-6 gap-6 max-w-[393px] mx-auto">
        {/* Title Section - Matching extracted design with shield icon */}
        <div className="flex flex-col items-center gap-4 w-full">
          {/* Shield Icon - Yellow outline with three stacked rectangles */}
          <div className="relative w-12 h-12">
            <svg className="w-full h-full" viewBox="0 0 48 48" fill="none">
              {/* Bottom rectangle */}
              <rect x="5.94" y="21.35" width="36.13" height="18.86" rx="2.23" stroke="#FFEB3A" strokeWidth="2.79" fill="none"/>
              {/* Middle rectangle */}
              <rect x="9.79" y="14.57" width="28.43" height="6.78" stroke="#FFEB3A" strokeWidth="2.79" fill="none"/>
              {/* Top rectangle */}
              <rect x="14.44" y="7.79" width="19.13" height="6.78" stroke="#FFEB3A" strokeWidth="2.79" fill="none"/>
            </svg>
          </div>
          
          {/* Text - Matching extracted font styles */}
          <div className="flex flex-col items-center gap-3 w-full">
            <h2 className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-bold text-white text-2xl leading-[140%] text-center tracking-[0]">
              FHE Draw Lots
            </h2>
            <p className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-normal text-[#9DA3AF] text-sm leading-[140%] text-center tracking-[0]">
              Truly random draws using FHE
            </p>
          </div>
        </div>

        {/* Card - Total Draws - Matching extracted design exactly (353px width, 331px height, 24px border-radius) */}
        <div className="w-full max-w-[353px] border border-solid border-[#333333] rounded-[24px] relative overflow-hidden">
          {/* Yellow Top Section - Matching extracted design exactly (pt-3 pb-16 px-6) */}
          <div className="bg-[#FEE339] rounded-t-[24px] flex flex-row justify-center items-center gap-2 pt-3 pb-16 px-6">
            <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-bold text-black text-sm leading-[120%] tracking-[0]">
              Total Draws
            </span>
            <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center">
              <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-bold text-black text-sm leading-[120%] tracking-[0]">
                {drawCount}
              </span>
            </div>
          </div>
          
          {/* Container - Matching extracted design with smooth rounded corners */}
          <div className="bg-[#1A1A1A] rounded-t-[24px] p-6 flex flex-col items-center gap-6 relative mt-[-52px]">
            {/* Draw Result Display - Positioned at top as per design */}
            {drawResult && (
              <div className="flex flex-col items-center w-full max-w-[305px] p-4 rounded-2xl bg-gradient-to-b from-[#F5A733] via-[#F5A733] to-[#FFEB3A]">
                <div className="flex flex-row justify-center items-center gap-3 w-full">
                  <div className="flex flex-col justify-center items-center gap-2 flex-1">
                    {/* Winner name in white rounded box */}
                    <div className="flex flex-row justify-center items-center px-4 py-2 gap-2.5 bg-white rounded-xl">
                      <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-semibold text-black text-base leading-[140%] text-center">
                        {drawResult.winnerName}
                      </span>
                    </div>
                    {/* Winner of X entries */}
                    <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-semibold text-black text-sm leading-[120%] text-center">
                      Winner of {drawResult.entries.length} entries
                    </span>
                    {/* Date and time */}
                    <div className="flex flex-row items-center gap-2">
                      <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-normal text-black text-xs leading-[120%]">
                        {new Date(drawResult.timestamp * 1000).toLocaleDateString()}
                      </span>
                      <div className="w-0 h-3.5 border border-black border-opacity-30 rotate-90" />
                      <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-normal text-black text-xs leading-[120%]">
                        {new Date(drawResult.timestamp * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Text-field - Matching extracted HomeScreen design exactly */}
            <div className="flex flex-col items-start gap-3 w-full">
              <div className="flex flex-col items-start gap-3 w-full">
                <label className="relative self-stretch mt-[-1.00px] [font-family:'Plus_Jakarta_Sans',Helvetica] font-medium text-white text-sm tracking-[0] leading-[16.8px]">
                  Enter name/ word
                </label>

                <div className="flex flex-col items-start gap-2 w-full">
                  {/* Input Container - Matching extracted design exactly */}
                  <div 
                    className={`flex h-12 items-center justify-between pl-4 pr-2.5 py-2.5 w-full bg-black rounded-xl border border-solid transition-all ${
                      isInputFocused ? 'border-[#FEE339]' : 'border-[#333333]'
                    }`}
                    style={isInputFocused ? { boxShadow: '0px 0px 0px 3px rgba(254, 227, 57, 0.1)' } : {}}
                  >
                    <div className="flex items-center gap-2.5 relative flex-1 self-stretch grow">
                      <input
                        type="text"
                        value={newEntry}
                        onChange={(e) => setNewEntry(e.target.value)}
                        placeholder="Enter an item to draw"
                        onKeyPress={(e) => e.key === 'Enter' && addEntry()}
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={() => setIsInputFocused(false)}
                        className="relative w-full [font-family:'Plus_Jakarta_Sans',Helvetica] font-normal text-white text-[13px] md:text-[13px] tracking-[0] leading-[15.6px] bg-transparent border-0 h-auto p-0 focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-[#9da3af] focus:outline-none"
                      />
                    </div>

                    <button
                      onClick={addEntry}
                      disabled={!newEntry.trim() || entries.length >= 5}
                      className="inline-flex h-[34px] items-center justify-center gap-2.5 px-4 py-3 bg-[#fee339] rounded-[100px] hover:bg-[#fee339]/90 disabled:opacity-50 disabled:cursor-not-allowed mt-[-3.00px] mb-[-3.00px]"
                    >
                      <span className="relative w-fit mt-[-4.20px] mb-[-1.80px] [font-family:'Plus_Jakarta_Sans',Helvetica] font-semibold text-black text-[13px] text-center tracking-[0] leading-[15.6px] whitespace-nowrap">
                        Add
                      </span>
                    </button>
                  </div>

                  {/* Helper Text - Matching extracted design */}
                  <div className="flex items-center gap-2.5 w-full">
                    <p className="relative w-fit mt-[-1.00px] [font-family:'Plus_Jakarta_Sans',Helvetica] font-normal text-[#9da3af] text-xs text-center tracking-[0] leading-[14.4px] whitespace-nowrap">
                      Max 5 entries
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Entries List - Tags - Matching extracted design exactly */}
            {entries.length > 0 && (
              <div className="flex flex-wrap gap-[8px_8px] w-full items-center">
                {entries.map((entry, index) => (
                  <div 
                    key={index} 
                    className="inline-flex h-9 gap-2 pl-3 pr-2 py-0 bg-[#0A0A0A] rounded-3xl border border-solid border-[#5f5928] items-center hover:bg-[#0A0A0A]"
                  >
                    <span className="relative w-fit mt-[-1.00px] [font-family:'Plus_Jakarta_Sans',Helvetica] font-medium text-white text-[13px] text-center tracking-[0] leading-[15.6px] whitespace-nowrap">
                      {entry}
                    </span>
                    <button
                      onClick={() => removeEntry(index)}
                      className="relative w-5 h-5 p-0 hover:bg-transparent flex items-center justify-center"
                    >
                      <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="none">
                        <path 
                          d="M5 5L15 15M15 5L5 15" 
                          stroke="currentColor" 
                          strokeWidth="1.2" 
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Button Container */}
            <div className="flex flex-col items-center gap-3 w-full">
              {/* Create Draw Button */}
              <button
                onClick={createDraw}
                disabled={isDrawProcessing || entries.length === 0}
                className={`w-full h-12 rounded-full flex items-center justify-center ${
                  isDrawProcessing || entries.length === 0
                    ? 'bg-[#5A542E]'
                    : 'bg-[#FEE339]'
                }`}
              >
                {isDrawProcessing ? (
                  <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-bold text-black text-sm leading-[120%] tracking-[0]">
                    Creating...
                  </span>
                ) : (
                  <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-bold text-black text-sm leading-[120%] tracking-[0]">
                    Create Draw
                  </span>
                )}
              </button>

              {/* Refresh Count Button */}
              <button 
                onClick={getDrawCount} 
                className="flex flex-row items-center justify-center gap-2 px-6 py-3 bg-[#2A2A2A] border border-[#FEE339] rounded-full"
              >
                <svg className="w-6 h-6" fill="none" stroke="#FEE339" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-medium text-[#FEE339] text-sm leading-[120%] tracking-[0]">
                  Refresh Count
                </span>
              </button>
            </div>
          </div>
        </div>


        {/* FAQ Section - Matching extracted HelpSection design with Accordion */}
        <section className="flex flex-col w-full max-w-[353px] items-center gap-6 p-6 bg-[#1a1a1a] rounded-3xl overflow-hidden border border-solid border-[#333333] mx-auto">
          <header className="flex items-center justify-center gap-2.5 w-full">
            <h2 className="flex-1 [font-family:'Plus_Jakarta_Sans',Helvetica] font-bold text-white text-base tracking-[0] leading-[19.2px]">
              How FHE Draw Lots Works
            </h2>
          </header>

          <Accordion
            type="multiple"
            className="w-full flex flex-col gap-4"
          >
            <AccordionItem
              value="item-1"
              className="w-full border-none pb-4 border-b border-solid border-[#393b3c]"
            >
              <AccordionTrigger className="flex items-center justify-between w-full hover:no-underline py-0 bg-transparent">
                <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-semibold text-white text-sm tracking-[0] leading-[19.6px] whitespace-nowrap">
                  FHE Random Generation
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-0">
                <p className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-normal text-gray-300 text-sm tracking-[0] leading-[18.2px]">
                  Uses FHE.randEuint8() to generate truly random encrypted winner indices on-chain.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-2"
              className="w-full border-none pb-4 border-b border-solid border-[#393b3c]"
            >
              <AccordionTrigger className="flex items-center justify-between w-full hover:no-underline py-0 bg-transparent">
                <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-semibold text-white text-sm tracking-[0] leading-[19.6px] whitespace-nowrap">
                  Automatic Decryption
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-0">
                <p className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-normal text-gray-300 text-sm tracking-[0] leading-[18.2px]">
                  Results are automatically decrypted and displayed immediately after drawing.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-3"
              className="w-full border-none pb-4 border-b border-solid border-[#393b3c]"
            >
              <AccordionTrigger className="flex items-center justify-between w-full hover:no-underline py-0 bg-transparent">
                <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-semibold text-white text-sm tracking-[0] leading-[19.6px] whitespace-nowrap">
                  Transparent
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-0">
                <p className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-normal text-gray-300 text-sm tracking-[0] leading-[18.2px]">
                  Anyone can verify results by decrypting the stored ciphertext on the blockchain.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem
              value="item-4"
              className="w-full border-none"
            >
              <AccordionTrigger className="flex items-center justify-between w-full hover:no-underline py-0 bg-transparent">
                <span className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-semibold text-white text-sm tracking-[0] leading-[19.6px] whitespace-nowrap">
                  Instant Results
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-0">
                <p className="[font-family:'Plus_Jakarta_Sans',Helvetica] font-normal text-gray-300 text-sm tracking-[0] leading-[18.2px]">
                  No waiting required - winners are shown immediately after the transaction confirms.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      </div>
    </>
  );
}
