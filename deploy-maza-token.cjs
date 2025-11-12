const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying MAZA Token...");
  
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("📝 Deploying with account:", deployer.address);
  
  // Deploy MAZA Token
  const MazaToken = await ethers.getContractFactory("MazaToken");
  const mazaToken = await MazaToken.deploy();
  await mazaToken.waitForDeployment();
  const mazaTokenAddress = await mazaToken.getAddress();
  
  console.log("✅ MAZA Token deployed to:", mazaTokenAddress);
  console.log("📋 Token Name:", await mazaToken.name());
  console.log("📋 Token Symbol:", await mazaToken.symbol());
  console.log("💰 Total Supply:", ethers.formatEther(await mazaToken.totalSupply()), "MAZA");
  
  return mazaTokenAddress;
}

main()
  .then((address) => {
    console.log("🎯 MAZA Token deployment successful! Address:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });

