#!/usr/bin/env node

/**
 * Script to update Raffle ABI from compiled artifacts
 * Usage: node scripts/update-abi.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const artifactsPath = path.join(__dirname, '../artifacts/contracts/Raffle.sol/Raffle.json');
const abiPath = path.join(__dirname, '../src/lib/abis/Raffle.ts');

try {
  // Read the compiled artifact
  const artifact = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'));
  const abi = artifact.abi;

  // Read the current ABI file
  let abiFile = fs.readFileSync(abiPath, 'utf8');

  // Replace the ABI array (between export const RAFFLE_ABI = [ and ] as const;)
  const abiString = JSON.stringify(abi, null, 2);
  const updatedFile = abiFile.replace(
    /export const RAFFLE_ABI = \[[\s\S]*?\] as const;/,
    `export const RAFFLE_ABI = ${abiString} as const;`
  );

  // Write the updated file
  fs.writeFileSync(abiPath, updatedFile, 'utf8');

  console.log('✅ Successfully updated Raffle ABI from artifacts');
  console.log(`   Updated ${abi.length} ABI entries`);
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('❌ Error: Artifacts not found. Please run "npm run compile" first.');
  } else {
    console.error('❌ Error updating ABI:', error.message);
  }
  process.exit(1);
}

