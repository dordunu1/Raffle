// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {EthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title FHE Raffle Contract
/// @notice A contract that runs raffles with FHE-powered randomness
/// @dev Uses FHE randomness to select winners fairly and transparently
contract Raffle is EthereumConfig {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant POOL_DURATION = 5 minutes; // 5 minutes per pool (for testing)
    uint256 public constant ENTRY_FEE = 5 ether; // 5 MAZA tokens (assuming 18 decimals)
    uint256 public constant WINNER_COUNT = 5; // 5 winners per pool
    uint256 public constant PROTOCOL_FEE_PERCENTAGE = 10; // 10% protocol fee
    uint256 public constant WINNER_SHARE_PERCENTAGE = 90; // 90% to winners

    // ERC20 token address (MAZA token)
    IERC20 public immutable mazaToken;

    // Pool structure
    struct Pool {
        uint256 poolId;
        uint256 startTime;
        uint256 endTime;
        uint256 totalEntries;
        uint256 totalAmount; // Total MAZA tokens collected
        address[] participants; // Array of participant addresses
        bool isClosed;
        bool winnersDrawn;
        euint32 encryptedRandomSeed; // Encrypted random seed for winner selection
        bytes32 randomSeedHandle; // Handle for the encrypted random seed
        bool randomSeedRevealed;
        uint256 revealedRandomSeed; // Plain text random seed after decryption (expanded from euint32)
        Winner[] winners; // Array of winners
    }

    // Winner structure
    struct Winner {
        address winnerAddress;
        uint256 sharePercentage; // Percentage of the 90% pool (in basis points, e.g., 2000 = 20%)
        uint256 rewardAmount; // Calculated reward amount
        bool claimed; // Whether the reward has been claimed
    }

    // Mapping: poolId => Pool
    mapping(uint256 => Pool) public pools;
    
    // Mapping: poolId => participant address => bool (to track if user already entered)
    mapping(uint256 => mapping(address => bool)) public hasEnteredPool;
    
    // Mapping: poolId => participant address => index in participants array
    mapping(uint256 => mapping(address => uint256)) public participantIndex;
    
    // Current active pool ID
    uint256 public currentPoolId;
    
    // Owner address
    address public owner;
    
    // Protocol fee recipient
    address public protocolFeeRecipient;

    // Events
    event PoolCreated(uint256 indexed poolId, uint256 startTime, uint256 endTime);
    event PoolStarted(uint256 indexed poolId, uint256 startTime, uint256 endTime);
    event PoolEntry(uint256 indexed poolId, address indexed participant, uint256 entryFee);
    event PoolClosed(uint256 indexed poolId, uint256 totalEntries, uint256 totalAmount);
    event RandomSeedGenerated(uint256 indexed poolId, bytes32 randomSeedHandle);
    event WinnersDrawn(uint256 indexed poolId, address[] winners, uint256[] percentages);
    event RewardClaimed(uint256 indexed poolId, address indexed winner, uint256 amount);
    event ProtocolFeeWithdrawn(uint256 indexed poolId, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier poolExists(uint256 poolId) {
        require(poolId <= currentPoolId, "Pool does not exist");
        _;
    }

    /// @notice Constructor
    /// @param _mazaTokenAddress Address of the MAZA ERC20 token
    /// @param _protocolFeeRecipient Address to receive protocol fees
    constructor(address _mazaTokenAddress, address _protocolFeeRecipient) {
        require(_mazaTokenAddress != address(0), "Invalid token address");
        require(_protocolFeeRecipient != address(0), "Invalid fee recipient");
        mazaToken = IERC20(_mazaTokenAddress);
        owner = msg.sender;
        protocolFeeRecipient = _protocolFeeRecipient;
        
        // Create the first pool
        _createNewPool();
    }

    /// @notice Create a new pool
    /// @dev Pool starts with startTime = 0, which means it hasn't started yet
    ///      The timer will start when the first entry is made
    function _createNewPool() internal {
        uint256 poolId = currentPoolId;
        
        Pool storage newPool = pools[poolId];
        newPool.poolId = poolId;
        newPool.startTime = 0; // 0 means pool hasn't started yet
        newPool.endTime = 0; // Will be set when first entry is made
        newPool.totalEntries = 0;
        newPool.totalAmount = 0;
        newPool.participants = new address[](0);
        newPool.isClosed = false;
        newPool.winnersDrawn = false;
        newPool.encryptedRandomSeed = euint32.wrap(0); // Will be set when random seed is generated
        newPool.randomSeedHandle = bytes32(0);
        newPool.randomSeedRevealed = false;
        newPool.revealedRandomSeed = 0;
        // winners array is automatically initialized as empty
        
        emit PoolCreated(poolId, 0, 0);
    }

    /// @notice Enter the current active pool
    /// @dev Transfers 5 MAZA tokens from user and adds them to the pool
    ///      If this is the first entry, start the pool timer
    ///      Pool auto-closes when countdown reaches 0 (no more entries allowed)
    function enterPool() external {
        uint256 poolId = currentPoolId;
        Pool storage pool = pools[poolId];
        
        // Auto-close pool if countdown has ended (time expired)
        if (pool.startTime > 0 && pool.endTime > 0 && block.timestamp >= pool.endTime && !pool.isClosed) {
            _closePool(poolId);
            // Reload pool reference after closing
            pool = pools[poolId];
        }
        
        require(!pool.isClosed, "Pool is closed");
        require(!hasEnteredPool[poolId][msg.sender], "Already entered this pool");
        
        // If this is the first entry, start the pool timer
        if (pool.startTime == 0) {
            pool.startTime = block.timestamp;
            pool.endTime = block.timestamp + POOL_DURATION;
            emit PoolStarted(poolId, pool.startTime, pool.endTime);
        }
        
        // Check if pool has closed (time expired) - this prevents entries when countdown is 0
        require(block.timestamp < pool.endTime, "Pool has closed");
        
        // Transfer tokens from user
        mazaToken.safeTransferFrom(msg.sender, address(this), ENTRY_FEE);
        
        // Add participant
        pool.participants.push(msg.sender);
        pool.totalEntries++;
        pool.totalAmount += ENTRY_FEE;
        hasEnteredPool[poolId][msg.sender] = true;
        participantIndex[poolId][msg.sender] = pool.participants.length - 1;
        
        emit PoolEntry(poolId, msg.sender, ENTRY_FEE);
    }

    /// @notice Close a pool (owner only - pools auto-close when time expires)
    /// @param poolId The ID of the pool to close
    function closePool(uint256 poolId) external onlyOwner poolExists(poolId) {
        Pool storage pool = pools[poolId];
        require(pool.startTime > 0, "Pool hasn't started yet");
        require(pool.endTime > 0, "Pool hasn't started yet");
        require(block.timestamp >= pool.endTime, "Pool is still active");
        require(!pool.isClosed, "Pool already closed");
        _closePool(poolId);
    }

    /// @notice Internal function to close a pool
    function _closePool(uint256 poolId) internal {
        Pool storage pool = pools[poolId];
        pool.isClosed = true;
        
        emit PoolClosed(poolId, pool.totalEntries, pool.totalAmount);
        
        // Create next pool if this one has participants
        if (pool.totalEntries > 0) {
            currentPoolId++;
            _createNewPool();
        } else {
            // If no participants, just extend current pool
            pool.endTime = block.timestamp + POOL_DURATION;
            pool.isClosed = false;
        }
    }

    /// @notice Generate encrypted random seed for drawing winners (owner only)
    /// @param poolId The ID of the pool
    /// @dev Auto-closes pool if countdown has ended (endTime reached)
    function generateRandomSeed(uint256 poolId) external onlyOwner poolExists(poolId) {
        Pool storage pool = pools[poolId];
        
        // Auto-close pool if countdown has ended (endTime reached)
        if (!pool.isClosed && pool.startTime > 0 && pool.endTime > 0 && block.timestamp >= pool.endTime) {
            _closePool(poolId);
            // Reload pool reference after closing
            pool = pools[poolId];
        }
        
        require(pool.isClosed, "Pool must be closed first (countdown must reach 0)");
        require(!pool.winnersDrawn, "Winners already drawn");
        require(pool.totalEntries >= WINNER_COUNT, "Not enough participants");
        require(pool.randomSeedHandle == bytes32(0), "Random seed already generated");
        
        // Generate encrypted random number (using euint32, will expand to uint256)
        euint32 encryptedRandom = FHE.randEuint32();
        
        // Make it publicly decryptable
        FHE.allowThis(encryptedRandom);
        FHE.makePubliclyDecryptable(encryptedRandom);
        
        // Store the handle
        bytes32 handle = FHE.toBytes32(encryptedRandom);
        
        pool.encryptedRandomSeed = encryptedRandom;
        pool.randomSeedHandle = handle;
        
        emit RandomSeedGenerated(poolId, handle);
    }

    /// @notice Draw winners using the decrypted random seed (owner only)
    /// @param poolId The ID of the pool
    /// @param cleartexts The decrypted random seed (abi-encoded uint256)
    /// @param decryptionProof The decryption proof from the relayer
    /// @dev Pool must be closed (countdown ended) before drawing winners
    function drawWinners(
        uint256 poolId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) external onlyOwner poolExists(poolId) {
        Pool storage pool = pools[poolId];
        
        // Ensure pool is closed (countdown ended)
        if (!pool.isClosed && pool.startTime > 0 && pool.endTime > 0 && block.timestamp >= pool.endTime) {
            _closePool(poolId);
            pool = pools[poolId];
        }
        
        require(pool.isClosed, "Pool must be closed first (countdown must reach 0)");
        require(!pool.winnersDrawn, "Winners already drawn");
        require(pool.totalEntries >= WINNER_COUNT, "Not enough participants");
        require(pool.randomSeedHandle != bytes32(0), "Random seed not generated");
        require(!pool.randomSeedRevealed, "Random seed already revealed");

        // Verify the decryption proof
        bytes32[] memory handlesList = new bytes32[](1);
        handlesList[0] = pool.randomSeedHandle;

        require(
            FHE.verifySignatures(handlesList, cleartexts, decryptionProof),
            "Invalid decryption proof"
        );

        // Decode the random seed (as uint32, then expand to uint256 deterministically)
        uint32 randomSeed32 = abi.decode(cleartexts, (uint32));
        // Expand to uint256 by hashing deterministically (doesn't depend on block data)
        uint256 randomSeed = uint256(keccak256(abi.encodePacked(randomSeed32, poolId, pool.totalEntries)));
        pool.revealedRandomSeed = randomSeed;
        pool.randomSeedRevealed = true;

        // Select 5 random winners
        address[] memory selectedWinners = _selectWinners(poolId, randomSeed);
        
        // Calculate distribution percentages (equal distribution for now, can be customized)
        uint256 percentagePerWinner = WINNER_SHARE_PERCENTAGE * 100 / WINNER_COUNT; // In basis points
        
        // Calculate protocol fee
        uint256 protocolFee = (pool.totalAmount * PROTOCOL_FEE_PERCENTAGE) / 100;
        uint256 winnerPool = pool.totalAmount - protocolFee;
        
        // Store winners with their rewards
        uint256[] memory percentages = new uint256[](WINNER_COUNT);
        for (uint256 i = 0; i < WINNER_COUNT; i++) {
            uint256 rewardAmount = (winnerPool * percentagePerWinner) / 10000;
            pool.winners.push(Winner({
                winnerAddress: selectedWinners[i],
                sharePercentage: percentagePerWinner,
                rewardAmount: rewardAmount,
                claimed: false
            }));
            percentages[i] = percentagePerWinner;
        }
        
        pool.winnersDrawn = true;
        
        emit WinnersDrawn(poolId, selectedWinners, percentages);
        
        // Transfer protocol fee
        if (protocolFee > 0) {
            mazaToken.safeTransfer(protocolFeeRecipient, protocolFee);
            emit ProtocolFeeWithdrawn(poolId, protocolFee);
        }
    }

    /// @notice Select winners using random seed
    /// @param poolId The ID of the pool
    /// @param randomSeed The random seed to use for selection
    /// @return Array of winner addresses
    function _selectWinners(uint256 poolId, uint256 randomSeed) internal view returns (address[] memory) {
        Pool storage pool = pools[poolId];
        address[] memory winners = new address[](WINNER_COUNT);
        address[] memory tempParticipants = new address[](pool.participants.length);
        
        // Copy participants array
        for (uint256 i = 0; i < pool.participants.length; i++) {
            tempParticipants[i] = pool.participants[i];
        }
        
        uint256 remainingCount = tempParticipants.length;
        uint256 seed = randomSeed;
        
        // Select 5 unique winners
        for (uint256 i = 0; i < WINNER_COUNT && remainingCount > 0; i++) {
            // Generate random index
            uint256 randomIndex = seed % remainingCount;
            
            // Select winner
            winners[i] = tempParticipants[randomIndex];
            
            // Remove selected winner from temp array by swapping with last element
            tempParticipants[randomIndex] = tempParticipants[remainingCount - 1];
            remainingCount--;
            
            // Update seed for next iteration (simple hash-based approach)
            seed = uint256(keccak256(abi.encodePacked(seed, i)));
        }
        
        return winners;
    }

    /// @notice Claim reward for a specific pool
    /// @param poolId The ID of the pool
    function claimReward(uint256 poolId) external poolExists(poolId) {
        Pool storage pool = pools[poolId];
        require(pool.winnersDrawn, "Winners not drawn yet");
        
        // Find the winner
        uint256 winnerIndex = type(uint256).max;
        for (uint256 i = 0; i < pool.winners.length; i++) {
            if (pool.winners[i].winnerAddress == msg.sender) {
                winnerIndex = i;
                break;
            }
        }
        
        require(winnerIndex != type(uint256).max, "Not a winner");
        require(!pool.winners[winnerIndex].claimed, "Reward already claimed");
        
        // Mark as claimed
        pool.winners[winnerIndex].claimed = true;
        
        // Transfer reward
        uint256 rewardAmount = pool.winners[winnerIndex].rewardAmount;
        mazaToken.safeTransfer(msg.sender, rewardAmount);
        
        emit RewardClaimed(poolId, msg.sender, rewardAmount);
    }

    /// @notice Get pool details
    /// @param poolId The ID of the pool
    /// @dev Returns isClosed as true if countdown has ended (endTime reached), even if not explicitly closed
    function getPool(uint256 poolId) external view poolExists(poolId) returns (
        uint256 startTime,
        uint256 endTime,
        uint256 totalEntries,
        uint256 totalAmount,
        bool isClosed,
        bool winnersDrawn,
        uint256 participantCount
    ) {
        Pool storage pool = pools[poolId];
        // Pool is considered closed if countdown has ended (endTime reached)
        bool actuallyClosed = pool.isClosed || (pool.startTime > 0 && pool.endTime > 0 && block.timestamp >= pool.endTime);
        return (
            pool.startTime,
            pool.endTime,
            pool.totalEntries,
            pool.totalAmount,
            actuallyClosed,
            pool.winnersDrawn,
            pool.participants.length
        );
    }

    /// @notice Get pool participants
    /// @param poolId The ID of the pool
    function getPoolParticipants(uint256 poolId) external view poolExists(poolId) returns (address[] memory) {
        return pools[poolId].participants;
    }

    /// @notice Get pool winners
    /// @param poolId The ID of the pool
    function getPoolWinners(uint256 poolId) external view poolExists(poolId) returns (
        address[] memory winners,
        uint256[] memory percentages,
        uint256[] memory rewards,
        bool[] memory claimed
    ) {
        Pool storage pool = pools[poolId];
        uint256 winnerCount = pool.winners.length;
        
        winners = new address[](winnerCount);
        percentages = new uint256[](winnerCount);
        rewards = new uint256[](winnerCount);
        claimed = new bool[](winnerCount);
        
        for (uint256 i = 0; i < winnerCount; i++) {
            winners[i] = pool.winners[i].winnerAddress;
            percentages[i] = pool.winners[i].sharePercentage;
            rewards[i] = pool.winners[i].rewardAmount;
            claimed[i] = pool.winners[i].claimed;
        }
    }

    /// @notice Get encrypted random seed handle for a pool
    /// @param poolId The ID of the pool
    function getEncryptedRandomSeed(uint256 poolId) external view poolExists(poolId) returns (bytes32) {
        return pools[poolId].randomSeedHandle;
    }

    /// @notice Check if user is a winner in a pool
    /// @param poolId The ID of the pool
    /// @param user The address to check
    function isWinner(uint256 poolId, address user) external view poolExists(poolId) returns (bool, uint256, bool) {
        Pool storage pool = pools[poolId];
        for (uint256 i = 0; i < pool.winners.length; i++) {
            if (pool.winners[i].winnerAddress == user) {
                return (true, pool.winners[i].rewardAmount, pool.winners[i].claimed);
            }
        }
        return (false, 0, false);
    }

    /// @notice Get current pool ID
    function getCurrentPoolId() external view returns (uint256) {
        return currentPoolId;
    }

    /// @notice Update protocol fee recipient (owner only)
    function setProtocolFeeRecipient(address _newRecipient) external onlyOwner {
        require(_newRecipient != address(0), "Invalid address");
        protocolFeeRecipient = _newRecipient;
    }
}

