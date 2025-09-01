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

// Comment instance class that maintains state over time
class Comment {
  public tipsTotalAmount: bigint = 0n;
  protected plebbitTippingInstance: PlebbitTippingV1Instance;
  protected feeRecipients: string[];
  protected recipientCommentCid: string;

  constructor(
    plebbitTippingInstance: PlebbitTippingV1Instance,
    feeRecipients: string[],
    recipientCommentCid: string,
    initialTipsTotalAmount: bigint
  ) {
    this.plebbitTippingInstance = plebbitTippingInstance;
    this.feeRecipients = feeRecipients;
    this.recipientCommentCid = recipientCommentCid;
    this.tipsTotalAmount = initialTipsTotalAmount;
  }

  async updateTipsTotalAmount(): Promise<void> {
    const newAmount = await this.plebbitTippingInstance.getDebouncedTipsTotalAmount(
      this.feeRecipients, 
      this.recipientCommentCid
    );
    this.tipsTotalAmount = newAmount;
    
    // Also update the cached value in the main instance
    const cacheKey = this.plebbitTippingInstance.createCacheKey(this.feeRecipients, this.recipientCommentCid);
    if (this.plebbitTippingInstance.comments[cacheKey]) {
      this.plebbitTippingInstance.comments[cacheKey].tipsTotalAmount = newAmount;
    }
  }
}

// SenderComment instance class that extends Comment functionality
class SenderComment extends Comment {
  public senderCommentCid?: string;
  public sender: string;

  constructor(
    plebbitTippingInstance: PlebbitTippingV1Instance,
    feeRecipients: string[],
    recipientCommentCid: string,
    initialTipsTotalAmount: bigint,
    sender: string,
    senderCommentCid?: string
  ) {
    super(plebbitTippingInstance, feeRecipients, recipientCommentCid, initialTipsTotalAmount);
    this.sender = sender;
    this.senderCommentCid = senderCommentCid;
  }

  async updateTipsTotalAmount(): Promise<void> {
    await super.updateTipsTotalAmount();
    
    // Also update the cached value in sender comments
    const cacheKey = this.plebbitTippingInstance.createSenderCacheKey(
      this.feeRecipients, 
      this.recipientCommentCid, 
      this.senderCommentCid, 
      this.sender
    );
    if (this.plebbitTippingInstance.senderComments[cacheKey]) {
      this.plebbitTippingInstance.senderComments[cacheKey].tipsTotalAmount = this.tipsTotalAmount;
    }
  }
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
  
  // Public cache access for testing - now stores Comment instances
  public comments: Record<string, Comment> = {};
  public senderComments: Record<string, SenderComment> = {};
  
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

