import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { publicDecryptWithProof } from '../lib/fhevm';
import { ToastContainer, useToast } from './Toast';
import { RAFFLE_ABI } from '../lib/abis/Raffle';
import { ERC20_ABI } from '../lib/abis/ERC20';
import RaffleDrawAnimation from './RaffleDrawAnimation';
import ClaimConfetti from './ClaimConfetti';
import { Clock, Users, Trophy, Ticket, Crown, AlertCircle, CheckCircle2, Loader2, HelpCircle, X } from 'lucide-react';

// Contract configuration - Sepolia only
const CONTRACT_ADDRESS = import.meta.env.VITE_RAFFLE_CONTRACT_ADDRESS_SEPOLIA || '';

interface FheRaffleProps {
  account: string;
  chainId: number;
  isConnected: boolean;
  fhevmStatus: 'idle' | 'loading' | 'ready' | 'error';
  onMessage: (message: string) => void;
}

interface PoolData {
  poolId: number;
  startTime: bigint;
  endTime: bigint;
  totalEntries: bigint;
  totalAmount: bigint;
  isClosed: boolean;
  winnersDrawn: boolean;
  participantCount: bigint;
}

interface WinnerData {
  address: string;
  percentage: bigint;
  reward: bigint;
  claimed: boolean;
}

interface PastPoolData extends PoolData {
  winners?: WinnerData[];
  userWinnerInfo?: { isWinner: boolean; reward: bigint; claimed: boolean };
  revealedRandomSeed?: bigint;
  randomSeedHandle?: string;
}

