/**
 * Simple FHEVM Core - Universal SDK
 * Clean, working FHEVM implementation for all frameworks
 * Uses CDN for browser environments to avoid bundling issues
 */
let fheInstance = null;
/**
 * Initialize FHEVM instance
 * Uses CDN for browser environments to avoid bundling issues
 * Enhanced for mobile browser compatibility
 */
export async function initializeFheInstance() {
    if (typeof window === 'undefined') {
        throw new Error('Window object not available. This code must run in a browser.');
    }

    console.log('🔍 Initializing FHEVM...');
    console.log('📱 User Agent:', navigator.userAgent);
    console.log('🌐 Window.ethereum available:', !!window.ethereum);
    console.log('📦 RelayerSDK available:', !!(window.RelayerSDK || window.relayerSDK));

    // Wait for ethereum provider to be available (mobile browsers may need time)
    let ethereum = window.ethereum;
    
    // Check for various ethereum provider patterns on mobile
    if (!ethereum) {
        // Check for injected providers in different locations
        const possibleProviders = [
            window.ethereum,
            window.web3?.currentProvider,
            window.web3,
            window.ethereum?.providers?.[0], // MetaMask might be in providers array
            window.ethereum?.providers?.find(p => p.isMetaMask),
            // Check for mobile wallet providers
            window.trust,
            window.coinbase,
            window.phantom,
        ].filter(Boolean);
        
        if (possibleProviders.length > 0) {
            ethereum = possibleProviders[0];
            console.log('✅ Found ethereum provider in alternative location');
        }
    }
    
    if (!ethereum) {
        console.log('⏳ Waiting for ethereum provider...');
        console.log('🔍 Checking for MetaMask injection...');
        
        // Wait up to 10 seconds for ethereum provider to load (increased for mobile)
        await new Promise((resolve, reject) => {
            let attempts = 0;
            const checkEthereum = () => {
                // Check multiple possible locations
                const foundProvider = window.ethereum || 
                                    window.web3?.currentProvider || 
                                    window.web3 ||
                                    window.ethereum?.providers?.[0] ||
                                    window.ethereum?.providers?.find(p => p.isMetaMask);
                
                if (foundProvider) {
                    console.log('✅ Ethereum provider found!');
                    ethereum = foundProvider;
                    resolve();
                } else if (attempts < 100) { // 10 seconds with 100ms intervals
                    attempts++;
                    console.log(`⏳ Attempt ${attempts}/100 - Checking for ethereum provider...`);
                    setTimeout(checkEthereum, 100);
                } else {
                    console.error('❌ Ethereum provider timeout');
                    console.log('🔍 Available window properties:', Object.keys(window).filter(k => k.toLowerCase().includes('eth') || k.toLowerCase().includes('web3')));
                    console.log('🔍 Window.ethereum details:', window.ethereum);
                    console.log('🔍 Window.web3 details:', window.web3);
                    
                    // Try to provide more helpful error message
                    if (navigator.userAgent.includes('Mobile') || navigator.userAgent.includes('Android') || navigator.userAgent.includes('iPhone')) {
                        reject(new Error('Mobile browser detected. Please ensure MetaMask is installed and the page is refreshed after connecting your wallet. Try refreshing the page.'));
                    } else {
                        reject(new Error('Ethereum provider not found. Please install MetaMask or connect a wallet.'));
                    }
                }
            };
            checkEthereum();
        });
    }

    // Wait for RelayerSDK to be available (mobile browsers may need time)
    let sdk = window.RelayerSDK || window.relayerSDK;
    if (!sdk) {
        console.log('⏳ Waiting for RelayerSDK...');
        // Wait up to 10 seconds for RelayerSDK to load
        await new Promise((resolve, reject) => {
            let attempts = 0;
            const checkSDK = () => {
                const foundSDK = window.RelayerSDK || window.relayerSDK;
                if (foundSDK) {
                    console.log('✅ RelayerSDK found!');
                    resolve();
                } else if (attempts < 100) { // 10 seconds with 100ms intervals
                    attempts++;
                    setTimeout(checkSDK, 100);
                } else {
                    console.error('❌ RelayerSDK timeout');
                    reject(new Error('RelayerSDK not loaded. Please include the script tag in your HTML:\n<script src="https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.umd.cjs"></script>'));
                }
            };
            checkSDK();
        });
        sdk = window.RelayerSDK || window.relayerSDK;
    }

    const { initSDK, createInstance, SepoliaConfig } = sdk;
    
    try {
        console.log('🚀 Initializing SDK...');
        await initSDK(); // Loads WASM
        console.log('✅ SDK initialized');
        
        const config = { ...SepoliaConfig, network: ethereum };
        console.log('🔧 Creating FHE instance...');
        fheInstance = await createInstance(config);
        console.log('✅ FHE instance created successfully!');
        return fheInstance;
    }
    catch (err) {
        console.error('❌ FHEVM instance creation failed:', err);
        throw err;
    }
}
export function getFheInstance() {
    return fheInstance;
}

