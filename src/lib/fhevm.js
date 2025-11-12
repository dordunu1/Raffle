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