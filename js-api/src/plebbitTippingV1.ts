import { ethers } from "ethers";
import PlebbitTippingV1Json from "./PlebbitTippingV1.json" with { type: "json" };
const PlebbitTippingV1Abi = PlebbitTippingV1Json.abi;
import { CID } from 'multiformats/cid';
import {decode} from 'multiformats/hashes/digest';
import { TipTransaction, TransactionResult } from './types.js';

interface BulkRequest {
  feeRecipients: string[];
  recipientCommentCid: string;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

class PlebbitTippingV1Instance {
  private contract: ethers.Contract;
  private contractAddress: string; // Store contract address separately
  private provider: ethers.Provider; // Add private provider
  private rpcUrls: string[];
  private cache: { maxAge: number };
  private defaultFeeRecipient: string = "0x0000000000000000000000000000000000000000";
  
  // Debouncing infrastructure
  private debouncedBulkCalls: Map<string, NodeJS.Timeout> = new Map();
  private pendingBulkRequests: Map<string, BulkRequest[]> = new Map();
  
  // Public cache access for testing
  public comments: Record<string, any> = {};
  public senderComments: Record<string, any> = {};
  
  // Cache expiration
  private cacheExpirationTimers: Map<string, NodeJS.Timeout> = new Map();
  
  // Mocking for testing
  private mockBulkCallCount: number = 0;

  constructor(rpcUrls: string[], cache: { maxAge: number }, contractAddress: string) {
    this.rpcUrls = rpcUrls;
    this.cache = cache;
    this.contractAddress = contractAddress; // Store the address
    
    // Handle undefined/empty rpcUrls with fallback to default provider
    if (!rpcUrls || rpcUrls.length === 0 || !rpcUrls[0]) {
      this.provider = ethers.getDefaultProvider();
    } else {
      this.provider = new ethers.JsonRpcProvider(rpcUrls[0]);
    }
    
    // Always create read-only contract for queries
    this.contract = new ethers.Contract(contractAddress, PlebbitTippingV1Abi, this.provider);
  }

  async createTip({ feeRecipients, recipientCommentCid, senderCommentCid, sender, privateKey }: { 
    feeRecipients: string[], 
    recipientCommentCid: string, 
    senderCommentCid?: string, 
    sender?: string,
    privateKey: string
  }): Promise<TipTransaction> {
    // Prepare wallet and contract, but don't call the contract yet
    const wallet = new ethers.Wallet(privateKey, this.provider);
    const contractWithSigner = new ethers.Contract(this.contractAddress, PlebbitTippingV1Abi, wallet);
    
    // Convert CIDs to bytes32 format (without double hashing)
    const recipientCidBytes = this.cidToBytes32(recipientCommentCid);
    const senderCidBytes = senderCommentCid ? this.cidToBytes32(senderCommentCid) : ethers.ZeroHash;
    
    // Create transaction object with initially undefined values
    const transaction: TipTransaction = {
      transactionHash: undefined,
      receipt: undefined,
      error: undefined,
      
      async send(): Promise<TransactionResult> {
        try {
          // Get minimum tip amount from contract and use a higher amount
          const minTipAmount = await contractWithSigner.minimumTipAmount();
          const tipAmount = minTipAmount * 2n; // Use 2x minimum to ensure it's above threshold
          
          // Actually call the contract method now
          const tipTx = await contractWithSigner.tip(
            sender || wallet.address, // Use wallet address if sender not provided
            tipAmount,
            feeRecipients[0],
            senderCidBytes,
            recipientCidBytes,
            { from: sender || wallet.address, value: tipAmount } // Add value to the transaction
          );
          
          // Set transactionHash immediately after transaction is submitted
          transaction.transactionHash = tipTx.hash;
          
          try {
            // Wait for transaction to be mined
            const receipt = await tipTx.wait();
            transaction.receipt = receipt;
            return {
              transactionHash: tipTx.hash,
              receipt,
              error: undefined,
            };
          } catch (receiptError) {
            transaction.error = receiptError as Error;
            return {
              transactionHash: tipTx.hash,
              receipt: undefined,
              error: receiptError as Error,
            };
          }
        } catch (txError) {
          transaction.error = txError as Error;
          return {
            transactionHash: undefined,
            receipt: undefined,
            error: txError as Error,
          };
        }
      }
    };

    return transaction;
  }

