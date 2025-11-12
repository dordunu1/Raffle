const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying CoinToss contract with Draw Lots functionality...");
  
  // Deploy CoinToss contract (now includes draw lots)
  const CoinToss = await ethers.getContractFactory("CoinToss");
  const coinToss = await CoinToss.deploy();
  await coinToss.waitForDeployment();
  const coinTossAddress = await coinToss.getAddress();
  
  console.log("✅ CoinToss contract deployed to:", coinTossAddress);
  console.log("📋 Contract ABI available in artifacts/contracts/CoinToss.sol/CoinToss.json");
  console.log("🎲 Features: Coin Toss + Draw Lots with FHE randomness");
  console.log("🔐 Uses FHE.randEbool() for coin tosses and FHE.randEuint8() for draws");
  console.log("📦 Updated for @fhevm/solidity 0.9.0");
  
  return coinTossAddress;
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

