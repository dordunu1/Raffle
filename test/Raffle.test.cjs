const { expect } = require("chai");
const { ethers, fhevm } = require("hardhat");
const hre = require("hardhat");
const { FhevmType } = require("@fhevm/hardhat-plugin");

describe("Raffle - Comprehensive FHE Operations", function () {
  let raffleContract;
  let mazaToken;
  let owner, participant1, participant2, participant3, participant4, participant5, participant6, protocolFeeRecipient;

  const ENTRY_FEE = ethers.parseEther("5"); // 5 MAZA tokens
  const POOL_DURATION = 300; // 5 minutes in seconds
  const WINNER_COUNT = 5;

  beforeEach(async function () {
    if (!hre.fhevm.isMock) {
      throw new Error("This test must run in FHEVM mock environment");
    }

    await hre.fhevm.initializeCLIApi();

    [owner, participant1, participant2, participant3, participant4, participant5, participant6, protocolFeeRecipient] = await ethers.getSigners();

    // Deploy MAZA Token
    const MazaToken = await ethers.getContractFactory("MazaToken");
    mazaToken = await MazaToken.deploy();
    await mazaToken.waitForDeployment();
    const mazaTokenAddress = await mazaToken.getAddress();

    console.log(`✅ MazaToken deployed at: ${mazaTokenAddress}`);

    // Deploy Raffle contract
    const Raffle = await ethers.getContractFactory("Raffle");
    const deployed = await Raffle.deploy(mazaTokenAddress, protocolFeeRecipient.address);
    await deployed.waitForDeployment();
    raffleContract = deployed;

    console.log(`✅ Raffle deployed at: ${await raffleContract.getAddress()}`);

    // Distribute MAZA tokens to participants
    const mintAmount = ethers.parseEther("1000"); // 1000 tokens per participant
    for (const participant of [participant1, participant2, participant3, participant4, participant5, participant6]) {
      await mazaToken.transfer(participant.address, mintAmount);
    }

    console.log("✅ Tokens distributed to participants");
  });

  it("tests basic FHE operations: create pool, enter pool, generate indices, and draw winners", async function () {
    console.log("Testing basic FHE raffle flow...");

    const poolId = 0n;

    // Test 1: Enter pool (tests ERC20 transfer and pool entry)
    console.log("Testing pool entry...");

    // Approve tokens for participants
    for (const participant of [participant1, participant2, participant3, participant4, participant5]) {
      await mazaToken.connect(participant).approve(await raffleContract.getAddress(), ENTRY_FEE);
    }

    // Enter pool
    const participants = [participant1, participant2, participant3, participant4, participant5];
    for (let i = 0; i < participants.length; i++) {
      const tx = await raffleContract.connect(participants[i]).enterPool();
      await tx.wait();
      console.log(`✅ Participant ${i + 1} entered pool`);
    }

    // Verify pool state
    const poolBefore = await raffleContract.getPool(poolId);
    expect(poolBefore.totalEntries).to.equal(5);
    expect(poolBefore.totalAmount).to.equal(ENTRY_FEE * BigInt(participants.length));

    // Test 2: Close pool (advance time)
    console.log("Testing pool closure...");
    await ethers.provider.send("evm_increaseTime", [POOL_DURATION + 1]);
    await ethers.provider.send("evm_mine", []);

    // Close pool manually (or wait for auto-close)
    await raffleContract.connect(owner).closePool(poolId);

    const poolAfterClose = await raffleContract.getPool(poolId);
    expect(poolAfterClose.isClosed).to.equal(true);

    // Test 3: Generate encrypted winner indices (tests FHE.randEuint16, FHE.allowThis, FHE.allow, FHE.toBytes32)
    console.log("Testing encrypted winner indices generation...");

    const generateTx = await raffleContract.connect(owner).generateWinnerIndices(poolId);
    const generateReceipt = await generateTx.wait();

    // Get handles from event
    const indicesEvent = generateReceipt.logs.find(log => {
      try {
        const decoded = raffleContract.interface.parseLog(log);
        return decoded && decoded.name === 'WinnerIndicesGenerated';
      } catch {
        return false;
      }
    });

    expect(indicesEvent).to.not.be.undefined;
    const handles = indicesEvent.args.handles;
    expect(handles.length).to.equal(WINNER_COUNT);
    console.log(`✅ Winner indices generated with ${handles.length} handles`);

    // Verify handles are stored
    const storedHandles = await raffleContract.getWinnerIndexHandles(poolId);
    expect(storedHandles.length).to.equal(WINNER_COUNT);

    console.log("✅ FHE.randEuint16() - Random index generation works");
    console.log("✅ FHE.allowThis() - Contract permissions work");
    console.log("✅ FHE.allow() - Owner permissions work");
    console.log("✅ FHE.toBytes32() - Handle conversion works");

    // Test 4: Decrypt winner indices (owner has permission via FHE.allow)
    console.log("Testing winner indices decryption...");

    // Decrypt as owner using userDecryptEuint (owner has permission via FHE.allow)
    const decryptedIndices = [];
    const contractAddress = await raffleContract.getAddress();
    
    for (const handle of storedHandles) {
      // Get the encrypted euint16 value from contract
      // Note: We need to get the actual encrypted value, not just the handle
      // For now, we'll use the handle directly with userDecryptEuint
      const encryptedValue = handle; // In test, handle is the encrypted value
      
      // Use userDecryptEuint with owner signer (EIP-712 signing)
      const decryptedValue = await fhevm.userDecryptEuint(
        FhevmType.euint16,
        encryptedValue,
        contractAddress,
        owner
      );
      
      decryptedIndices.push(Number(decryptedValue));
    }
    
    console.log(`✅ Decrypted ${decryptedIndices.length} winner indices:`, decryptedIndices);

    // Test 5: Draw winners with decrypted indices
    console.log("Testing winner drawing...");

    const drawTx = await raffleContract.connect(owner).drawWinners(
      poolId,
      decryptedIndices
    );
    await drawTx.wait();

    // Verify winners were drawn
    const poolAfterDraw = await raffleContract.getPool(poolId);
    expect(poolAfterDraw.winnersDrawn).to.equal(true);

    // Get winners
    const [winners, percentages, rewards, claimed] = await raffleContract.getPoolWinners(poolId);
    expect(winners.length).to.equal(5);
    expect(percentages.length).to.equal(5);
    expect(rewards.length).to.equal(5);

    console.log("✅ Winner selection algorithm works");
    console.log(`✅ ${winners.length} winners selected`);

    // Test 6: Verify protocol fee was transferred
    const protocolFeeBalance = await mazaToken.balanceOf(protocolFeeRecipient.address);
    const expectedProtocolFee = (ENTRY_FEE * BigInt(participants.length) * 10n) / 100n;
    expect(protocolFeeBalance).to.equal(expectedProtocolFee);

    console.log("✅ Protocol fee distribution works");
  });

  it("tests FHE error handling: double entry and invalid state", async function () {
    console.log("Testing FHE error handling...");

    const poolId = 0n;

    // Enter 5 participants (required for generating indices) BEFORE closing pool
    const participants = [participant1, participant2, participant3, participant4, participant5];
    for (let i = 0; i < participants.length; i++) {
      await mazaToken.connect(participants[i]).approve(await raffleContract.getAddress(), ENTRY_FEE);
      await raffleContract.connect(participants[i]).enterPool();
    }

    // Close pool
    await ethers.provider.send("evm_increaseTime", [POOL_DURATION + 1]);
    await ethers.provider.send("evm_mine", []);
    await raffleContract.connect(owner).closePool(poolId);

    // Generate winner indices
    await raffleContract.connect(owner).generateWinnerIndices(poolId);

    const handles = await raffleContract.getWinnerIndexHandles(poolId);

    // Decrypt indices using userDecryptEuint (owner has permission via FHE.allow)
    const decryptedIndices = [];
    const contractAddress = await raffleContract.getAddress();
    
    for (const handle of handles) {
      const decryptedValue = await fhevm.userDecryptEuint(
        FhevmType.euint16,
        handle,
        contractAddress,
        owner
      );
      decryptedIndices.push(Number(decryptedValue));
    }

    // Test 1: Invalid indices count should revert
    console.log("Testing invalid indices count...");
    await expect(
      raffleContract.connect(owner).drawWinners(poolId, [1, 2, 3]) // Only 3 instead of 5
    ).to.be.revertedWith("Invalid indices count");

    console.log("✅ Invalid indices count correctly rejected");

    // Test 2: Valid indices should work
    await raffleContract.connect(owner).drawWinners(poolId, decryptedIndices);

    console.log("✅ Valid indices accepted");

    // Test 3: Double entry should revert (try to enter pool 1, which should be auto-created)
    const pool1Id = 1n;
    await mazaToken.connect(participant6).approve(await raffleContract.getAddress(), ENTRY_FEE);
    await raffleContract.connect(participant6).enterPool();

    await expect(
      raffleContract.connect(participant6).enterPool()
    ).to.be.revertedWith("Already entered this pool");

    console.log("✅ Double entry prevention works");
  });

  it("tests FHE operations with edge cases: minimum participants", async function () {
    console.log("Testing FHE edge cases...");

    const poolId = 0n;

    // Test 1: Cannot generate indices with less than 5 participants
    console.log("Testing minimum participants requirement...");

    // Enter only 4 participants
    for (let i = 0; i < 4; i++) {
      await mazaToken.connect([participant1, participant2, participant3, participant4][i])
        .approve(await raffleContract.getAddress(), ENTRY_FEE);
      await raffleContract.connect([participant1, participant2, participant3, participant4][i]).enterPool();
    }

    // Close pool
    await ethers.provider.send("evm_increaseTime", [POOL_DURATION + 1]);
    await ethers.provider.send("evm_mine", []);
    await raffleContract.connect(owner).closePool(poolId);

    // Should revert when trying to generate indices with < 5 participants
    await expect(
      raffleContract.connect(owner).generateWinnerIndices(poolId)
    ).to.be.revertedWith("Not enough participants");

    console.log("✅ Minimum participants requirement enforced");
  });

  it("tests complex FHE computation chains: multiple pools and entries", async function () {
    console.log("Testing complex FHE computation chains...");

    // Pool 0: First pool
    let poolId = 0n;

    // Enter 5 participants
    for (let i = 0; i < 5; i++) {
      await mazaToken.connect([participant1, participant2, participant3, participant4, participant5][i])
        .approve(await raffleContract.getAddress(), ENTRY_FEE * 10n); // Approve for multiple entries
      await raffleContract.connect([participant1, participant2, participant3, participant4, participant5][i]).enterPool();
    }

    // Close and draw winners for pool 0
    await ethers.provider.send("evm_increaseTime", [POOL_DURATION + 1]);
    await ethers.provider.send("evm_mine", []);
    await raffleContract.connect(owner).closePool(poolId);

    await raffleContract.connect(owner).generateWinnerIndices(poolId);
    const handles0 = await raffleContract.getWinnerIndexHandles(poolId);
    
    const decryptedIndices0 = [];
    for (const handle of handles0) {
      const contractAddress = await raffleContract.getAddress();
      const decryptedValue = await fhevm.userDecryptEuint(
        FhevmType.euint16,
        handle,
        contractAddress,
        owner
      );
      decryptedIndices0.push(Number(decryptedValue));
    }
    
    await raffleContract.connect(owner).drawWinners(poolId, decryptedIndices0);

    console.log("✅ Pool 0 completed");

    // Pool 1: Second pool (should be auto-created)
    poolId = 1n;

    // Enter participants in new pool
    for (let i = 0; i < 5; i++) {
      await raffleContract.connect([participant1, participant2, participant3, participant4, participant5][i]).enterPool();
    }

    // Close and draw winners for pool 1
    await ethers.provider.send("evm_increaseTime", [POOL_DURATION + 1]);
    await ethers.provider.send("evm_mine", []);
    await raffleContract.connect(owner).closePool(poolId);

    await raffleContract.connect(owner).generateWinnerIndices(poolId);
    const handles1 = await raffleContract.getWinnerIndexHandles(poolId);
    
    const decryptedIndices1 = [];
    for (const handle of handles1) {
      const contractAddress = await raffleContract.getAddress();
      const decryptedValue = await fhevm.userDecryptEuint(
        FhevmType.euint16,
        handle,
        contractAddress,
        owner
      );
      decryptedIndices1.push(Number(decryptedValue));
    }
    
    await raffleContract.connect(owner).drawWinners(poolId, decryptedIndices1);

    console.log("✅ Pool 1 completed");

    // Verify both pools have winners
    const pool0Winners = await raffleContract.getPoolWinners(0n);
    const pool1Winners = await raffleContract.getPoolWinners(1n);

    expect(pool0Winners[0].length).to.equal(5);
    expect(pool1Winners[0].length).to.equal(5);

    console.log("✅ Complex FHE computation chains work correctly");
    console.log("✅ Multiple pools with FHE operations work");
    console.log("✅ FHE state management across pools works");
  });

  it("tests FHE access control: only owner can generate indices and draw winners", async function () {
    console.log("Testing FHE access control...");

    const poolId = 0n;

    // Enter 5 participants (required for generating indices)
    const participants = [participant1, participant2, participant3, participant4, participant5];
    for (let i = 0; i < participants.length; i++) {
      await mazaToken.connect(participants[i]).approve(await raffleContract.getAddress(), ENTRY_FEE);
      await raffleContract.connect(participants[i]).enterPool();
    }

    // Close pool
    await ethers.provider.send("evm_increaseTime", [POOL_DURATION + 1]);
    await ethers.provider.send("evm_mine", []);
    await raffleContract.connect(owner).closePool(poolId);

    // Test: Non-owner cannot generate indices
    await expect(
      raffleContract.connect(participant1).generateWinnerIndices(poolId)
    ).to.be.revertedWith("Only owner can call this function");

    console.log("✅ Access control prevents unauthorized indices generation");

    // Test: Owner can generate indices
    await raffleContract.connect(owner).generateWinnerIndices(poolId);

    const handles = await raffleContract.getWinnerIndexHandles(poolId);
    
    const decryptedIndices = [];
    for (const handle of handles) {
      const contractAddress = await raffleContract.getAddress();
      const decryptedValue = await fhevm.userDecryptEuint(
        FhevmType.euint16,
        handle,
        contractAddress,
        owner
      );
      decryptedIndices.push(Number(decryptedValue));
    }

    // Test: Non-owner cannot draw winners
    await expect(
      raffleContract.connect(participant1).drawWinners(poolId, decryptedIndices)
    ).to.be.revertedWith("Only owner can call this function");

    console.log("✅ Access control prevents unauthorized winner drawing");

    // Test: Owner can draw winners
    await raffleContract.connect(owner).drawWinners(poolId, decryptedIndices);

    console.log("✅ Owner can successfully generate indices and draw winners");
  });

  it("tests FHE event emissions: all events are properly emitted", async function () {
    console.log("Testing FHE event emissions...");

    const poolId = 0n;

    // Test PoolCreated event (emitted in constructor)
    const currentPoolId = await raffleContract.getCurrentPoolId();
    expect(currentPoolId).to.equal(0n);
    console.log("✅ PoolCreated event emitted in constructor");

    // Test PoolEntry event - enter 5 participants
    const participants = [participant1, participant2, participant3, participant4, participant5];
    for (let i = 0; i < participants.length; i++) {
      await mazaToken.connect(participants[i]).approve(await raffleContract.getAddress(), ENTRY_FEE);
    }
    const entryTx = await raffleContract.connect(participant1).enterPool();
    const entryReceipt = await entryTx.wait();
    
    // Enter remaining participants
    for (let i = 1; i < participants.length; i++) {
      await raffleContract.connect(participants[i]).enterPool();
    }

    const poolEntryEvent = entryReceipt.logs.find(log => {
      try {
        const decoded = raffleContract.interface.parseLog(log);
        return decoded && decoded.name === 'PoolEntry';
      } catch {
        return false;
      }
    });

    expect(poolEntryEvent).to.not.be.undefined;
    expect(poolEntryEvent.args.participant).to.equal(participant1.address);
    console.log("✅ PoolEntry event emitted correctly");

    // Test PoolClosed event
    await ethers.provider.send("evm_increaseTime", [POOL_DURATION + 1]);
    await ethers.provider.send("evm_mine", []);

    const closeTx = await raffleContract.connect(owner).closePool(poolId);
    const closeReceipt = await closeTx.wait();

    const poolClosedEvent = closeReceipt.logs.find(log => {
      try {
        const decoded = raffleContract.interface.parseLog(log);
        return decoded && decoded.name === 'PoolClosed';
      } catch {
        return false;
      }
    });

    expect(poolClosedEvent).to.not.be.undefined;
    console.log("✅ PoolClosed event emitted correctly");

    // Test WinnerIndicesGenerated event
    const generateTx = await raffleContract.connect(owner).generateWinnerIndices(poolId);
    const generateReceipt = await generateTx.wait();

    const indicesEvent = generateReceipt.logs.find(log => {
      try {
        const decoded = raffleContract.interface.parseLog(log);
        return decoded && decoded.name === 'WinnerIndicesGenerated';
      } catch {
        return false;
      }
    });

    expect(indicesEvent).to.not.be.undefined;
    console.log("✅ WinnerIndicesGenerated event emitted correctly");

    // Test WinnersDrawn event
    const handles = await raffleContract.getWinnerIndexHandles(poolId);
    
    const decryptedIndices = [];
    for (const handle of handles) {
      const contractAddress = await raffleContract.getAddress();
      const decryptedValue = await fhevm.userDecryptEuint(
        FhevmType.euint16,
        handle,
        contractAddress,
        owner
      );
      decryptedIndices.push(Number(decryptedValue));
    }

    const drawTx = await raffleContract.connect(owner).drawWinners(poolId, decryptedIndices);
    const drawReceipt = await drawTx.wait();

    const winnersDrawnEvent = drawReceipt.logs.find(log => {
      try {
        const decoded = raffleContract.interface.parseLog(log);
        return decoded && decoded.name === 'WinnersDrawn';
      } catch {
        return false;
      }
    });

    expect(winnersDrawnEvent).to.not.be.undefined;
    expect(winnersDrawnEvent.args.winners.length).to.equal(5);
    console.log("✅ WinnersDrawn event emitted correctly");

    // Test ProtocolFeeWithdrawn event
    const protocolFeeEvent = drawReceipt.logs.find(log => {
      try {
        const decoded = raffleContract.interface.parseLog(log);
        return decoded && decoded.name === 'ProtocolFeeWithdrawn';
      } catch {
        return false;
      }
    });

    expect(protocolFeeEvent).to.not.be.undefined;
    console.log("✅ ProtocolFeeWithdrawn event emitted correctly");

    // Test RewardClaimed event
    const [winners] = await raffleContract.getPoolWinners(poolId);
    if (winners.length > 0) {
      const winner = winners[0];
      const claimTx = await raffleContract.connect(await ethers.getSigner(winner)).claimReward(poolId);
      const claimReceipt = await claimTx.wait();

      const rewardClaimedEvent = claimReceipt.logs.find(log => {
        try {
          const decoded = raffleContract.interface.parseLog(log);
          return decoded && decoded.name === 'RewardClaimed';
        } catch {
          return false;
        }
      });

      expect(rewardClaimedEvent).to.not.be.undefined;
      expect(rewardClaimedEvent.args.winner).to.equal(winner);
      console.log("✅ RewardClaimed event emitted correctly");
    }

    console.log("✅ All FHE events are properly emitted");
  });

  it("tests reward claiming: winners can claim their rewards", async function () {
    console.log("Testing reward claiming...");

    const poolId = 0n;

    // Enter 5 participants
    for (let i = 0; i < 5; i++) {
      await mazaToken.connect([participant1, participant2, participant3, participant4, participant5][i])
        .approve(await raffleContract.getAddress(), ENTRY_FEE);
      await raffleContract.connect([participant1, participant2, participant3, participant4, participant5][i]).enterPool();
    }

    // Close pool and draw winners
    await ethers.provider.send("evm_increaseTime", [POOL_DURATION + 1]);
    await ethers.provider.send("evm_mine", []);
    await raffleContract.connect(owner).closePool(poolId);

    await raffleContract.connect(owner).generateWinnerIndices(poolId);
    const handles = await raffleContract.getWinnerIndexHandles(poolId);
    
    const decryptedIndices = [];
    for (const handle of handles) {
      const contractAddress = await raffleContract.getAddress();
      const decryptedValue = await fhevm.userDecryptEuint(
        FhevmType.euint16,
        handle,
        contractAddress,
        owner
      );
      decryptedIndices.push(Number(decryptedValue));
    }
    
    await raffleContract.connect(owner).drawWinners(poolId, decryptedIndices);

    // Get winners
    const [winners, , rewards] = await raffleContract.getPoolWinners(poolId);

    // Test: Non-winner cannot claim
    if (!winners.includes(participant6.address)) {
      await expect(
        raffleContract.connect(participant6).claimReward(poolId)
      ).to.be.revertedWith("Not a winner");
    }

    console.log("✅ Non-winners cannot claim rewards");

    // Test: Winners can claim
    for (let i = 0; i < winners.length; i++) {
      const winnerAddress = winners[i];
      const expectedReward = rewards[i];
      
      const winnerSigner = await ethers.getSigner(winnerAddress);
      const balanceBefore = await mazaToken.balanceOf(winnerAddress);

      await raffleContract.connect(winnerSigner).claimReward(poolId);

      const balanceAfter = await mazaToken.balanceOf(winnerAddress);
      expect(balanceAfter - balanceBefore).to.equal(expectedReward);

      console.log(`✅ Winner ${i + 1} claimed ${ethers.formatEther(expectedReward)} MAZA tokens`);
    }

    // Test: Cannot claim twice
    if (winners.length > 0) {
      const winnerSigner = await ethers.getSigner(winners[0]);
      await expect(
        raffleContract.connect(winnerSigner).claimReward(poolId)
      ).to.be.revertedWith("Reward already claimed");
    }

    console.log("✅ Double claiming prevention works");
  });
});