  async createComment({ feeRecipients, recipientCommentCid }: { 
    feeRecipients: string[], 
    recipientCommentCid: string 
  }) {
    // Create comprehensive cache key
    const cacheKey = this.createCacheKey(feeRecipients, recipientCommentCid);

    if (!this.comments[cacheKey]) {
      // Use debounced bulk call for tips total amount
      const tipsTotalAmount = await this.getDebouncedTipsTotalAmount(feeRecipients, recipientCommentCid);
      
      this.comments[cacheKey] = {
        tipsTotalAmount,
        feeRecipients,
        recipientCommentCid
      };

      // Set up cache expiration using cache.maxAge
      this.setupCacheExpiration(cacheKey);
    }

    const self = this;
    return {
      tipsTotalAmount: this.comments[cacheKey].tipsTotalAmount,
      async updateTipsTotalAmount() {
        const newAmount = await self.getDebouncedTipsTotalAmount(feeRecipients, recipientCommentCid);
        self.comments[cacheKey].tipsTotalAmount = newAmount;
        return newAmount;
      }
    };
  }

  async createSenderComment({ feeRecipients, recipientCommentCid, senderCommentCid, sender }: { 
    feeRecipients: string[], 
    recipientCommentCid: string, 
    senderCommentCid?: string, 
    sender: string 
  }) {
    // Create comprehensive cache key for sender comments
    const cacheKey = this.createSenderCacheKey(feeRecipients, recipientCommentCid, senderCommentCid, sender);

    if (!this.senderComments[cacheKey]) {
      const comment = await this.createComment({ feeRecipients, recipientCommentCid });
      
      this.senderComments[cacheKey] = {
        ...comment,
        senderCommentCid,
        sender
      };

      // Set up cache expiration using cache.maxAge
      this.setupCacheExpiration(cacheKey, true);
    }

    return this.senderComments[cacheKey];
  }

  private createCacheKey(feeRecipients: string[], recipientCommentCid: string): string {
    return `comment:${feeRecipients.sort().join(',')}:${recipientCommentCid}`;
  }

  private createSenderCacheKey(feeRecipients: string[], recipientCommentCid: string, senderCommentCid?: string, sender?: string): string {
    return `sender:${feeRecipients.sort().join(',')}:${recipientCommentCid}:${senderCommentCid || ''}:${sender || ''}`;
  }

  private setupCacheExpiration(cacheKey: string, isSenderComment: boolean = false) {
    // Clear existing timer if any
    if (this.cacheExpirationTimers.has(cacheKey)) {
      clearTimeout(this.cacheExpirationTimers.get(cacheKey)!);
    }

    // Set new expiration timer using cache.maxAge
    const timer = setTimeout(() => {
      if (isSenderComment) {
        delete this.senderComments[cacheKey];
      } else {
        delete this.comments[cacheKey];
      }
      this.cacheExpirationTimers.delete(cacheKey);
    }, this.cache.maxAge);

    this.cacheExpirationTimers.set(cacheKey, timer);
  }

  private async getDebouncedTipsTotalAmount(feeRecipients: string[], recipientCommentCid: string): Promise<any> {
    const cacheKey = this.createCacheKey(feeRecipients, recipientCommentCid);
    
    return new Promise((resolve, reject) => {
      // Add request to pending bulk requests
      if (!this.pendingBulkRequests.has(cacheKey)) {
        this.pendingBulkRequests.set(cacheKey, []);
      }
      
      this.pendingBulkRequests.get(cacheKey)!.push({
        feeRecipients,
        recipientCommentCid,
        resolve,
        reject
      });

      // Clear existing debounce timer
      if (this.debouncedBulkCalls.has(cacheKey)) {
        clearTimeout(this.debouncedBulkCalls.get(cacheKey)!);
      }

      // Set new debounce timer (100ms as specified)
      const timer = setTimeout(async () => {
        await this.executeBulkCall(cacheKey);
      }, 100);

      this.debouncedBulkCalls.set(cacheKey, timer);
    });
  }

