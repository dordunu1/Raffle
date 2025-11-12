# FHE Raffle App

A pool-based raffle system powered by Fully Homomorphic Encryption (FHE) for truly random and verifiable winner selection.

## Overview

The Raffle app is a decentralized application that runs raffles in 20-minute pools. Users can enter pools by paying 5 MAZA tokens, and after each pool closes, 5 winners are selected using FHE-powered randomness. Winners share 90% of the pool, while 10% goes to the protocol.

## Features

### Contract Features (Raffle.sol)
- ✅ Pool system with IDs starting from 0
- ✅ 20-minute pool windows
- ✅ ERC20 token integration (MAZA tokens)
- ✅ 5 winners per pool
- ✅ FHE randomness for fair winner selection
- ✅ Self-relaying public decrypt flow
- ✅ Onchain winner storage with percentages
- ✅ Reward claiming system
- ✅ Automatic protocol fee distribution

### Frontend Features
- ✅ Pool entry interface with ERC20 approval flow
- ✅ Real-time countdown timer
- ✅ Pool status display
- ✅ Winner display with claim status
- ✅ Owner panel for drawing winners
- ✅ Reward claiming interface
- ✅ MAZA token balance and allowance display

## Project Structure

```
Raffle/
├── contracts/
│   └── Raffle.sol              # Main raffle contract
├── src/
│   ├── components/
│   │   └── FheRaffle.tsx       # Main raffle component
│   ├── lib/
│   │   └── fhevm.js            # FHE utilities (includes publicDecryptWithProof)
│   └── App.tsx                 # Main app component
├── deploy-raffle.cjs           # Deployment script
└── package.json                # Dependencies
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd Raffle
npm install
```

### 2. Deploy MAZA Token (if not already deployed)

You need to deploy or have the address of the MAZA ERC20 token. The token should have 18 decimals.

### 3. Deploy Raffle Contract

Set environment variables:
```bash
export MAZA_TOKEN_ADDRESS=0x...  # Your MAZA token address
export PROTOCOL_FEE_RECIPIENT=0x...  # Address to receive protocol fees
```

Deploy the contract:
```bash
npm run compile
node deploy-raffle.cjs
```

### 4. Configure Frontend

Create a `.env` file in the Raffle directory:
```env
VITE_RAFFLE_CONTRACT_ADDRESS_SEPOLIA=0x...  # Deployed Raffle contract address
```

### 5. Run the App

```bash
npm run dev
```

## Contract Functions

### User Functions
- `enterPool()` - Enter the current active pool (requires 5 MAZA tokens)
- `claimReward(uint256 poolId)` - Claim reward if you're a winner

### Owner Functions
- `generateRandomSeed(uint256 poolId)` - Generate encrypted random seed
- `drawWinners(uint256 poolId, bytes cleartexts, bytes decryptionProof)` - Draw winners using decrypted seed

### View Functions
- `getPool(uint256 poolId)` - Get pool details
- `getPoolWinners(uint256 poolId)` - Get winners for a pool
- `isWinner(uint256 poolId, address user)` - Check if user is a winner
- `getCurrentPoolId()` - Get current active pool ID
- `getEncryptedRandomSeed(uint256 poolId)` - Get encrypted random seed handle

## Flow for Drawing Winners

1. **Pool Closes**: After 20 minutes, the pool automatically closes
2. **Generate Random Seed**: Owner calls `generateRandomSeed(poolId)`
   - Contract generates encrypted random seed using `FHE.randEuint32()`
   - Makes it publicly decryptable
3. **Decrypt Seed**: Frontend fetches handle and calls `publicDecryptWithProof(handle)`
   - Returns `{cleartexts, decryptionProof, decryptedValue}`
4. **Draw Winners**: Owner calls `drawWinners(poolId, cleartexts, decryptionProof)`
   - Contract verifies proof
   - Selects 5 random winners
   - Stores winners onchain
   - Transfers protocol fee
5. **Claim Rewards**: Winners call `claimReward(poolId)` to claim their share

## Constants

- `POOL_DURATION`: 20 minutes
- `ENTRY_FEE`: 5 MAZA tokens (5 ether assuming 18 decimals)
- `WINNER_COUNT`: 5 winners per pool
- `PROTOCOL_FEE_PERCENTAGE`: 10%
- `WINNER_SHARE_PERCENTAGE`: 90%

## Technical Details

### FHE Randomness
- Uses `FHE.randEuint32()` for random seed generation
- Seed is expanded to uint256 deterministically using keccak256
- Public decrypt flow allows verification of randomness

### Self-Relaying Flow
The `publicDecryptWithProof()` function in `fhevm.js`:
- Fetches encrypted handle from contract
- Calls FHE relayer's public decrypt
- Returns both ABI-encoded cleartexts and decryption proof
- Owner submits both to contract for verification

### ERC20 Integration
- Uses OpenZeppelin's SafeERC20 for secure token transfers
- Users must approve contract before entering pools
- Contract handles token transfers automatically

## Environment Variables

### Required for Deployment
- `MAZA_TOKEN_ADDRESS` - ERC20 token address
- `PROTOCOL_FEE_RECIPIENT` - Address to receive fees
- `MNEMONIC` - Deployment wallet mnemonic
- `INFURA_API_KEY` - Infura API key for Sepolia

### Required for Frontend
- `VITE_RAFFLE_CONTRACT_ADDRESS_SEPOLIA` - Deployed contract address

## Next Steps

1. ✅ Contract implementation complete
2. ✅ Frontend component complete
3. ⏳ Deploy MAZA token (if needed)
4. ⏳ Deploy Raffle contract
5. ⏳ Test end-to-end flow
6. ⏳ Add additional UI polish if needed

## Notes

- The contract automatically creates a new pool when the previous one closes (if it had participants)
- If a pool has no participants, it extends the current pool duration
- Winners are selected using a deterministic algorithm based on the decrypted random seed
- All winners share equally (18% each of the 90% pool, or 20% each if calculated differently)

## License

MIT