/**
 * Self-relaying public decryption - returns both decrypted value and proof for onchain submission
 * @param {string} handle - The encrypted handle (bytes32)
 * @returns {Promise<{cleartexts: string, decryptionProof: string, decryptedValue: number}>}
 */
export async function publicDecryptWithProof(handle) {
    const fhe = getFheInstance();
    if (!fhe)
        throw new Error('FHE instance not initialized. Call initializeFheInstance() first.');
    try {
        if (typeof handle === "string" && handle.startsWith("0x") && handle.length === 66) {
            console.log('🔓 Calling publicDecrypt with handle for self-relaying:', handle);
            const result = await fhe.publicDecrypt([handle]);
            console.log('🔓 publicDecrypt returned:', result);
            
            // SDK 0.3.0-5 returns: {clearValues: {...}, abiEncodedClearValues: '...', decryptionProof: '...'}
            let decryptedValue;
            let abiEncodedClearValues;
            let decryptionProof;
            
            if (result && typeof result === 'object') {
                // Extract decrypted value
                if (result.clearValues && typeof result.clearValues === 'object') {
                    decryptedValue = result.clearValues[handle];
                } else if (Array.isArray(result)) {
                    decryptedValue = result[0];
                } else {
                    decryptedValue = result[handle] || Object.values(result)[0];
                }
                
                // Extract ABI-encoded clear values and proof
                abiEncodedClearValues = result.abiEncodedClearValues;
                decryptionProof = result.decryptionProof;
                
                if (!abiEncodedClearValues || !decryptionProof) {
                    throw new Error('Missing abiEncodedClearValues or decryptionProof in result');
                }
            } else {
                throw new Error('Invalid decryption result format');
            }
            
            // Convert BigInt to number for the decrypted value
            let numberValue;
            if (typeof decryptedValue === 'bigint') {
                numberValue = Number(decryptedValue);
            } else {
                numberValue = Number(decryptedValue);
            }
            
            if (isNaN(numberValue)) {
                throw new Error(`Decryption returned invalid value: ${decryptedValue}`);
            }
            
            console.log('🔓 Decrypted value:', numberValue);
            console.log('🔓 ABI-encoded clear values:', abiEncodedClearValues);
            console.log('🔓 Decryption proof:', decryptionProof ? 'Present' : 'Missing');
            
            return {
                cleartexts: abiEncodedClearValues,
                decryptionProof: decryptionProof,
                decryptedValue: numberValue
            };
        } else {
            throw new Error('Invalid ciphertext handle for decryption');
        }
    } catch (error) {
        console.error('❌ Self-relaying decryption error:', error);
        if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
            throw new Error('Decryption service is temporarily unavailable. Please try again later.');
        }
        throw error;
    }
}