export default function FheRaffle({ account, chainId, isConnected, fhevmStatus }: FheRaffleProps) {
  const { toasts, addToast, removeToast, updateToast } = useToast();
  const [contractAddress, setContractAddress] = useState<string>('');
  const [mazaTokenAddress, setMazaTokenAddress] = useState<string>('');
  const [entryFee, setEntryFee] = useState<string>('0');
  const [currentPoolId, setCurrentPoolId] = useState<number>(0);
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [winners, setWinners] = useState<WinnerData[]>([]);
  const [pastPools, setPastPools] = useState<PastPoolData[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [mazaBalance, setMazaBalance] = useState<string>('0');
  const [mazaAllowance, setMazaAllowance] = useState<string>('0');
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(true); // Start as true to prevent showing insufficient before load
  const [hasLoadedBalanceOnce, setHasLoadedBalanceOnce] = useState<boolean>(false);
  const [isLoadingDrawnPools, setIsLoadingDrawnPools] = useState<boolean>(true); // Start as true to show skeleton on initial load
  const [hasLoadedDrawnPoolsOnce, setHasLoadedDrawnPoolsOnce] = useState<boolean>(false); // Track if pools have been loaded at least once
  const [isLoadingPoolData, setIsLoadingPoolData] = useState<boolean>(true); // Track initial pool data loading
  const [showFAQ, setShowFAQ] = useState<boolean>(false);
  const [showClaimConfetti, setShowClaimConfetti] = useState<boolean>(false);
  const [isEntering, setIsEntering] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isDrawingWinners, setIsDrawingWinners] = useState<boolean>(false);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [userWinnerInfo, setUserWinnerInfo] = useState<{ isWinner: boolean; reward: bigint; claimed: boolean } | null>(null);
  const [hasEnteredCurrentPool, setHasEnteredCurrentPool] = useState<boolean>(false);
  const [showPastPools, setShowPastPools] = useState<boolean>(true); // Show by default
  const [expandedPoolId, setExpandedPoolId] = useState<number | null>(null);
  const [showDrawAnimation, setShowDrawAnimation] = useState<boolean>(false);
  const [participantAddresses, setParticipantAddresses] = useState<string[]>([]);
  const toastShownRef = useRef<number | null>(null);
  const [ethereumProvider, setEthereumProvider] = useState<any>(null);

  // Helper function to truncate address
  const truncateAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Helper function to format percentage
  const formatPercentage = (percentage: bigint) => {
    // Percentage is in basis points (e.g., 2000 = 20%)
    return (Number(percentage) / 100).toFixed(1);
  };

  // Detect ethereum provider with mobile support
  useEffect(() => {
    const detectProvider = () => {
      // Check for ethereum provider in various locations (mobile compatibility)
      const providers = [
        (window as any).ethereum,
        (window as any).ethereum?.providers?.[0],
        (window as any).ethereum?.providers?.find((p: any) => p.isMetaMask),
        (window as any).web3?.currentProvider,
      ].filter(Boolean);

      if (providers.length > 0) {
        setEthereumProvider(providers[0]);
      } else {
        // Retry detection for mobile browsers
        const retry = setTimeout(() => {
          const retryProviders = [
            (window as any).ethereum,
            (window as any).ethereum?.providers?.[0],
            (window as any).ethereum?.providers?.find((p: any) => p.isMetaMask),
          ].filter(Boolean);
          if (retryProviders.length > 0) {
            setEthereumProvider(retryProviders[0]);
          }
        }, 1000);
        return () => clearTimeout(retry);
      }
    };

    detectProvider();
    
    // Listen for provider injection (mobile browsers)
    const checkInterval = setInterval(() => {
      if (!ethereumProvider && (window as any).ethereum) {
        detectProvider();
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [ethereumProvider]);

  // Initialize contract address - Sepolia only
  useEffect(() => {
    if (CONTRACT_ADDRESS && CONTRACT_ADDRESS !== '') {
      setContractAddress(CONTRACT_ADDRESS);
      toastShownRef.current = null; // Reset when address is found
    } else if (chainId === 11155111 && toastShownRef.current !== chainId) {
      // Only show toast once for Sepolia
      toastShownRef.current = chainId;
      addToast('Raffle contract address not configured. Please set VITE_RAFFLE_CONTRACT_ADDRESS_SEPOLIA in .env', 'warning');
    }
  }, [chainId, addToast]);

  // Load contract data with real-time updates
  const loadContractData = useCallback(async () => {
    if (!contractAddress) {
      return;
    }

    const ethereum = ethereumProvider || (window as any).ethereum;
    if (!ethereum) {
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const contract = new ethers.Contract(contractAddress, RAFFLE_ABI, provider);

      // Get current pool ID
      const poolId = await contract.getCurrentPoolId();
      setCurrentPoolId(Number(poolId));

      // Get pool data
      const pool = await contract.getPool(poolId);
      setIsLoadingPoolData(false);
      setPoolData({
        poolId: Number(poolId),
        startTime: pool.startTime,
        endTime: pool.endTime,
        totalEntries: pool.totalEntries,
        totalAmount: pool.totalAmount,
        isClosed: pool.isClosed,
        winnersDrawn: pool.winnersDrawn,
        participantCount: pool.participantCount,
      });

      // Get entry fee
      const fee = await contract.ENTRY_FEE();
      setEntryFee(ethers.formatEther(fee));

      // Get MAZA token address
      const tokenAddr = await contract.mazaToken();
      setMazaTokenAddress(tokenAddr);

      // Check if user is owner
      const ownerAddr = await contract.owner();
      setIsOwner(ownerAddr.toLowerCase() === account.toLowerCase());

      // Check if user has already entered this pool
      if (account) {
        try {
          const hasEntered = await contract.hasEnteredPool(poolId, account);
          setHasEnteredCurrentPool(hasEntered);
        } catch (error) {
          // Function might not exist in older contracts, default to false
          setHasEnteredCurrentPool(false);
        }
      } else {
        setHasEnteredCurrentPool(false);
      }

      // Load MAZA balance and allowance (only on first load, skip in periodic updates)
      // Balance is loaded separately on initial mount, not here to avoid flickering

      // Load participants for animation
      try {
        const participants = await contract.getPoolParticipants(poolId);
        setParticipantAddresses(participants || []);
      } catch (error) {
        // Function might not exist in older contracts, ignore
      }

      // Load winners if pool is closed
      if (pool.winnersDrawn) {
        await loadWinners(Number(poolId), contract);
      }

      // Check if user is a winner
      if (account) {
        await checkUserWinnerStatus(Number(poolId), contract);
      }

        // Load past pools with loading indicator on initial load only
        await loadPastPools(Number(poolId), contract, !hasLoadedDrawnPoolsOnce);
    } catch (error: any) {
      // Silently handle errors - UI will show default/empty state
      setIsLoadingDrawnPools(false); // Stop loading even on error
      setHasLoadedDrawnPoolsOnce(true); // Mark as attempted even on error
    }
  }, [contractAddress, account, ethereumProvider]);

  // Calculate time remaining based on poolData
  const updateTimeRemaining = useCallback(() => {
    if (poolData && poolData.startTime > 0n && poolData.endTime > 0n) {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Number(poolData.endTime) - now;
      setTimeRemaining(Math.max(0, remaining));
    } else {
      setTimeRemaining(0);
    }
  }, [poolData]);

  // Real-time updates every 3 seconds (without reloading balance to prevent flickering)
  useEffect(() => {
    // Load immediately when conditions are met
    if (isConnected && contractAddress) {
      // Load immediately, don't wait for FHEVM on mobile
      loadContractData();
      
      const interval = setInterval(() => {
        loadContractData();
      }, 3000); // Update every 3 seconds for real-time feel
      return () => clearInterval(interval);
    }
  }, [isConnected, contractAddress, fhevmStatus, loadContractData, ethereumProvider]);

  // Update time remaining immediately when poolData changes
  useEffect(() => {
    updateTimeRemaining();
  }, [updateTimeRemaining]);

  // Update time remaining every second when pool has started
  useEffect(() => {
    if (poolData && poolData.startTime > 0n && poolData.endTime > 0n) {
      const interval = setInterval(() => {
        updateTimeRemaining();
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [poolData, updateTimeRemaining]);


  const loadMazaTokenData = useCallback(async (tokenAddress: string, userAddress: string, contractAddress: string, isInitialLoad: boolean = false) => {
    // Only show loading spinner on initial load (first time only)
    const shouldShowLoading = isInitialLoad && !hasLoadedBalanceOnce;
    
    try {
      if (shouldShowLoading) {
        setIsLoadingBalance(true);
      }
      
      const ethereum = ethereumProvider || (window as any).ethereum;
      if (!ethereum) {
        if (shouldShowLoading) {
          setIsLoadingBalance(false);
          setHasLoadedBalanceOnce(true);
        }
        return;
      }
      
      const provider = new ethers.BrowserProvider(ethereum);
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

      const balance = await tokenContract.balanceOf(userAddress);
      const allowance = await tokenContract.allowance(userAddress, contractAddress);
      const decimals = await tokenContract.decimals();

      setMazaBalance(ethers.formatUnits(balance, decimals));
      setMazaAllowance(ethers.formatUnits(allowance, decimals));
      
      // Mark as loaded after successful fetch
      if (isInitialLoad) {
        setHasLoadedBalanceOnce(true);
      }
    } catch (error: any) {
      // Silently handle errors - balance will remain at 0
      if (isInitialLoad) {
        setHasLoadedBalanceOnce(true); // Mark as attempted even on error
    }
    } finally {
      // Only clear loading if we showed it
      if (shouldShowLoading) {
        setIsLoadingBalance(false);
      }
    }
  }, [hasLoadedBalanceOnce, ethereumProvider]);

  // Load balance once on initial mount (after token address is known)
  useEffect(() => {
    if (isConnected && contractAddress && mazaTokenAddress && account && !hasLoadedBalanceOnce) {
      loadMazaTokenData(mazaTokenAddress, account, contractAddress, true);
    }
  }, [isConnected, contractAddress, mazaTokenAddress, account, hasLoadedBalanceOnce, loadMazaTokenData]);

  const loadWinners = async (poolId: number, contract: ethers.Contract) => {
    try {
      const winnersData = await contract.getPoolWinners(poolId);
      const winnersList: WinnerData[] = winnersData[0].map((addr: string, idx: number) => ({
        address: addr,
        percentage: winnersData[1][idx],
        reward: winnersData[2][idx],
        claimed: winnersData[3][idx],
      }));
      setWinners(winnersList);
    } catch (error: any) {
      // Silently handle errors
    }
  };

  const checkUserWinnerStatus = async (poolId: number, contract: ethers.Contract) => {
    try {
      const result = await contract.isWinner(poolId, account);
      setUserWinnerInfo({
        isWinner: result[0],
        reward: result[1],
        claimed: result[2],
      });
    } catch (error: any) {
      // Silently handle errors
    }
  };

  const loadPastPools = async (currentPoolId: number, contract: ethers.Contract, showLoading: boolean = false) => {
    try {
      if (showLoading) {
        setIsLoadingDrawnPools(true);
      }
      const pools: PastPoolData[] = [];
      // Load last 10 pools
      const startId = Math.max(0, currentPoolId - 10);
      for (let i = startId; i < currentPoolId; i++) {
        try {
          const pool = await contract.getPool(i);
          const poolData: PastPoolData = {
            poolId: i,
            startTime: pool.startTime,
            endTime: pool.endTime,
            totalEntries: pool.totalEntries,
            totalAmount: pool.totalAmount,
            isClosed: pool.isClosed,
            winnersDrawn: pool.winnersDrawn,
            participantCount: pool.participantCount,
          };

          if (pool.winnersDrawn) {
            const winnersData = await contract.getPoolWinners(i);
            poolData.winners = winnersData[0].map((addr: string, idx: number) => ({
              address: addr,
              percentage: winnersData[1][idx],
              reward: winnersData[2][idx],
              claimed: winnersData[3][idx],
            }));

            // Load random seed data
            try {
              const randomSeedHandle = await contract.getEncryptedRandomSeed(i);
              poolData.randomSeedHandle = ethers.hexlify(randomSeedHandle);
            } catch (error) {
              // Random seed might not be available
            }

            if (account) {
              const result = await contract.isWinner(i, account);
              poolData.userWinnerInfo = {
                isWinner: result[0],
                reward: result[1],
                claimed: result[2],
              };
            }
          }

          pools.push(poolData);
        } catch (error) {
          // Pool might not exist, skip
        }
      }
      setPastPools(pools.reverse()); // Most recent first
      setHasLoadedDrawnPoolsOnce(true); // Mark as loaded at least once
    } catch (error: any) {
      // Silently handle errors
      setHasLoadedDrawnPoolsOnce(true); // Mark as attempted even on error
    } finally {
      if (showLoading) {
        setIsLoadingDrawnPools(false);
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: bigint): string => {
    return new Date(Number(timestamp) * 1000).toLocaleString();
  };

  const handleApprove = async () => {
    if (!mazaTokenAddress || !contractAddress) {
      addToast('Token or contract address not loaded', 'error');
      return;
    }

    const ethereum = ethereumProvider || (window as any).ethereum;
    if (!ethereum) {
      addToast('Wallet not connected. Please connect your wallet.', 'error');
      return;
    }

    const toastId = addToast('Please sign the transaction in your wallet to approve MAZA tokens', 'loading', 0);

    try {
      setIsApproving(true);

      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const tokenContract = new ethers.Contract(mazaTokenAddress, ERC20_ABI, signer);

      // Approve maximum amount (one-time approval) - this allows unlimited spending
      const approveAmount = ethers.MaxUint256;
      updateToast(toastId, 'Transaction submitted. Waiting for confirmation...', 'info');
      const tx = await tokenContract.approve(contractAddress, approveAmount);

      updateToast(toastId, 'Transaction pending confirmation...', 'loading');
      await tx.wait();

      removeToast(toastId);
      addToast('Approval successful! You can now enter the pool.', 'success');
      
      // Reload token data to update allowance (silent update, no loading spinner)
      if (mazaTokenAddress && account && contractAddress) {
        await loadMazaTokenData(mazaTokenAddress, account, contractAddress, false);
      }
      
      // Also reload contract data to ensure pool state is fresh
      await loadContractData();
    } catch (error: any) {
      removeToast(toastId);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      if (errorMessage.includes('User rejected') || errorMessage.includes('user denied') || errorMessage.includes('rejected')) {
        addToast('Transaction cancelled. You can try again when ready.', 'warning');
      } else {
        addToast(`Approval failed: ${errorMessage}`, 'error');
      }
    } finally {
      setIsApproving(false);
    }
  };

  const handleEnterPool = async () => {
    if (!contractAddress) {
      addToast('Contract address not configured', 'error');
      return;
    }

    // Check if user has already entered
    if (hasEnteredCurrentPool) {
      addToast('You have already entered this pool. Each address can only enter once per pool.', 'error');
      return;
    }

    const ethereum = ethereumProvider || (window as any).ethereum;
    if (!ethereum) {
      addToast('Wallet not connected. Please connect your wallet.', 'error');
      return;
    }

    const toastId = addToast('Please sign the transaction in your wallet to enter the pool', 'loading', 0);

    try {
      setIsEntering(true);

      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, RAFFLE_ABI, signer);

      updateToast(toastId, 'Transaction submitted. Waiting for confirmation...', 'info');
      const tx = await contract.enterPool();

      updateToast(toastId, 'Transaction pending confirmation...', 'loading');
      await tx.wait();

      removeToast(toastId);
      addToast('Successfully entered the pool! Good luck!', 'success');
      await loadContractData();
    } catch (error: any) {
      removeToast(toastId);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      const lowerErrorMessage = errorMessage.toLowerCase();
      
      if (lowerErrorMessage.includes('user rejected') || lowerErrorMessage.includes('user denied') || lowerErrorMessage.includes('rejected')) {
        addToast('Transaction cancelled. You can try again when ready.', 'warning');
      } else if (lowerErrorMessage.includes('already entered') || lowerErrorMessage.includes('already entered this pool')) {
        addToast('You have already entered this pool. Each address can only enter once per pool.', 'error');
        // Update state to reflect that user has entered
        setHasEnteredCurrentPool(true);
      } else {
        addToast(`Failed to enter pool: ${errorMessage}`, 'error');
      }
    } finally {
      setIsEntering(false);
    }
  };

  // Automated draw winners flow (combines generateRandomSeed and drawWinners)
  const handleDrawWinners = async () => {
    if (!contractAddress) {
      addToast('Contract address not configured', 'error');
      return;
    }
    
    if (!isOwner) {
      addToast('Only owner can draw winners', 'error');
      return;
    }

    if (fhevmStatus !== 'ready') {
      addToast('FHEVM not ready. Please wait...', 'warning');
      return;
    }

    const toastId = addToast('Starting winner draw process...', 'loading', 0);

    try {
      setIsDrawingWinners(true);
      const ethereum = ethereumProvider || (window as any).ethereum;
      if (!ethereum) {
        addToast('Wallet not connected. Please connect your wallet.', 'error');
        return;
      }
      
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, RAFFLE_ABI, signer);

      // Step 1: Generate random seed
      updateToast(toastId, 'Step 1/3: Please sign to generate random seed', 'loading');
      const generateTx = await contract.generateRandomSeed(currentPoolId);
      
      updateToast(toastId, 'Step 1/3: Transaction submitted. Waiting for confirmation...', 'info');
      await generateTx.wait();

      // Step 2: Get handle from event or contract
      updateToast(toastId, 'Step 2/3: Fetching encrypted random seed...', 'loading');
      const handle = await contract.getEncryptedRandomSeed(currentPoolId);
      
      if (handle === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('Random seed handle not found');
      }

      // Step 3: Decrypt with proof
      updateToast(toastId, 'Step 2/3: Decrypting random seed (this may take a moment)...', 'loading');
      const { cleartexts, decryptionProof } = await publicDecryptWithProof(handle);

      // Step 4: Submit drawWinners transaction
      updateToast(toastId, 'Step 3/3: Please sign to submit decrypted seed and draw winners', 'loading');
      const drawTx = await contract.drawWinners(currentPoolId, cleartexts, decryptionProof);

      updateToast(toastId, 'Step 3/3: Transaction submitted. Waiting for confirmation...', 'info');
      await drawTx.wait();

      // Load winners immediately
      await loadWinners(currentPoolId, contract);
      
      // Start animation
      setShowDrawAnimation(true);
      
      removeToast(toastId);
      addToast('Winners drawn successfully!', 'success');
      
      // Reload all contract data after animation
      await loadContractData();
    } catch (error: any) {
      removeToast(toastId);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      if (errorMessage.includes('User rejected') || errorMessage.includes('user denied') || errorMessage.includes('rejected')) {
        addToast('Transaction cancelled. You can try again when ready.', 'warning');
      } else {
        addToast(`Failed to draw winners: ${errorMessage}`, 'error');
      }
    } finally {
      setIsDrawingWinners(false);
    }
  };

  const handleClaimReward = async (poolId: number) => {
    if (!contractAddress) {
      addToast('Contract address not configured', 'error');
      return;
    }

    const toastId = addToast('Please sign the transaction in your wallet to claim reward', 'loading', 0);

    try {
      setIsClaiming(true);
      const ethereum = ethereumProvider || (window as any).ethereum;
      if (!ethereum) {
        addToast('Wallet not connected. Please connect your wallet.', 'error');
        return;
      }

      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, RAFFLE_ABI, signer);

      updateToast(toastId, 'Transaction submitted. Waiting for confirmation...', 'info');
      const tx = await contract.claimReward(poolId);

      updateToast(toastId, 'Transaction pending confirmation...', 'loading');
      await tx.wait();

      removeToast(toastId);
      addToast('Reward claimed successfully! Check your wallet balance.', 'success');
      
      // Show confetti celebration
      setShowClaimConfetti(true);
      
      await loadContractData();
    } catch (error: any) {
      removeToast(toastId);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      if (errorMessage.includes('User rejected') || errorMessage.includes('user denied') || errorMessage.includes('rejected')) {
        addToast('Transaction cancelled. You can try again when ready.', 'warning');
      } else {
        addToast(`Failed to claim reward: ${errorMessage}`, 'error');
      }
    } finally {
      setIsClaiming(false);
    }
  };

  // Show helpful message if contract address is not configured, but still show the UI structure
  const contractNotConfigured = !CONTRACT_ADDRESS || CONTRACT_ADDRESS === '';

  // Check if approval is needed - MaxUint256 approval means unlimited
  // If allowance is a very large number (like MaxUint256 formatted), consider it approved
  const allowanceValue = parseFloat(mazaAllowance);
  const entryFeeValue = parseFloat(entryFee);
  // MaxUint256 (2^256 - 1) formatted with 18 decimals would be ~1.15e+59, so anything > 1e+50 is effectively infinite
  const isUnlimitedApproval = allowanceValue > 1e50 || allowanceValue === Infinity;
  const needsApproval = !isUnlimitedApproval && (allowanceValue < entryFeeValue || allowanceValue === 0 || isNaN(allowanceValue));
  // Don't show insufficient balance if we haven't loaded the balance yet
  const hasEnoughBalance = hasLoadedBalanceOnce ? parseFloat(mazaBalance) >= parseFloat(entryFee) : true;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      {/* Raffle Draw Animation */}
      {showDrawAnimation && winners.length > 0 && (
        <RaffleDrawAnimation
          participantAddresses={participantAddresses.length > 0 ? participantAddresses : winners.map(w => w.address)}
          winners={winners}
          isAnimating={showDrawAnimation}
          onAnimationComplete={() => {
            setShowDrawAnimation(false);
            loadContractData();
          }}
        />
      )}
      
      {/* Claim Confetti */}
      <ClaimConfetti
        key={showClaimConfetti ? Date.now() : 0}
        show={showClaimConfetti}
        onComplete={() => setShowClaimConfetti(false)}
      />
      
      <div className="w-full max-w-[1400px] mx-auto p-4 md:p-8 space-y-6 md:space-y-8 bg-orange-50 min-h-screen">
        {/* Contract Configuration Warning */}
        {contractNotConfigured && (
          <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-6 md:p-8 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
            <div className="flex items-start gap-4">
              <div className="text-4xl">⚠️</div>
              <div className="flex-1">
                <h3 className="text-[#EA580C] font-black text-lg md:text-2xl mb-3 uppercase">Contract Address Not Configured</h3>
                <p className="text-[#EA580C] text-sm md:text-lg mb-4 md:mb-6 font-bold">
                  The Raffle contract address is not set for this network. You need to configure it to use the app.
                </p>
                <div className="bg-white border-4 border-[#EA580C] rounded-lg p-4 md:p-6 mb-4">
                  <p className="text-[#EA580C] text-sm md:text-lg mb-3 font-black">To fix this:</p>
                  <ol className="list-decimal list-inside space-y-2 text-[#EA580C] text-xs md:text-base font-bold">
                    <li>Create a <code className="bg-[#FFEDD5] border-2 border-[#EA580C] px-2 py-1 rounded font-mono">.env</code> file in the Raffle directory</li>
                    <li>Add: <code className="bg-[#FFEDD5] border-2 border-[#EA580C] px-2 py-1 rounded font-mono">VITE_RAFFLE_CONTRACT_ADDRESS_SEPOLIA=0x...</code></li>
                    <li>Restart your dev server</li>
                  </ol>
                </div>
                <p className="text-[#EA580C] text-xs md:text-base mt-4 font-bold">
                  Current Chain ID: {chainId} | Expected: 11155111 (Sepolia)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-white border-4 border-[#EA580C] rounded-lg p-6 md:p-10 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
          <div className="flex items-center gap-3 md:gap-5 mb-6 md:mb-8">
            <Trophy className="w-8 h-8 md:w-10 md:h-10 text-[#EA580C]" />
            <h2 className="text-2xl md:text-4xl font-black text-[#EA580C] uppercase">FHE Raffle Pool</h2>
          </div>
          {isLoadingPoolData ? (
            // Skeleton Loader
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-8">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={`skeleton-${idx}`}>
                  <div className="h-4 md:h-5 bg-gray-300 rounded w-20 mb-2 animate-pulse"></div>
                  <div className="h-6 md:h-8 bg-gray-300 rounded w-16 md:w-24 animate-pulse"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-8 text-sm">
            <div>
                <p className="text-gray-600 text-xs md:text-sm mb-1">Pool ID</p>
                <p className="text-[#EA580C] font-black text-lg md:text-2xl">{currentPoolId}</p>
            </div>
            <div>
                <p className="text-gray-600 text-xs md:text-sm mb-1">Total Entries</p>
                <p className="text-[#EA580C] font-black text-lg md:text-2xl">{poolData?.totalEntries.toString() || '0'}</p>
            </div>
            <div>
                <p className="text-gray-600 text-xs md:text-sm mb-1">Pool Amount</p>
                <p className="text-[#EA580C] font-black text-lg md:text-2xl">{poolData ? ethers.formatEther(poolData.totalAmount) : '0'} MAZA</p>
            </div>
            <div>
                <p className="text-gray-600 text-xs md:text-sm mb-1">Total Volume Drawn</p>
                <p className="text-[#EA580C] font-black text-lg md:text-2xl">
                  {pastPools.length > 0 
                    ? `${ethers.formatEther(pastPools.reduce((sum, pool) => sum + pool.totalAmount, 0n))} MAZA`
                    : '0 MAZA'}
                </p>
              </div>
              <div>
                <p className="text-gray-600 text-xs md:text-sm mb-1">Status</p>
                <p className={`font-black text-lg md:text-2xl ${
                !poolData 
                  ? 'text-gray-500' 
                    : poolData.startTime === 0n
                    ? 'text-gray-600'
                    : poolData.winnersDrawn
                    ? 'text-red-600'
                    : timeRemaining > 0
                    ? 'text-green-600'
                    : timeRemaining === 0 && poolData.startTime > 0n
                    ? 'text-[#C2410C]'
                    : 'text-gray-600'
              }`}>
                {!poolData 
                  ? 'Not Connected' 
                    : poolData.startTime === 0n
                    ? 'Waiting'
                    : poolData.winnersDrawn
                  ? 'Completed'
                    : timeRemaining > 0
                    ? 'Active'
                    : timeRemaining === 0 && poolData.startTime > 0n
                    ? 'Ended'
                    : 'Waiting'}
              </p>
            </div>
          </div>
          )}
        </div>

        {/* Countdown Timer - Show when pool has started (has entries) and countdown is active */}
        {poolData && poolData.startTime > 0n && poolData.totalEntries > 0n && timeRemaining > 0 && (
          <div className="bg-white border-4 border-[#EA580C] rounded-lg p-6 md:p-10 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
            <div className="flex items-center justify-center gap-3 md:gap-5 mb-4 md:mb-6">
              <Clock className="w-6 h-6 md:w-8 md:h-8 text-[#EA580C]" />
              <p className="text-[#EA580C] text-lg md:text-2xl font-black">Time Remaining</p>
            </div>
            <p className="text-5xl md:text-7xl font-black text-[#EA580C] text-center">{formatTime(timeRemaining)}</p>
          </div>
        )}
        
        {/* Countdown Ended - Show when countdown reaches 0 */}
        {poolData && poolData.startTime > 0n && poolData.totalEntries > 0n && timeRemaining === 0 && (
          <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-6 md:p-10 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
            <div className="flex items-center justify-center gap-3 md:gap-5 mb-4 md:mb-6">
              <Clock className="w-6 h-6 md:w-8 md:h-8 text-[#EA580C]" />
              <p className="text-[#EA580C] text-lg md:text-2xl font-black">Countdown Ended</p>
            </div>
            <p className="text-5xl md:text-7xl font-black text-[#EA580C] text-center">00:00</p>
            <p className="text-[#EA580C] text-sm md:text-lg text-center mt-4 md:mt-6 font-black">Pool is now closed. No more entries allowed.</p>
          </div>
        )}

        {/* Waiting for first entry message - Show when pool hasn't started yet */}
        {poolData && poolData.startTime === 0n && poolData.totalEntries === 0n && (
          <div className="bg-white border-4 border-[#EA580C] rounded-lg p-6 md:p-10 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
            <div className="flex items-center gap-3 md:gap-5 mb-4 md:mb-6">
              <Users className="w-6 h-6 md:w-8 md:h-8 text-[#EA580C]" />
              <p className="text-[#EA580C] text-lg md:text-2xl font-black">Pool Status</p>
              </div>
            <p className="text-2xl md:text-4xl font-black text-[#EA580C] mb-3 md:mb-4">Waiting for first entry</p>
            <p className="text-gray-700 text-base md:text-xl font-bold">The 5-minute timer will start when someone enters the pool</p>
          </div>
        )}

        {/* Pool Ended Message - Only show when countdown is exactly 00:00 and winners not drawn */}
        {poolData && poolData.startTime > 0n && timeRemaining === 0 && !poolData.winnersDrawn && (
          <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-6 md:p-8 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
            <div className="flex items-center gap-3 md:gap-5">
              <Clock className="w-6 h-6 md:w-8 md:h-8 text-[#EA580C]" />
              <div className="flex-1">
                <p className="text-[#EA580C] font-black text-lg md:text-2xl mb-2 md:mb-3">Pool Ended - Awaiting Draw</p>
                <p className="text-[#EA580C] text-sm md:text-lg font-bold">
                  {poolData.totalEntries > 0n 
                    ? `Countdown ended. ${Number(poolData.totalEntries)} participant${Number(poolData.totalEntries) !== 1 ? 's' : ''} entered. Owner can now draw winners.`
                    : 'No participants. Pool will be reset.'
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Entry Section and Past Pools - Horizontal Layout on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          {/* Entry Section - Prominent Design - Show when pool hasn't started, is active (countdown > 0), or pending draw */}
          {poolData && (poolData.startTime === 0n || timeRemaining > 0 || (timeRemaining === 0 && !poolData.winnersDrawn)) && (
            <div className="bg-white border-4 border-[#EA580C] rounded-lg p-6 md:p-10 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] transform hover:-translate-y-1 transition-transform">
              {/* Header */}
              <div className="flex items-center gap-3 md:gap-5 mb-6 md:mb-8">
                <div className="w-16 h-16 md:w-20 md:h-24 bg-[#FB923C] border-4 border-[#EA580C] rounded-lg flex items-center justify-center">
                  <Ticket className="w-8 h-8 md:w-12 md:h-12 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl md:text-4xl font-black text-[#EA580C] uppercase">Enter Raffle Pool</h3>
                  <p className="text-gray-700 text-base md:text-xl font-black">Join now and win big!</p>
                </div>
              </div>

              {/* Entry Fee Display - Large and Prominent */}
              <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-6 md:p-8 mb-6 md:mb-8">
                <div className="flex items-center justify-between mb-6 md:mb-8">
                  <span className="text-[#EA580C] text-lg md:text-2xl font-black">Entry Fee</span>
                  <div className="text-right">
                    <span className="text-4xl md:text-6xl font-black text-[#EA580C]">{entryFee || '5'}</span>
                    <span className="text-2xl md:text-4xl font-black text-[#EA580C] ml-2">MAZA</span>
                  </div>
                </div>
                <div className="h-1 bg-[#EA580C] my-6 md:my-8"></div>
                <div className="flex items-center justify-between">
                  <span className="text-[#EA580C] text-lg md:text-2xl font-black">Your Balance</span>
                  <div className="flex items-center gap-2 md:gap-4">
                    {isLoadingBalance ? (
                  <div className="flex items-center gap-2">
                        <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin text-[#EA580C]" />
                        <span className="text-[#EA580C] text-lg md:text-xl font-bold">Loading...</span>
                      </div>
                    ) : (
                      <>
                        <span className={`text-2xl md:text-4xl font-black ${hasEnoughBalance ? 'text-green-600' : 'text-red-600'}`}>
                      {mazaBalance}
                    </span>
                        <span className="text-xl md:text-3xl font-black text-[#EA580C]">MAZA</span>
                    {!hasEnoughBalance && (
                          <span className="text-sm md:text-base text-red-600 bg-red-100 border-2 border-[#EA580C] px-3 md:px-4 py-1 md:py-2 rounded font-black">Insufficient</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button - Large and Prominent */}
              {!contractAddress ? (
                <button
                  disabled
                  className="w-full bg-gray-300 text-gray-600 font-black py-4 md:py-6 rounded-lg border-4 border-[#EA580C] opacity-50 cursor-not-allowed text-lg md:text-xl"
                >
                  <span className="flex items-center justify-center gap-3 md:gap-4">
                    <Loader2 className="w-6 h-6 md:w-8 md:h-8 animate-spin" />
                    Waiting for Contract Configuration
                  </span>
                </button>
              ) : needsApproval ? (
                <button
                  onClick={handleApprove}
                  disabled={isApproving || !hasEnoughBalance || !contractAddress || !mazaTokenAddress}
                  className="w-full bg-[#FB923C] text-white font-black py-4 md:py-6 rounded-lg border-4 border-[#EA580C] shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none disabled:opacity-50 disabled:cursor-not-allowed text-lg md:text-xl transition-all duration-200"
                >
                  <span className="flex items-center justify-center gap-3 md:gap-4">
                    {isApproving ? (
                      <>
                        <Loader2 className="w-6 h-6 md:w-8 md:h-8 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-6 h-6 md:w-8 md:h-8" />
                        Approve MAZA (One-time)
                      </>
                    )}
                  </span>
                </button>
              ) : (
                <button
                  onClick={handleEnterPool}
                  disabled={isEntering || !hasEnoughBalance || !contractAddress || !mazaTokenAddress || (poolData && poolData.startTime > 0n && timeRemaining <= 0) || hasEnteredCurrentPool}
                  className="w-full bg-[#FB923C] text-white font-black py-4 md:py-6 rounded-lg border-4 border-[#EA580C] shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none disabled:opacity-50 disabled:cursor-not-allowed text-lg md:text-xl transition-all duration-200"
                >
                  <span className="flex items-center justify-center gap-3 md:gap-4">
                    {hasEnteredCurrentPool && poolData && poolData.startTime > 0n && timeRemaining === 0 && !poolData.winnersDrawn ? (
                      <>
                        <Clock className="w-6 h-6 md:w-8 md:h-8" />
                        Pending Draw
                      </>
                    ) : hasEnteredCurrentPool ? (
                      <>
                        <CheckCircle2 className="w-6 h-6 md:w-8 md:h-8" />
                        Already Entered
                      </>
                    ) : isEntering ? (
                      <>
                        <Loader2 className="w-6 h-6 md:w-8 md:h-8 animate-spin" />
                        Entering Pool...
                      </>
                    ) : (
                      <>
                        <Ticket className="w-6 h-6 md:w-8 md:h-8" />
                        Enter Pool Now
                      </>
                    )}
                  </span>
                </button>
              )}

              {/* Info Text */}
              <p className="text-center text-gray-700 text-sm md:text-base mt-6 md:mt-8 font-black">
                {!contractAddress 
                  ? "Configure contract address to enter the raffle pool"
                  : !poolData 
                    ? "Loading pool data..."
                    : hasEnteredCurrentPool && poolData.startTime > 0n && timeRemaining === 0 && !poolData.winnersDrawn
                      ? "Pool countdown has ended. Waiting for owner to draw winners."
                    : hasEnteredCurrentPool
                      ? "You have already entered this pool. Each address can only enter once per pool."
                    : needsApproval
                      ? "Approve MAZA tokens once to enable unlimited entries (no need to approve again)"
                    : poolData.startTime > 0n && timeRemaining <= 0
                      ? "Countdown has ended. Pool is closed. No more entries allowed."
                    : hasEnoughBalance 
                        ? "Click the button above to enter the raffle pool" 
                        : "You need more MAZA tokens to enter this pool"}
              </p>
          </div>
        )}

          {/* Past Pools Section */}
          <div className="bg-white border-4 border-[#EA580C] rounded-lg p-6 md:p-10 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] transform hover:-translate-y-1 transition-transform">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
              <div className="flex items-center gap-3">
                <Trophy className="w-6 h-6 md:w-8 md:h-8 text-[#EA580C]" />
                <h3 className="text-xl md:text-3xl font-black text-[#EA580C] uppercase">Drawn Pools</h3>
            </div>
                <button
                onClick={async () => {
                  const newShowState = !showPastPools;
                  setShowPastPools(newShowState);
                  
                  // Load pools when showing for the first time
                  if (newShowState && pastPools.length === 0 && contractAddress && currentPoolId > 0) {
                    try {
                      const ethereum = ethereumProvider || (window as any).ethereum;
                      if (ethereum) {
                        const provider = new ethers.BrowserProvider(ethereum);
                        const contract = new ethers.Contract(contractAddress, RAFFLE_ABI, provider);
                        await loadPastPools(currentPoolId, contract, !hasLoadedDrawnPoolsOnce);
                      }
                    } catch (error) {
                      // Silently handle errors
                      setHasLoadedDrawnPoolsOnce(true); // Mark as attempted even on error
                    }
                  }
                }}
                className="text-[#EA580C] text-sm md:text-lg font-black hover:underline border-2 border-[#EA580C] px-3 md:px-4 py-2 rounded-lg bg-[#FFEDD5] hover:bg-[#FB923C] transition-colors"
                >
                {showPastPools ? 'Hide' : 'Show'}
                </button>
                </div>
            {showPastPools && (
              <div className="space-y-3 md:space-y-4 max-h-[500px] md:max-h-[600px] overflow-y-auto">
                {isLoadingDrawnPools && !hasLoadedDrawnPoolsOnce ? (
                  // Skeleton Loaders - Only show on initial load
                  Array.from({ length: 3 }).map((_, idx) => (
                    <div key={`skeleton-${idx}`} className="bg-[#FFEDD5] rounded-lg border-4 border-[#EA580C] animate-pulse">
                      <div className="p-3 md:p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="h-5 md:h-6 bg-gray-300 rounded w-24 mb-2"></div>
                            <div className="h-4 bg-gray-300 rounded w-32"></div>
            </div>
                          <div className="text-right ml-4">
                            <div className="h-5 md:h-6 bg-gray-300 rounded w-20 mb-2"></div>
                            <div className="h-4 bg-gray-300 rounded w-16"></div>
          </div>
            </div>
          </div>
                    </div>
                  ))
                ) : pastPools.length === 0 ? (
                  <p className="text-gray-600 text-center text-sm md:text-lg font-bold">No drawn pools yet</p>
              ) : (
                pastPools.map((pool) => {
                  const isExpanded = expandedPoolId === pool.poolId;
                  const hasWinners = pool.winnersDrawn && pool.winners && pool.winners.length > 0;
                  const poolWinners = pool.winners || [];
                  
                  return (
                      <div key={pool.poolId} className="bg-[#FFEDD5] rounded-lg border-4 border-[#EA580C] hover:border-[#C2410C] transition-colors">
                      {/* Pool Header - Clickable */}
                      <button
                        onClick={() => setExpandedPoolId(isExpanded ? null : pool.poolId)}
                          className="w-full p-3 md:p-4 flex justify-between items-start hover:bg-[#FB923C] transition-colors rounded-lg"
                      >
                        <div className="flex-1 text-left">
                            <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                              <p className="text-[#EA580C] font-black text-base md:text-xl">Pool #{pool.poolId}</p>
                            {hasWinners && (
                                <span className="px-2 md:px-3 py-1 bg-green-200 text-green-800 text-xs rounded-lg border-2 border-[#EA580C] font-black">
                                {poolWinners.length} Winners
                              </span>
                            )}
                            {account && pool.userWinnerInfo?.isWinner && (
                              <span className="px-2 md:px-3 py-1 bg-[#FB923C] text-white text-xs rounded-lg border-2 border-[#EA580C] font-black flex items-center gap-1">
                                <Crown className="w-3 h-3 md:w-4 md:h-4" />
                                You Won!
                              </span>
                            )}
                          </div>
                            <p className="text-gray-700 text-xs md:text-base font-bold">{formatDate(pool.endTime)}</p>
                        </div>
                          <div className="text-right ml-4 md:ml-6">
                            <p className="text-[#EA580C] font-black text-base md:text-xl">{ethers.formatEther(pool.totalAmount)} MAZA</p>
                            <p className="text-gray-700 text-xs md:text-sm font-bold">{Number(pool.totalEntries)} entries</p>
                        </div>
                          <div className="ml-2 md:ml-4 flex-shrink-0">
                          <svg 
                              className={`w-5 h-5 md:w-6 md:h-6 text-[#EA580C] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                              strokeWidth="3"
                            viewBox="0 0 24 24"
                          >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {/* Expanded Content - Winners Details */}
                      {isExpanded && hasWinners && (
                          <div className="px-3 md:px-4 pb-3 md:pb-4 pt-3 md:pt-4 border-t-4 border-[#EA580C]">
                            {/* Random Seed Information */}
                            {pool.randomSeedHandle && (
                              <div className="mb-4 md:mb-6 p-3 md:p-4 bg-white border-4 border-[#EA580C] rounded-lg">
                                <p className="text-[#EA580C] font-black text-sm md:text-lg mb-2 md:mb-3">Random Seed Information</p>
                                <div className="space-y-2">
                                  <div>
                                    <span className="text-xs md:text-sm font-bold text-gray-700">Ciphertext (Handle):</span>
                                    <p className="text-xs md:text-sm font-mono text-[#EA580C] break-all mt-1">
                                      {pool.randomSeedHandle}
                                    </p>
                                  </div>
                                  {pool.revealedRandomSeed !== undefined && (
                                    <div>
                                      <span className="text-xs md:text-sm font-bold text-gray-700">Revealed Random Number:</span>
                                      <p className="text-xs md:text-sm font-mono text-[#EA580C] break-all mt-1">
                                        {pool.revealedRandomSeed.toString()}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            <p className="text-[#EA580C] font-black text-sm md:text-lg mb-3 md:mb-4 flex items-center gap-2 md:gap-3">
                              <Trophy className="w-4 h-4 md:w-5 md:h-5" />
                            Winners & Rewards
                          </p>
                            <div className="space-y-2 md:space-y-3">
                            {poolWinners.map((winner, idx) => {
                              const isUser = winner.address.toLowerCase() === account.toLowerCase();
                              return (
                                <div 
                                  key={idx} 
                                    className={`p-3 md:p-4 rounded-lg border-4 ${
                                    isUser 
                                        ? 'bg-[#FB923C] border-[#C2410C]' 
                                        : 'bg-white border-[#EA580C]'
                                  }`}
                                >
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 md:gap-3 mb-2 md:mb-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                                          <span className={`font-black text-sm md:text-lg ${isUser ? 'text-white' : 'text-[#EA580C]'}`}>
                                          {isUser ? (
                                              <span className="flex items-center gap-2">
                                                <Trophy className="w-4 h-4 md:w-5 md:h-5 text-white" />
                                              You
                                            </span>
                                          ) : `Winner ${idx + 1}`}
                                        </span>
                                        {isUser && (
                                            <span className="px-2 md:px-3 py-1 bg-white text-[#EA580C] text-xs rounded-lg border-2 border-[#EA580C] font-black">
                                            You
                                          </span>
                                        )}
                                      </div>
                                        <p className={`text-xs md:text-sm font-mono font-bold ${isUser ? 'text-white/90' : 'text-gray-700'}`}>
                                        {truncateAddress(winner.address)}
                                      </p>
                                    </div>
                                      <div className="text-right sm:text-left sm:ml-4">
                                        <p className={`font-black text-base md:text-xl ${isUser ? 'text-white' : 'text-[#EA580C]'}`}>
                                        {ethers.formatEther(winner.reward)} MAZA
                                      </p>
                                        <p className={`text-xs md:text-sm mt-1 font-bold ${isUser ? 'text-white/80' : 'text-gray-700'}`}>
                                        {formatPercentage(winner.percentage)}% share
                                      </p>
                                    </div>
                                  </div>
                                    <div className="flex items-center justify-between mt-2 md:mt-3 pt-2 md:pt-3 border-t-2 border-[#EA580C]">
                                      <span className={`text-xs md:text-sm font-black ${winner.claimed ? 'text-green-600' : 'text-[#C2410C]'}`}>
                                      {winner.claimed ? (
                                          <span className="flex items-center gap-2">
                                            <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4" />
                                          Claimed
                                        </span>
                                      ) : (
                                          <span className="flex items-center gap-2">
                                            <Clock className="w-3 h-3 md:w-4 md:h-4" />
                                          Pending
                                        </span>
                                      )}
                                    </span>
                                    {isUser && !winner.claimed && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleClaimReward(pool.poolId);
                                        }}
                                        disabled={isClaiming}
                                          className="px-3 md:px-4 py-1 md:py-2 bg-[#FB923C] text-white font-black text-xs md:text-sm rounded-lg border-2 border-[#EA580C] hover:bg-[#C2410C] disabled:opacity-50 transition-colors"
                                      >
                                        {isClaiming ? 'Claiming...' : 'Claim'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Show message if no winners yet */}
                      {isExpanded && !hasWinners && (
                          <div className="px-3 md:px-4 pb-3 md:pb-4 pt-3 md:pt-4 border-t-4 border-[#EA580C]">
                            <p className="text-gray-700 text-sm md:text-lg text-center py-2 md:py-3 font-bold">
                            {pool.isClosed ? 'Winners not drawn yet' : 'Pool still active'}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

        {/* Owner Panel - Single Draw Winners Button - Show when countdown is exactly 00:00 */}
        {isOwner && poolData && poolData.startTime > 0n && timeRemaining === 0 && !poolData.winnersDrawn && (
          <div className="bg-white border-4 border-[#EA580C] rounded-lg p-6 md:p-8 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
            <div className="flex items-center gap-3 mb-6">
              <Crown className="w-6 h-6 md:w-8 md:h-8 text-[#EA580C]" />
              <h3 className="text-lg md:text-2xl font-black text-[#EA580C] uppercase">Owner Panel</h3>
            </div>
            {poolData.totalEntries >= 5n ? (
              <>
                <button
                  onClick={handleDrawWinners}
                  disabled={isDrawingWinners || fhevmStatus !== 'ready'}
                  className="w-full bg-[#FB923C] text-white font-black py-4 md:py-6 rounded-lg border-4 border-[#EA580C] shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none disabled:opacity-50 disabled:cursor-not-allowed text-base md:text-xl transition-all flex items-center justify-center gap-3"
                >
                  {isDrawingWinners ? (
                    <>
                      <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" />
                      Drawing Winners...
                    </>
                  ) : (
                    <>
                      <Trophy className="w-5 h-5 md:w-6 md:h-6" />
                      Draw Winners
                    </>
                  )}
                </button>
                <p className="text-gray-700 text-sm md:text-base mt-4 text-center font-bold">
                  Generates random seed, decrypts, and draws winners automatically
                </p>
              </>
            ) : (
              <div className="flex items-start gap-3 md:gap-4 p-4 bg-[#FFEDD5] rounded-lg border-4 border-[#EA580C]">
                <AlertCircle className="w-5 h-5 md:w-6 md:h-6 text-[#EA580C] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[#EA580C] font-black text-sm md:text-lg mb-2">Not Enough Participants</p>
                  <p className="text-gray-700 text-xs md:text-base font-bold">
                    Need at least 5 participants to draw winners. Current: {Number(poolData.totalEntries)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Current Pool Winners Display */}
        {poolData && poolData.winnersDrawn && winners.length > 0 && (
          <div className="bg-white border-4 border-[#EA580C] rounded-lg p-6 md:p-8 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <Trophy className="w-6 h-6 md:w-8 md:h-8 text-[#EA580C]" />
              <h3 className="text-xl md:text-3xl font-black text-[#EA580C] uppercase">Winners - Pool #{currentPoolId}</h3>
            </div>
            <div className="space-y-3 md:space-y-4">
              {winners.map((winner, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-3 md:p-4 bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-[#EA580C] font-black text-sm md:text-lg truncate mb-1">
                      {winner.address.toLowerCase() === account.toLowerCase() ? (
                        <span className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 md:w-5 md:h-5 text-[#EA580C]" />
                          You!
                        </span>
                      ) : `Winner ${idx + 1}`}
                    </p>
                    <p className="text-gray-700 text-xs md:text-base truncate font-bold">{winner.address}</p>
                  </div>
                  <div className="text-left sm:text-right ml-0 sm:ml-4">
                    <p className="text-[#EA580C] font-black text-base md:text-xl">{ethers.formatEther(winner.reward)} MAZA</p>
                    <p className={`text-xs md:text-sm font-black ${winner.claimed ? 'text-green-600' : 'text-[#C2410C]'}`}>
                      {winner.claimed ? 'Claimed' : 'Pending'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User Winner Info for Current Pool */}
        {userWinnerInfo && userWinnerInfo.isWinner && poolData && poolData.poolId === currentPoolId && (
          <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-6 md:p-8 shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)]">
            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <Trophy className="w-6 h-6 md:w-8 md:h-8 text-[#EA580C]" />
              <h3 className="text-xl md:text-3xl font-black text-[#EA580C] uppercase">Congratulations! You're a Winner!</h3>
            </div>
            <div className="space-y-4 md:space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-4 bg-white border-4 border-[#EA580C] rounded-lg">
                <span className="text-[#EA580C] text-base md:text-xl font-black">Your Reward:</span>
                <span className="text-[#EA580C] font-black text-xl md:text-3xl">{ethers.formatEther(userWinnerInfo.reward)} MAZA</span>
              </div>
              {!userWinnerInfo.claimed && (
                <button
                  onClick={() => handleClaimReward(currentPoolId)}
                  disabled={isClaiming}
                  className="w-full bg-[#FB923C] text-white font-black py-4 md:py-6 rounded-lg border-4 border-[#EA580C] shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none disabled:opacity-50 text-base md:text-xl transition-all"
                >
                  {isClaiming ? 'Claiming...' : 'Claim Reward'}
                </button>
              )}
              {userWinnerInfo.claimed && (
                <div className="flex items-center justify-center gap-3 text-green-600 font-black text-base md:text-xl p-4 bg-green-100 border-4 border-green-600 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6" />
                  Reward Claimed!
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FAQ FAB Button */}
      <button
        onClick={() => setShowFAQ(true)}
        className="fixed bottom-6 right-6 w-14 h-14 md:w-16 md:h-16 bg-[#FB923C] text-white rounded-full border-4 border-[#EA580C] shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none flex items-center justify-center transition-all duration-200 z-50 font-black"
        aria-label="Open FAQ"
      >
        <HelpCircle className="w-7 h-7 md:w-8 md:h-8" />
      </button>

      {/* FAQ Modal */}
      {showFAQ && (
        <div className="fixed inset-0 bg-orange-50/95 backdrop-blur-sm flex items-center justify-center z-[100] p-4 md:p-8 overflow-y-auto">
          <div className="bg-white rounded-lg md:rounded-xl shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] w-full max-w-2xl md:max-w-3xl border-4 border-[#EA580C] relative max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b-4 border-[#EA580C] p-4 md:p-6 flex items-center justify-between z-10">
              <h2 className="text-2xl md:text-3xl font-black text-[#EA580C] uppercase">Frequently Asked Questions</h2>
              <button
                onClick={() => setShowFAQ(false)}
                className="w-10 h-10 md:w-12 md:h-12 bg-[#FB923C] text-white rounded-lg border-4 border-[#EA580C] shadow-[4px_4px_0px_0px_rgba(234,88,12,0.8)] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none flex items-center justify-center transition-all duration-200"
                aria-label="Close FAQ"
              >
                <X className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>

            {/* FAQ Content */}
            <div className="p-4 md:p-6 space-y-4 md:space-y-6">
              <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-4 md:p-6">
                <h3 className="text-lg md:text-xl font-black text-[#EA580C] mb-2 md:mb-3">How does the raffle work?</h3>
                <p className="text-gray-700 text-sm md:text-base font-bold leading-relaxed">
                  Each raffle pool runs for exactly 5 minutes. When someone enters, the timer starts. You pay 5 MAZA tokens to join. After 5 minutes, the pool closes automatically and 5 winners are randomly selected from all participants.
                </p>
              </div>

              <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-4 md:p-6">
                <h3 className="text-lg md:text-xl font-black text-[#EA580C] mb-2 md:mb-3">How are winners selected?</h3>
                <p className="text-gray-700 text-sm md:text-base font-bold leading-relaxed">
                  Winners are selected completely randomly using secure encryption technology. Every participant has an equal chance of winning, regardless of when they entered the pool. The selection is fair and cannot be manipulated.
                </p>
              </div>

              <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-4 md:p-6">
                <h3 className="text-lg md:text-xl font-black text-[#EA580C] mb-2 md:mb-3">How much can I win?</h3>
                <p className="text-gray-700 text-sm md:text-base font-bold leading-relaxed">
                  Winners share 90% of the total pool amount equally. For example, if 10 people enter (50 MAZA total), the 5 winners would share 45 MAZA, meaning each winner gets 9 MAZA. The remaining 10% goes to protocol fees.
                </p>
              </div>

              <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-4 md:p-6">
                <h3 className="text-lg md:text-xl font-black text-[#EA580C] mb-2 md:mb-3">Can I enter multiple times?</h3>
                <p className="text-gray-700 text-sm md:text-base font-bold leading-relaxed">
                  No, each wallet address can only enter once per pool. This ensures fairness and gives everyone an equal chance. You can enter the next pool once a new one starts!
                </p>
              </div>

              <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-4 md:p-6">
                <h3 className="text-lg md:text-xl font-black text-[#EA580C] mb-2 md:mb-3">What happens if I win?</h3>
                <p className="text-gray-700 text-sm md:text-base font-bold leading-relaxed">
                  If you're selected as a winner, you can claim your reward immediately after the winners are drawn. Your winnings will be sent directly to your wallet. Check the "Drawn Pools" section to see if you won and claim your reward!
                </p>
              </div>

              <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-4 md:p-6">
                <h3 className="text-lg md:text-xl font-black text-[#EA580C] mb-2 md:mb-3">Is it safe and fair?</h3>
                <p className="text-gray-700 text-sm md:text-base font-bold leading-relaxed">
                  Yes! The raffle uses advanced encryption technology (FHE) to ensure the random selection is completely fair and transparent. The random numbers used to pick winners are publicly verifiable, so you can always check that the selection was truly random.
                </p>
              </div>

              <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-4 md:p-6">
                <h3 className="text-lg md:text-xl font-black text-[#EA580C] mb-2 md:mb-3">What if not enough people enter?</h3>
                <p className="text-gray-700 text-sm md:text-base font-bold leading-relaxed">
                  At least 5 participants are needed to draw winners. If fewer than 5 people enter a pool, the pool will close but no winners will be drawn. The pool will then reset and a new pool will start.
                </p>
              </div>

              <div className="bg-[#FFEDD5] border-4 border-[#EA580C] rounded-lg p-4 md:p-6">
                <h3 className="text-lg md:text-xl font-black text-[#EA580C] mb-2 md:mb-3">How do I claim my reward?</h3>
                <p className="text-gray-700 text-sm md:text-base font-bold leading-relaxed">
                  If you're a winner, you'll see a "You Won!" tag with a crown icon on the pool card in the "Drawn Pools" section. Simply expand the pool card and click the "Claim" button. Your reward will be sent directly to your wallet, and you'll see a celebration animation! You can claim rewards from any pool you won, even if you've claimed from other pools before.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