  private async executeBulkCall(cacheKey: string) {
    const requests = this.pendingBulkRequests.get(cacheKey) || [];
    if (requests.length === 0) return;

    try {
      // Increment mock counter for testing
      this.mockBulkCallCount++;

      // Extract unique requests to avoid duplicates
      const uniqueRequests = this.deduplicateRequests(requests);
      
      if (uniqueRequests.length === 1) {
        // Single request - use individual call
        const request = uniqueRequests[0];
        const result = await this.getTipsTotalAmount(request.feeRecipients, request.recipientCommentCid);
        request.resolve(result);
      } else {
        // Multiple requests - use bulk call
        const recipientCommentCids = uniqueRequests.map(r => r.recipientCommentCid);
        const feeRecipientsArray = uniqueRequests.map(r => r.feeRecipients);
        
        const results = await this.contract.getTipsTotalAmounts(recipientCommentCids, feeRecipientsArray);
        
        // Resolve each request with corresponding result
        uniqueRequests.forEach((request, index) => {
          request.resolve(results[index]);
        });
      }
    } catch (error) {
      // Reject all pending requests on error
      requests.forEach(request => request.reject(error));
    } finally {
      // Clean up
      this.pendingBulkRequests.delete(cacheKey);
      this.debouncedBulkCalls.delete(cacheKey);
    }
  }

  private deduplicateRequests(requests: BulkRequest[]): BulkRequest[] {
    const seen = new Set<string>();
    return requests.filter(request => {
      const key = `${request.feeRecipients.join(',')}:${request.recipientCommentCid}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async getTipsTotalAmount(feeRecipients: string[], recipientCommentCid: string) {
    // Convert CID to bytes32 format (without double hashing)
    const cidBytes32 = this.cidToBytes32(recipientCommentCid);
    const totalAmount = await this.contract.getTipsTotalAmount(cidBytes32, feeRecipients);
    return totalAmount;
  }

  async getFeePercent() {
    return await this.contract.feePercent();
  }

  async getMinimumTipAmount() {
    return await this.contract.minimumTipAmount();
  }

  /**
   * Convert a CID string to bytes32 for smart contract storage.
   * Extracts the raw 32-byte hash digest from the CID, removing multihash prefixes.
   * @param cid The IPFS CID string
   * @returns The raw hash as a bytes32 hex string
   */
  private cidToBytes32(cid: string): string {
    // Extract the raw hash digest (32 bytes) without multihash prefixes
    const cidBytes = decode(CID.parse(cid).multihash.bytes).digest;
    
    // The raw hash digest should always be 32 bytes
    if (cidBytes.length !== 32) {
      throw new Error(`Unexpected hash digest length: ${cidBytes.length}, expected 32 bytes. CID: ${cid}`);
    }
    
    return ethers.hexlify(cidBytes);
  }

  private getFeeRecipient(comment: any): string {
    return comment.tipping?.eth?.feeRecipientAddress || this.defaultFeeRecipient;
  }

  public getMockBulkCallCount(): number { 
    return this.mockBulkCallCount; 
  }

  public resetMockBulkCallCount(): void {
    this.mockBulkCallCount = 0;
  }
}

// Default contract addresses for different networks
const DEFAULT_CONTRACT_ADDRESSES: Record<string, string> = {
  "http://127.0.0.1:8545": "0x49753cB4ff375e04D2BC2A64971F60cD1a091381", // localhost - deterministic deployment
  "https://sepolia.infura.io": "0x49753cB4ff375e04D2BC2A64971F60cD1a091381", // sepolia
  "https://polygon-amoy.g.alchemy.com": "0x49753cB4ff375e04D2BC2A64971F60cD1a091381", // amoy
  "https://base-sepolia.g.alchemy.com": "0x49753cB4ff375e04D2BC2A64971F60cD1a091381", // base sepolia
};

// Factory function matching the requirements
export async function PlebbitTippingV1({ rpcUrls, cache }: { 
  rpcUrls: string[], 
  cache: { maxAge: number }
}) {
  // Use first RPC URL to determine contract address
  const contractAddress = DEFAULT_CONTRACT_ADDRESSES[rpcUrls[0]] || DEFAULT_CONTRACT_ADDRESSES["http://127.0.0.1:8545"];
  
  return new PlebbitTippingV1Instance(rpcUrls, cache, contractAddress);
}

