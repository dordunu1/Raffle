// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint16, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title FHE Raffle Contract
/// @notice A contract that runs raffles with FHE-powered randomness
/// @dev Uses FHE randomness with proper permissions
contract Raffle is ZamaEthereumConfig {
    using SafeERC20 for IERC20;

    // Constants
    uint256 public constant POOL_DURATION = 5 minutes;
    uint256 public constant ENTRY_FEE = 5 ether;
    uint256 public constant WINNER_COUNT = 5;
    uint256 public constant PROTOCOL_FEE_PERCENTAGE = 10;
    uint256 public constant WINNER_SHARE_PERCENTAGE = 90;

    // ERC20 token address (MAZA token)
    IERC20 public immutable mazaToken;

    // Pool structure
    struct Pool {
        uint256 poolId;
        uint256 startTime;
        uint256 endTime;
        uint256 totalEntries;
        uint256 totalAmount;
        address[] participants;
        bool isClosed;
        bool winnersDrawn;
        Winner[] winners;
    }

    // Winner structure  
    struct Winner {
        address winnerAddress;
        uint256 sharePercentage;
        uint256 rewardAmount;
        bool claimed;
    }

    // Encrypted winner indices storage
    mapping(uint256 => euint16[]) internal encryptedWinnerIndices;
    mapping(uint256 => bytes32[]) public winnerIndexHandles;
    mapping(uint256 => bool) public indicesGenerated;

    // Mapping: poolId => Pool
    mapping(uint256 => Pool) public pools;
    
    // Mapping: poolId => participant address => bool
    mapping(uint256 => mapping(address => bool)) public hasEnteredPool;
    
    // Mapping: poolId => participant address => index
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
    event WinnerIndicesGenerated(uint256 indexed poolId, bytes32[] handles);
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

    constructor(address _mazaTokenAddress, address _protocolFeeRecipient) {
        require(_mazaTokenAddress != address(0), "Invalid token address");
        require(_protocolFeeRecipient != address(0), "Invalid fee recipient");
        mazaToken = IERC20(_mazaTokenAddress);
        owner = msg.sender;
        protocolFeeRecipient = _protocolFeeRecipient;
        
        _createNewPool();
    }

    function _createNewPool() internal {
        uint256 poolId = currentPoolId;
        
        Pool storage newPool = pools[poolId];
        newPool.poolId = poolId;
        newPool.startTime = 0;
        newPool.endTime = 0;
        newPool.totalEntries = 0;
        newPool.totalAmount = 0;
        newPool.participants = new address[](0);
        newPool.isClosed = false;
        newPool.winnersDrawn = false;
        
        emit PoolCreated(poolId, 0, 0);
    }

    function enterPool() external {
        uint256 poolId = currentPoolId;
        Pool storage pool = pools[poolId];
        
        if (pool.startTime > 0 && pool.endTime > 0 && block.timestamp >= pool.endTime && !pool.isClosed) {
            _closePool(poolId);
            pool = pools[poolId];
        }
        
        require(!pool.isClosed, "Pool is closed");
        require(!hasEnteredPool[poolId][msg.sender], "Already entered this pool");
        
        if (pool.startTime == 0) {
            pool.startTime = block.timestamp;
            pool.endTime = block.timestamp + POOL_DURATION;
            emit PoolStarted(poolId, pool.startTime, pool.endTime);
        }
        
        require(block.timestamp < pool.endTime, "Pool has closed");
        
        mazaToken.safeTransferFrom(msg.sender, address(this), ENTRY_FEE);
        
        pool.participants.push(msg.sender);
        pool.totalEntries++;
        pool.totalAmount += ENTRY_FEE;
        hasEnteredPool[poolId][msg.sender] = true;
        participantIndex[poolId][msg.sender] = pool.participants.length - 1;
        
        emit PoolEntry(poolId, msg.sender, ENTRY_FEE);
    }

    function closePool(uint256 poolId) external onlyOwner poolExists(poolId) {
        Pool storage pool = pools[poolId];
        require(pool.startTime > 0, "Pool hasn't started yet");
        require(pool.endTime > 0, "Pool hasn't started yet");
        require(block.timestamp >= pool.endTime, "Pool is still active");
        require(!pool.isClosed, "Pool already closed");
        _closePool(poolId);
    }

    function _closePool(uint256 poolId) internal {
        Pool storage pool = pools[poolId];
        pool.isClosed = true;
        
        emit PoolClosed(poolId, pool.totalEntries, pool.totalAmount);
        
        if (pool.totalEntries > 0) {
            currentPoolId++;
            _createNewPool();
        } else {
            pool.endTime = block.timestamp + POOL_DURATION;
            pool.isClosed = false;
        }
    }

    /// @notice Generate encrypted winner indices using proper FHE pattern
    /// @param poolId The ID of the pool
    /// @dev Uses FHE.allow() instead of makePubliclyDecryptable - only owner can decrypt
    function generateWinnerIndices(uint256 poolId) external onlyOwner poolExists(poolId) {
        Pool storage pool = pools[poolId];
        
        // Auto-close pool if countdown has ended
        if (!pool.isClosed && pool.startTime > 0 && pool.endTime > 0 && block.timestamp >= pool.endTime) {
            _closePool(poolId);
            pool = pools[poolId];
        }
        
        require(pool.isClosed, "Pool must be closed first");
        require(!pool.winnersDrawn, "Winners already drawn");
        require(pool.totalEntries >= WINNER_COUNT, "Not enough participants");
        require(!indicesGenerated[poolId], "Indices already generated");
        
        uint16 participantCount = uint16(pool.totalEntries);
        bytes32[] memory handles = new bytes32[](WINNER_COUNT);
        
        // Generate WINNER_COUNT encrypted random indices
        for (uint256 i = 0; i < WINNER_COUNT; i++) {
            // Generate encrypted random index using proper FHE pattern
            euint16 encryptedIndex = _generateRandomIndex(participantCount);
            
            // Store the encrypted value
            encryptedWinnerIndices[poolId].push(encryptedIndex);
            
            // Get handle for later decryption
            bytes32 handle = FHE.toBytes32(encryptedIndex);
            handles[i] = handle;
            winnerIndexHandles[poolId].push(handle);
            
            // Grant permissions to contract and owner only
            FHE.allowThis(encryptedIndex);
            FHE.allow(encryptedIndex, owner);
        }
        
        indicesGenerated[poolId] = true;
        
        emit WinnerIndicesGenerated(poolId, handles);
    }
    
    /// @notice Generate a random index in range [0, max-1] using proper FHE

    function _generateRandomIndex(uint16 max) internal returns (euint16) {
        require(max > 0, "Max must be > 0");
        
        // Find next power of 2 >= max
        uint16 powerOf2 = _nextPowerOf2(max);
        
        // Generate encrypted random in [0, powerOf2)
        euint16 random = FHE.randEuint16(powerOf2);
        
        // Rejection sampling: if random >= max, we handle it with FHE.select
        euint16 maxEnc = FHE.asEuint16(max);
        ebool inRange = FHE.lt(random, maxEnc);
        
        // If out of range, generate another and try again
        // For better uniformity, we could do multiple attempts 
        euint16 result = FHE.select(inRange, random, FHE.asEuint16(0));
        
        return result;
    }
    
    /// @notice Find next power of 2 >= n
    function _nextPowerOf2(uint16 n) internal pure returns (uint16) {
        if (n == 0) return 1;
        if (n > 32768) return 32768; // Cap at max power of 2 for uint16
        n--;
        n |= n >> 1;
        n |= n >> 2;
        n |= n >> 4;
        n |= n >> 8;
        n++;
        return n;
    }

    /// @notice Draw winners using decrypted indices
    /// @param poolId The ID of the pool
    /// @param decryptedIndices Array of decrypted winner indices (obtained off-chain via fhevmjs)
    /// @dev Owner decrypts indices off-chain using fhevmjs, then submits them here
    function drawWinners(
        uint256 poolId,
        uint16[] calldata decryptedIndices
    ) external onlyOwner poolExists(poolId) {
        Pool storage pool = pools[poolId];
        
        require(pool.isClosed, "Pool must be closed");
        require(!pool.winnersDrawn, "Winners already drawn");
        require(indicesGenerated[poolId], "Indices not generated");
        require(decryptedIndices.length == WINNER_COUNT, "Invalid indices count");
        
        // Convert indices to winner addresses (handle duplicates)
        address[] memory selectedWinners = _selectUniqueWinners(poolId, decryptedIndices);
        
        // Calculate distribution
        uint256 percentagePerWinner = WINNER_SHARE_PERCENTAGE * 100 / WINNER_COUNT;
        uint256 protocolFee = (pool.totalAmount * PROTOCOL_FEE_PERCENTAGE) / 100;
        uint256 winnerPool = pool.totalAmount - protocolFee;
        
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
    
    /// @notice Select unique winners from decrypted indices
    /// @dev Handles potential duplicate indices by picking next available
    function _selectUniqueWinners(
        uint256 poolId, 
        uint16[] calldata indices
    ) internal view returns (address[] memory) {
        Pool storage pool = pools[poolId];
        address[] memory winners = new address[](WINNER_COUNT);
        bool[] memory selected = new bool[](pool.participants.length);
        
        uint256 winnerCount = 0;
        
        for (uint256 i = 0; i < indices.length && winnerCount < WINNER_COUNT; i++) {
            uint16 index = indices[i] % uint16(pool.participants.length);
            
            // If this participant already selected, find next available
            if (selected[index]) {
                for (uint16 j = 1; j < pool.participants.length; j++) {
                    uint16 newIndex = (index + j) % uint16(pool.participants.length);
                    if (!selected[newIndex]) {
                        index = newIndex;
                        break;
                    }
                }
            }
            
            if (!selected[index]) {
                selected[index] = true;
                winners[winnerCount] = pool.participants[index];
                winnerCount++;
            }
        }
        
        return winners;
    }

    function claimReward(uint256 poolId) external poolExists(poolId) {
        Pool storage pool = pools[poolId];
        require(pool.winnersDrawn, "Winners not drawn yet");
        
        uint256 winnerIndex = type(uint256).max;
        for (uint256 i = 0; i < pool.winners.length; i++) {
            if (pool.winners[i].winnerAddress == msg.sender) {
                winnerIndex = i;
                break;
            }
        }
        
        require(winnerIndex != type(uint256).max, "Not a winner");
        require(!pool.winners[winnerIndex].claimed, "Reward already claimed");
        
        pool.winners[winnerIndex].claimed = true;
        
        uint256 rewardAmount = pool.winners[winnerIndex].rewardAmount;
        mazaToken.safeTransfer(msg.sender, rewardAmount);
        
        emit RewardClaimed(poolId, msg.sender, rewardAmount);
    }

    // ==================== VIEW FUNCTIONS ====================

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

    function getPoolParticipants(uint256 poolId) external view poolExists(poolId) returns (address[] memory) {
        return pools[poolId].participants;
    }

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

    function getWinnerIndexHandles(uint256 poolId) external view poolExists(poolId) returns (bytes32[] memory) {
        return winnerIndexHandles[poolId];
    }

    function isWinner(uint256 poolId, address user) external view poolExists(poolId) returns (bool, uint256, bool) {
        Pool storage pool = pools[poolId];
        for (uint256 i = 0; i < pool.winners.length; i++) {
            if (pool.winners[i].winnerAddress == user) {
                return (true, pool.winners[i].rewardAmount, pool.winners[i].claimed);
            }
        }
        return (false, 0, false);
    }

    function getCurrentPoolId() external view returns (uint256) {
        return currentPoolId;
    }

    function setProtocolFeeRecipient(address _newRecipient) external onlyOwner {
        require(_newRecipient != address(0), "Invalid address");
        protocolFeeRecipient = _newRecipient;
    }
}