/**
 * Public decryption for handles that don't require user authentication
 */
export async function publicDecrypt(encryptedBytes) {
    const fhe = getFheInstance();
    if (!fhe)
        throw new Error('FHE instance not initialized. Call initializeFheInstance() first.');
    try {
        let handle = encryptedBytes;
        if (typeof handle === "string" && handle.startsWith("0x") && handle.length === 66) {
            console.log('🔓 Calling publicDecrypt with handle:', handle);
            const result = await fhe.publicDecrypt([handle]);
            console.log('🔓 publicDecrypt returned:', result);
            console.log('🔓 Return type:', typeof result);
            console.log('🔓 Keys:', Object.keys(result || {}));
            
            // SDK 0.3.0-5 returns: {clearValues: {...}, abiEncodedClearValues: '...', decryptionProof: '...'}
            let decryptedValue;
            
            if (result && typeof result === 'object') {
                // Check for SDK 0.3.0-5 format with clearValues
                if (result.clearValues && typeof result.clearValues === 'object') {
                    // The decrypted value is in clearValues[handle] as a BigInt
                    decryptedValue = result.clearValues[handle];
                    console.log('🔓 Extracted from clearValues:', decryptedValue);
                    console.log('🔓 Value type:', typeof decryptedValue);
                    console.log('🔓 Is BigInt?', typeof decryptedValue === 'bigint');
                } else if (Array.isArray(result)) {
                    // Legacy array format
                    decryptedValue = result[0];
                    console.log('🔓 Extracted from array:', decryptedValue);
                } else {
                    // Try direct handle lookup (legacy format)
                    decryptedValue = result[handle] || Object.values(result)[0];
                    console.log('🔓 Extracted from object:', decryptedValue);
                }
            } else {
                // Direct value
                decryptedValue = result;
                console.log('🔓 Direct value:', decryptedValue);
            }
            
            // Convert BigInt or number to regular number
            let numberValue;
            if (typeof decryptedValue === 'bigint') {
                numberValue = Number(decryptedValue);
                console.log('🔓 Converted BigInt to number:', numberValue);
            } else {
                numberValue = Number(decryptedValue);
                console.log('🔓 Converted to number:', numberValue);
            }
            
            if (isNaN(numberValue)) {
                console.error('❌ Decryption returned NaN. Raw value:', decryptedValue);
                console.error('❌ Full response structure:', {
                    hasClearValues: !!result?.clearValues,
                    hasAbiEncoded: !!result?.abiEncodedClearValues,
                    hasProof: !!result?.decryptionProof,
                    clearValuesKeys: result?.clearValues ? Object.keys(result.clearValues) : []
                });
                throw new Error(`Decryption returned invalid value: ${decryptedValue}`);
            }
            
            console.log('🔓 Final number value:', numberValue);
            return numberValue;
        }
        else {
            throw new Error('Invalid ciphertext handle for decryption');
        }
    }
    catch (error) {
        console.error('❌ Decryption error:', error);
        if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
            throw new Error('Decryption service is temporarily unavailable. Please try again later.');
        }
        throw error;
    }
}

/**
 * User decryption with EIP-712 signing for values allowed via FHE.allow()
 * @param {string} encryptedBytes - The encrypted handle (bytes32)
 * @param {string} contractAddress - The contract address that has the encrypted value
 * @param {object} signer - Ethers signer object (for EIP-712 signing)
 * @returns {Promise<number>} Decrypted value as number
 */
