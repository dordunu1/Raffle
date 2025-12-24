export declare function initializeFheInstance(): Promise<any>;
export declare function getFheInstance(): any;
export declare function decryptValue(encryptedBytes: string, contractAddress: string, signer: any): Promise<number>;
export declare function publicDecrypt(encryptedBytes: string): Promise<number>;
export declare function publicDecryptWithProof(handle: string): Promise<{ cleartexts: string; decryptionProof: string; decryptedValue: number }>;
export declare function userDecrypt(encryptedBytes: string, contractAddress: string, signer: any): Promise<number>;
export declare function userDecryptBatch(encryptedHandles: string[], contractAddress: string, signer: any): Promise<number[]>;





