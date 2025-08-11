import { ethers } from "ethers";
import PlebbitTippingV1Json from "./PlebbitTippingV1.json" with { type: "json" };
const PlebbitTippingV1Abi = PlebbitTippingV1Json.abi;
import { CID } from 'multiformats/cid';

interface BulkRequest {
  feeRecipients: string[];
  recipientCommentCid: string;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

class PlebbitTippingV1Instance {
  private contract: ethers.Contract;
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
    const provider = new ethers.JsonRpcProvider(rpcUrls[0]);
    
    // Always create read-only contract for queries
    this.contract = new ethers.Contract(contractAddress, PlebbitTippingV1Abi, provider);
  }

  async createTip({ feeRecipients, recipientCommentCid, senderCommentCid, sender, privateKey }: { 
    feeRecipients: string[], 
    recipientCommentCid: string, 
    senderCommentCid?: string, 
    sender?: string,
    privateKey: string
  }) {
    // Create a new provider and wallet with private key for this transaction
    const provider = new ethers.JsonRpcProvider(this.rpcUrls[0]);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contractWithSigner = new ethers.Contract(this.contract.target, PlebbitTippingV1Abi, wallet);
    
    // Convert CIDs to bytes32 format
    const recipientCidBytes = ethers.keccak256(CID.parse(recipientCommentCid).bytes);
    const senderCidBytes = senderCommentCid ? ethers.keccak256(CID.parse(senderCommentCid).bytes) : ethers.ZeroHash;
    
    // Get minimum tip amount from contract and use a higher amount
    const minTipAmount = await contractWithSigner.minimumTipAmount();
    const tipAmount = minTipAmount * 2n; // Use 2x minimum to ensure it's above threshold
    
    const tipTx = await contractWithSigner.tip(
      sender || wallet.address, // Use wallet address if sender not provided
      tipAmount,
      feeRecipients[0],
      senderCidBytes,
      recipientCidBytes,
      { from: sender || wallet.address, value: tipAmount } // Add value to the transaction
    );

    return {
      async send() {
        const receipt = await tipTx.wait();
        return {
          transactionHash: tipTx.hash,
          receipt,
          error: undefined,
        };
      }
    };
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
    const cidBytes = CID.parse(recipientCommentCid).bytes;
    // Convert variable-length CID bytes to fixed 32-byte format
    const cidBytes32 = ethers.keccak256(cidBytes);
    const totalAmount = await this.contract.getTipsTotalAmount(cidBytes32, feeRecipients);
    return totalAmount;
  }

  async getFeePercent() {
    return await this.contract.feePercent();
  }

  async getMinimumTipAmount() {
    return await this.contract.minimumTipAmount();
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