  async createTip({ feeRecipients, recipientCommentCid, senderCommentCid, sender, privateKey, tipAmount }: { 
    feeRecipients: string[], 
    recipientCommentCid: string, 
    senderCommentCid?: string, 
    sender?: string,
    privateKey: string,
    tipAmount?: bigint
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
          // Determine tip amount: use custom amount if provided, otherwise use 2x minimum
          let actualTipAmount: bigint;
          if (tipAmount && tipAmount > 0n) {
            // Validate that custom amount meets minimum requirement
            const minTipAmount = await contractWithSigner.minimumTipAmount();
            if (tipAmount < minTipAmount) {
              throw new Error(`Custom tip amount (${ethers.formatEther(tipAmount)} ETH) is below minimum required (${ethers.formatEther(minTipAmount)} ETH)`);
            }
            actualTipAmount = tipAmount;
            console.log('Using custom tip amount:', ethers.formatEther(actualTipAmount), 'ETH');
          } else {
            // Use 2x minimum as default
            const minTipAmount = await contractWithSigner.minimumTipAmount();
            actualTipAmount = minTipAmount * 2n;
            console.log('Using default tip amount (2x minimum):', ethers.formatEther(actualTipAmount), 'ETH');
          }
          
          // Actually call the contract method now
          const tipTx = await contractWithSigner.tip(
            sender || wallet.address, // Use wallet address if sender not provided
            actualTipAmount,
            feeRecipients[0],
            senderCidBytes,
            recipientCidBytes,
            { from: sender || wallet.address, value: actualTipAmount } // Add value to the transaction
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
  }): Promise<Comment> {
    // Create comprehensive cache key
    const cacheKey = this.createCacheKey(feeRecipients, recipientCommentCid);

    if (!this.comments[cacheKey]) {
      // Use debounced bulk call for tips total amount
      const tipsTotalAmount = await this.getDebouncedTipsTotalAmount(feeRecipients, recipientCommentCid);
      
      // Create Comment instance
      const commentInstance = new Comment(this, feeRecipients, recipientCommentCid, tipsTotalAmount);
      this.comments[cacheKey] = commentInstance;

      // Set up cache expiration using cache.maxAge
      this.setupCacheExpiration(cacheKey);
    }

    return this.comments[cacheKey];
  }

  async createSenderComment({ feeRecipients, recipientCommentCid, senderCommentCid, sender }: { 
    feeRecipients: string[], 
    recipientCommentCid: string, 
    senderCommentCid?: string, 
    sender: string 
  }): Promise<SenderComment> {
    // Create comprehensive cache key for sender comments
    const cacheKey = this.createSenderCacheKey(feeRecipients, recipientCommentCid, senderCommentCid, sender);

    if (!this.senderComments[cacheKey]) {
      // Get the tips total amount
      const tipsTotalAmount = await this.getDebouncedTipsTotalAmount(feeRecipients, recipientCommentCid);
      
      // Create SenderComment instance
      const senderCommentInstance = new SenderComment(
        this, 
        feeRecipients, 
        recipientCommentCid, 
        tipsTotalAmount, 
        sender, 
        senderCommentCid
      );
      this.senderComments[cacheKey] = senderCommentInstance;

      // Set up cache expiration using cache.maxAge
      this.setupCacheExpiration(cacheKey, true);
    }

    return this.senderComments[cacheKey];
  }

  // Make these methods public so Comment instances can use them
  public createCacheKey(feeRecipients: string[], recipientCommentCid: string): string {
    return `comment:${feeRecipients.sort().join(',')}:${recipientCommentCid}`;
  }

  public createSenderCacheKey(feeRecipients: string[], recipientCommentCid: string, senderCommentCid?: string, sender?: string): string {
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

  // Make this method public so Comment instances can use it
  public async getDebouncedTipsTotalAmount(feeRecipients: string[], recipientCommentCid: string): Promise<bigint> {
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

  private async getTipsTotalAmount(feeRecipients: string[], recipientCommentCid: string): Promise<bigint> {
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
   * Helper method to get logs in chunks to avoid RPC block range limitations
   */
  private async getLogsInChunks(
    address: string,
    topics: (string | null)[],
    fromBlock: number,
    toBlock: number | string,
    chunkSize: number = 500 // Conservative chunk size
  ) {
    const allLogs = [];
    const endBlock = toBlock === 'latest' ? await this.provider.getBlockNumber() : Number(toBlock);
    
    // Process in chunks
    for (let start = fromBlock; start <= endBlock; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, endBlock);
      
      try {
        const logs = await this.provider.getLogs({
          address,
          topics,
          fromBlock: start,
          toBlock: end
        });
        allLogs.push(...logs);
      } catch (error) {
        console.warn(`Failed to get logs for block range ${start}-${end}:`, error);
        // Continue with other chunks even if one fails
      }
    }
    
    return allLogs;
  }

  /**
   * Get tipping activity for a wallet address (both sent and received tips)
   * @param walletAddress The wallet address to get activity for
   * @param options Optional parameters for filtering
   * @returns Array of tip activities with transaction details
   */
  async getTipsActivity(walletAddress: string, options: {
    fromBlock?: number | string;
    toBlock?: number | string;
    limit?: number;
    chunkSize?: number;
  } = {}): Promise<Array<{
    type: 'sent' | 'received';
    transactionHash: string;
    blockNumber: number;
    timestamp: number;
    sender: string;
    recipient: string;
    amount: bigint;
    feeRecipient: string;
    recipientCommentCid: string;
    senderCommentCid: string;
  }>> {
    try {
      // Default options - use smaller range to avoid RPC limits
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = typeof options.fromBlock === 'string' ? 
        parseInt(options.fromBlock, 16) : 
        (options.fromBlock || Math.max(0, currentBlock - 2000)); // Reduced to 2k blocks
      const toBlock = options.toBlock || 'latest';
      const limit = options.limit || 100;
      const chunkSize = options.chunkSize || 500; // Conservative chunk size

      console.log(`Fetching tips activity for ${walletAddress} from block ${fromBlock} to ${toBlock}`);

      // Get tip event signature
      const tipEventTopic = ethers.id("Tip(address,address,uint256,address,bytes32,bytes32)");
      
      // Get logs in chunks to avoid RPC limits
      const sentLogsPromise = this.getLogsInChunks(
        this.contractAddress,
        [
          tipEventTopic,
          ethers.zeroPadValue(walletAddress, 32) // sender is indexed (topic[1])
        ],
        fromBlock,
        toBlock,
        chunkSize
      );

      const receivedLogsPromise = this.getLogsInChunks(
        this.contractAddress,
        [
          tipEventTopic,
          null, // sender can be anyone
          ethers.zeroPadValue(walletAddress, 32) // recipient is indexed (topic[2])
        ],
        fromBlock,
        toBlock,
        chunkSize
      );

      const [sentLogs, receivedLogs] = await Promise.all([sentLogsPromise, receivedLogsPromise]);

      console.log(`Found ${sentLogs.length} sent tips and ${receivedLogs.length} received tips for ${walletAddress}`);

      const allTips = [];

      // Process sent tips
      for (const log of sentLogs) {
        try {
          const parsed = this.contract.interface.parseLog(log);
          if (!parsed) continue;

          const block = await this.provider.getBlock(log.blockNumber);
          const timestamp = block ? block.timestamp * 1000 : Date.now();

          allTips.push({
            type: 'sent' as const,
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp,
            sender: parsed.args.sender,
            recipient: parsed.args.recipient,
            amount: parsed.args.amount,
            feeRecipient: parsed.args.feeRecipient,
            recipientCommentCid: parsed.args.recipientCommentCid,
            senderCommentCid: parsed.args.senderCommentCid,
          });
        } catch (parseError) {
          console.error('Failed to parse sent tip log:', parseError);
        }
      }

      // Process received tips
      for (const log of receivedLogs) {
        try {
          const parsed = this.contract.interface.parseLog(log);
          if (!parsed) continue;

          const block = await this.provider.getBlock(log.blockNumber);
          const timestamp = block ? block.timestamp * 1000 : Date.now();

          allTips.push({
            type: 'received' as const,
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp,
            sender: parsed.args.sender,
            recipient: parsed.args.recipient,
            amount: parsed.args.amount,
            feeRecipient: parsed.args.feeRecipient,
            recipientCommentCid: parsed.args.recipientCommentCid,
            senderCommentCid: parsed.args.senderCommentCid,
          });
        } catch (parseError) {
          console.error('Failed to parse received tip log:', parseError);
        }
      }

      // Remove duplicates and sort by timestamp (newest first)
      const uniqueTips = allTips
        .filter((tip, index, self) => 
          index === self.findIndex((t) => t.transactionHash === tip.transactionHash)
        )
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      console.log(`Returning ${uniqueTips.length} unique tips`);
      return uniqueTips;
    } catch (error) {
      console.error('Failed to fetch tips activity:', error);
      throw error;
    }
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

// Export the classes for external use
export { Comment, SenderComment };