export async function userDecrypt(encryptedBytes, contractAddress, signer) {
    const fhe = getFheInstance();
    if (!fhe)
        throw new Error('FHE instance not initialized. Call initializeFheInstance() first.');
    
    try {
        if (typeof encryptedBytes !== "string" || !encryptedBytes.startsWith("0x") || encryptedBytes.length !== 66) {
            throw new Error('Invalid ciphertext handle for decryption');
        }

        console.log('🔓 Starting user decryption with EIP-712...');
        
        // Generate keypair for user decryption
        const keypair = fhe.generateKeypair();
        
        // Prepare handle-contract pairs
        const handleContractPairs = [
            {
                handle: encryptedBytes,
                contractAddress: contractAddress,
            },
        ];
        
        // EIP-712 parameters
        const startTimeStamp = Math.floor(Date.now() / 1000).toString();
        const durationDays = "10";
        const contractAddresses = [contractAddress];

        // Create EIP-712 structure
        const eip712 = fhe.createEIP712(
            keypair.publicKey,
            contractAddresses,
            startTimeStamp,
            durationDays
        );

        // Sign EIP-712 message
        const signature = await signer.signTypedData(
            eip712.domain,
            {
                UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
            },
            eip712.message
        );

        // Perform user decryption
        const result = await fhe.userDecrypt(
            handleContractPairs,
            keypair.privateKey,
            keypair.publicKey,
            signature.replace("0x", ""),
            contractAddresses,
            await signer.getAddress(),
            startTimeStamp,
            durationDays
        );

        // Extract and convert the decrypted value
        const decryptedValue = result[encryptedBytes];
        const numberValue = typeof decryptedValue === 'bigint' ? Number(decryptedValue) : Number(decryptedValue);
        
        if (isNaN(numberValue)) {
            throw new Error(`Decryption returned invalid value: ${decryptedValue}`);
        }

        console.log('🔓 User decryption successful:', numberValue);
        return numberValue;
    } catch (error) {
        console.error('❌ User decryption error:', error);
        if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
            throw new Error('Decryption service is temporarily unavailable. Please try again later.');
        }
        throw error;
    }
}

/**
 * Batch user decryption with EIP-712 signing for multiple handles
 * @param {string[]} encryptedHandles - Array of encrypted handles (bytes32)
 * @param {string} contractAddress - The contract address that has the encrypted values
 * @param {object} signer - Ethers signer object (for EIP-712 signing)
 * @returns {Promise<number[]>} Array of decrypted values as numbers
 */
