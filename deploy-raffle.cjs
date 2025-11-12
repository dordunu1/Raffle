const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying Raffle contract...");
  
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  
  // TODO: Replace with actual MAZA token address
  // For now, we'll use a placeholder - you'll need to deploy or provide the MAZA token address
  const MAZA_TOKEN_ADDRESS = process.env.MAZA_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000";
  const PROTOCOL_FEE_RECIPIENT = process.env.PROTOCOL_FEE_RECIPIENT || deployer.address;
  
  if (MAZA_TOKEN_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.warn("⚠️  WARNING: MAZA_TOKEN_ADDRESS not set. Using zero address.");
    console.warn("⚠️  Please set MAZA_TOKEN_ADDRESS environment variable or update deploy script.");
  }
  
  console.log("🪙 MAZA Token Address:", MAZA_TOKEN_ADDRESS);
  console.log("💰 Protocol Fee Recipient:", PROTOCOL_FEE_RECIPIENT);
  
  // Deploy Raffle contract
  const Raffle = await ethers.getContractFactory("Raffle");
  const raffle = await Raffle.deploy(MAZA_TOKEN_ADDRESS, PROTOCOL_FEE_RECIPIENT);
  await raffle.waitForDeployment();
  const raffleAddress = await raffle.getAddress();
  
  console.log("✅ Raffle contract deployed to:", raffleAddress);
  console.log("📋 Contract ABI available in artifacts/contracts/Raffle.sol/Raffle.json");
  console.log("🎲 Features:");
  console.log("   - Pool-based raffle system");
  console.log("   - 20-minute pool windows");
  console.log("   - 5 MAZA token entry fee");
  console.log("   - FHE-powered random winner selection");
  console.log("   - 5 winners per pool");
  console.log("   - 90% to winners, 10% protocol fee");
  console.log("🔐 Uses FHE.randEuint32() for randomness");
  console.log("📦 Updated for @fhevm/solidity 0.9.0");
  
  return raffleAddress;
}

main()
  .then((address) => {
    console.log("🎯 Deployment successful! Address:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });

