# Contract ABIs

This directory contains the contract ABIs used by the frontend.

## Updating ABIs After Compilation

After compiling the contracts with `npm run compile`, update the ABI files with the full ABIs from the artifacts:

### Raffle Contract
1. Compile: `npm run compile`
2. Copy the `abi` array from `artifacts/contracts/Raffle.sol/Raffle.json`
3. Replace the `RAFFLE_ABI` array in `Raffle.ts`

### ERC20 Token
The ERC20 ABI is standard and shouldn't need updates unless using a custom token with additional functions.

## File Structure
- `Raffle.ts` - Raffle contract ABI
- `ERC20.ts` - Standard ERC20 token ABI