export async function userDecryptBatch(encryptedHandles, contractAddress, signer) {
    let fhe = getFheInstance();
    
    // If instance is not available, try to re-initialize (might have been lost)
    if (!fhe) {
        console.warn('⚠️ FHE instance not found, attempting to re-initialize...');
        try {
            fhe = await initializeFheInstance();
            console.log('✅ FHE instance re-initialized successfully');
        } catch (error) {
            console.error('❌ Re-initialization failed:', error);
            throw new Error(`FHE instance not initialized. Re-initialization failed: ${error.message}. Please refresh the page.`);
        }
    }
    
    // Verify instance has required methods
    if (!fhe || typeof fhe.userDecrypt !== 'function' || typeof fhe.generateKeypair !== 'function') {
        console.error('❌ FHE instance is invalid or missing required methods');
        throw new Error('FHE instance is invalid. Please refresh the page to re-initialize FHEVM.');
    }
    
    try {
        if (!Array.isArray(encryptedHandles) || encryptedHandles.length === 0) {
            throw new Error('Invalid handles array for batch decryption');
        }

        // Validate all handles
        for (const handle of encryptedHandles) {
            if (typeof handle !== "string" || !handle.startsWith("0x") || handle.length !== 66) {
                throw new Error(`Invalid ciphertext handle: ${handle}`);
            }
        }

        console.log(`🔓 Starting batch user decryption with EIP-712 for ${encryptedHandles.length} handles...`);
        
        // Generate keypair for user decryption (one keypair for all handles)
        const keypair = fhe.generateKeypair();
        
        // Prepare handle-contract pairs for all handles
        const handleContractPairs = encryptedHandles.map(handle => ({
            handle: handle,
            contractAddress: contractAddress,
        }));
        
        // EIP-712 parameters
        const startTimeStamp = Math.floor(Date.now() / 1000).toString();
        const durationDays = "10";
        const contractAddresses = [contractAddress];

        // Create EIP-712 structure (one signature for all handles)
        const eip712 = fhe.createEIP712(
            keypair.publicKey,
            contractAddresses,
            startTimeStamp,
            durationDays
        );

        // Sign EIP-712 message (only ONE signature needed for all handles!)
        console.log('✍️ Please sign EIP-712 message for batch decryption...');
        const signature = await signer.signTypedData(
            eip712.domain,
            {
                UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
            },
            eip712.message
        );

        // Perform batch user decryption (all handles at once)
        console.log('🔓 Calling fhe.userDecrypt with:', {
            handleCount: handleContractPairs.length,
            contractAddress,
            userAddress: await signer.getAddress()
        });
        
        let result;
        try {
            result = await fhe.userDecrypt(
                handleContractPairs,
                keypair.privateKey,
                keypair.publicKey,
                signature.replace("0x", ""),
                contractAddresses,
                await signer.getAddress(),
                startTimeStamp,
                durationDays
            );
        } catch (decryptError) {
            console.error('❌ FHE userDecrypt call failed:', decryptError);
            
            // Provide specific error messages based on error type
            const errorMsg = decryptError?.message || decryptError?.toString() || 'Unknown error';
            const lowerMsg = errorMsg.toLowerCase();
            
            if (lowerMsg.includes('permission') || lowerMsg.includes('not allowed') || lowerMsg.includes('access denied')) {
                throw new Error('You do not have permission to decrypt these values. Make sure indices were generated with FHE.allow() for your address.');
            }
            
            if (lowerMsg.includes('signature') || lowerMsg.includes('invalid signature') || lowerMsg.includes('eip-712')) {
                throw new Error('Invalid EIP-712 signature. Please try signing again.');
            }
            
            if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
                throw new Error('Decryption request timed out. The FHE relayer may be busy. Please try again.');
            }
            
            if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror') || lowerMsg.includes('network request failed')) {
                throw new Error('Cannot reach FHE decryption service. Please check your internet connection and try again.');
            }
            
            if (lowerMsg.includes('relayer') || lowerMsg.includes('service unavailable')) {
                throw new Error('FHE decryption service is temporarily unavailable. Please try again in a few moments.');
            }
            
            // For any other error, wrap it with context but don't include "network" in the message
            throw new Error(`Decryption failed: ${errorMsg.substring(0, 100)}`);
        }

        // Extract and convert all decrypted values
        const decryptedValues = encryptedHandles.map(handle => {
            const decryptedValue = result[handle];
            
            if (decryptedValue === undefined || decryptedValue === null) {
                throw new Error(`Decryption did not return a value for handle ${handle}. The handle may be invalid or you may not have permission.`);
            }
            
            const numberValue = typeof decryptedValue === 'bigint' ? Number(decryptedValue) : Number(decryptedValue);
            
            if (isNaN(numberValue)) {
                throw new Error(`Decryption returned invalid value for handle ${handle}: ${decryptedValue}`);
            }
            
            return numberValue;
        });

        console.log(`🔓 Batch user decryption successful! Decrypted ${decryptedValues.length} values:`, decryptedValues);
        return decryptedValues;
    } catch (error) {
        console.error('❌ Batch user decryption error:', error);
        
        // Re-throw our specific errors as-is
        if (error?.message && (
            error.message.includes('permission') ||
            error.message.includes('signature') ||
            error.message.includes('timeout') ||
            error.message.includes('Decryption failed') ||
            error.message.includes('Decryption did not return') ||
            error.message.includes('Decryption returned invalid')
        )) {
            throw error;
        }
        
        // For unexpected errors, provide a generic message without "network" keyword
        const errorMsg = error?.message || error?.toString() || 'Unknown error';
        throw new Error(`Batch decryption failed: ${errorMsg.substring(0, 150)}`);
    }
}