# Raffle App Implementation Plan

## Overview
This document outlines the implementation plan for the Raffle app, which is based on the toss-a-coin app but redesigned for a pool-based raffle system.

## Contract Features (Raffle.sol)

### Core Functionality
1. **Pool System**
   - Pools with IDs starting from 0
   - Each pool lasts 20 minutes
   - Automatic pool creation when previous pool closes

2. **Entry System**
   - Users enter with 5 MAZA tokens (ERC20)
   - One entry per user per pool
   - Pool closes automatically after 20 minutes

3. **Winner Selection**
   - Owner draws 5 winners per pool
   - Uses FHE randomness (euint32)
   - Self-relaying public decrypt flow
   - Winners share 90% of pool
   - Protocol takes 10%

4. **Reward System**
   - Winners stored onchain with percentages
   - Winners can claim rewards
   - Protocol fee automatically transferred

### Contract Functions
- `enterPool()` - Enter current active pool with 5 MAZA tokens
- `closePool(uint256 poolId)` - Close a pool (automatic or manual)
- `generateRandomSeed(uint256 poolId)` - Generate encrypted random seed (owner only)
- `drawWinners(uint256 poolId, bytes cleartexts, bytes decryptionProof)` - Draw winners using decrypted seed (owner only)
- `claimReward(uint256 poolId)` - Claim reward if user is a winner
- `getPool(uint256 poolId)` - Get pool details
- `getPoolWinners(uint256 poolId)` - Get winners for a pool
- `isWinner(uint256 poolId, address user)` - Check if user is a winner

## Frontend Features

### Components Needed
1. **Raffle Component** (`FheRaffle.tsx`)
   - Pool entry interface
   - Countdown timer (20 minutes)
   - Current pool status display
   - Winner display
   - Reward claiming interface
   - Owner functions (draw winners)

2. **Pool Status Display**
   - Current pool ID
   - Time remaining
   - Total entries
   - Total pool amount
   - Participant count

3. **Entry Interface**
   - ERC20 token approval flow
   - Enter pool button
   - Balance display

4. **Winner Display**
   - List of winners
   - Reward amounts
   - Claim status

5. **Owner Panel**
   - Generate random seed button
   - Draw winners button (with self-relaying decrypt)
   - Close pool button

### Flow for Drawing Winners
1. Owner calls `generateRandomSeed(poolId)`
2. Contract generates encrypted random seed and makes it publicly decryptable
3. Frontend fetches the handle from contract
4. Frontend calls `publicDecryptWithProof(handle)` from fhevm.js
5. Frontend receives `{cleartexts, decryptionProof, decryptedValue}`
6. Owner calls `drawWinners(poolId, cleartexts, decryptionProof)`
7. Contract verifies proof, selects winners, and distributes rewards

## Technical Details

### ERC20 Token Integration
- MAZA token address needs to be provided during deployment
- Users must approve contract to spend tokens before entering
- Contract uses SafeERC20 for secure token transfers

### FHE Randomness
- Uses `FHE.randEuint32()` for random seed generation
- Seed is expanded to uint256 deterministically using keccak256
- Public decrypt flow allows anyone to decrypt and verify

### Self-Relaying Flow
- `publicDecryptWithProof()` function in fhevm.js
- Returns both cleartexts (ABI-encoded) and decryption proof
- Owner submits both to contract for verification

## Deployment

### Environment Variables Needed
- `MAZA_TOKEN_ADDRESS` - Address of MAZA ERC20 token
- `PROTOCOL_FEE_RECIPIENT` - Address to receive protocol fees
- `VITE_CONTRACT_ADDRESS_SEPOLIA` - Deployed Raffle contract address (for frontend)

### Deployment Steps
1. Deploy MAZA token (if not already deployed)
2. Deploy Raffle contract with MAZA token address and fee recipient
3. Update frontend with contract address
4. Update frontend ABI from artifacts

## Next Steps
1. ✅ Create Raffle contract
2. ✅ Create deployment script
3. ✅ Add self-relaying decrypt function
4. ⏳ Create frontend Raffle component
5. ⏳ Update App.tsx to use Raffle component
6. ⏳ Test end-to-end flow

