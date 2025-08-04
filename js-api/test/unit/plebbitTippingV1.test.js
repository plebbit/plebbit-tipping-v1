import { jest, describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { PlebbitTippingV1 } from '../../dist/plebbitTippingV1.js';
import CID from 'cids';

describe('PlebbitTippingV1', () => {
  let plebbitTipping;
  const rpcUrl = 'http://127.0.0.1:8545';
  const cache = { maxAge: 1000 }; // 1 second for testing

  beforeAll(async () => {
    plebbitTipping = await PlebbitTippingV1({ rpcUrls: [rpcUrl], cache });
  });

  beforeEach(() => {
    // Reset mock counters and clear cache before each test
    plebbitTipping.resetMockBulkCallCount();
    plebbitTipping.comments = {};
    plebbitTipping.senderComments = {};
    
    // Clear any existing timers
    if (plebbitTipping.cacheExpirationTimers) {
      plebbitTipping.cacheExpirationTimers.forEach(timer => clearTimeout(timer));
      plebbitTipping.cacheExpirationTimers.clear();
    }
    if (plebbitTipping.debouncedBulkCalls) {
      plebbitTipping.debouncedBulkCalls.forEach(timer => clearTimeout(timer));
      plebbitTipping.debouncedBulkCalls.clear();
    }
    if (plebbitTipping.pendingBulkRequests) {
      plebbitTipping.pendingBulkRequests.clear();
    }
  });

  afterEach(() => {
    // Clean up any hanging timers
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Clean up any remaining timers
    if (plebbitTipping.cacheExpirationTimers) {
      plebbitTipping.cacheExpirationTimers.forEach(timer => clearTimeout(timer));
    }
  });

  describe('CID Parsing', () => {
    it('should parse IPFS CIDs correctly', async () => {
      const testCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const parsedCid = new CID(testCid);
      expect(parsedCid.bytes).toBeDefined();
      expect(parsedCid.bytes.length).toBeGreaterThan(0);
    });

    it('should use CID parsing in createTip', async () => {
      const recipientCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const senderCid = 'QmTgqo6NqkBAm9ks4Z1CirgW4Di3QuA6iRgn68EHi6D8R5';
      
      // Mock the contract.tip method
      const mockTip = jest.fn().mockResolvedValue({
        wait: jest.fn().mockResolvedValue({ hash: '0x123' })
      });
      plebbitTipping.contract.tip = mockTip;

      await plebbitTipping.createTip({
        feeRecipients: ['0x123'],
        recipientCommentCid: recipientCid,
        senderCommentCid: senderCid,
        sender: '0x456'
      });

      expect(mockTip).toHaveBeenCalledWith(
        '0x456',
        expect.any(BigInt), // parseEther returns BigInt, not Object
        '0x123',
        expect.any(String), // CID hash (hex string)
        expect.any(String), // CID hash (hex string)
        { from: '0x456' }
      );
    });
  });

  describe('Basic Functionality', () => {
    it('should create a comment successfully', async () => {
      const feeRecipients = ['0x123'];
      const recipientCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      
      const mockGetTipsTotalAmount = jest.fn().mockResolvedValue('1000000000000000000');
      plebbitTipping.contract.getTipsTotalAmount = mockGetTipsTotalAmount;

      const comment = await plebbitTipping.createComment({ feeRecipients, recipientCommentCid: recipientCid });
      
      expect(comment).toBeDefined();
      expect(comment.tipsTotalAmount).toBeDefined();
      
      // Wait for debounced call to execute
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(mockGetTipsTotalAmount).toHaveBeenCalledTimes(1);
    }, 5000);
  });

  describe('Caching', () => {
    it('should cache comments and respect cache.maxAge', async () => {
      const feeRecipients = ['0x123'];
      const recipientCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      
      // Set up the mock BEFORE calling createComment
      const mockGetTipsTotalAmount = jest.fn().mockResolvedValue('1000000000000000000');
      plebbitTipping.contract.getTipsTotalAmount = mockGetTipsTotalAmount;

      // First call should hit the contract
      const comment1 = await plebbitTipping.createComment({ feeRecipients, recipientCommentCid: recipientCid });
      
      // Wait a bit for the debounced call to execute
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(mockGetTipsTotalAmount).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const comment2 = await plebbitTipping.createComment({ feeRecipients, recipientCommentCid: recipientCid });
      expect(mockGetTipsTotalAmount).toHaveBeenCalledTimes(1); // Still 1, not 2

      // Verify cache is accessible
      const cacheKey = plebbitTipping.createCacheKey(feeRecipients, recipientCid);
      expect(plebbitTipping.comments[cacheKey]).toBeDefined();
    }, 5000);

    it('should expire cache after cache.maxAge', async () => {
      const feeRecipients = ['0x123'];
      const recipientCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      
      // Set up the mock BEFORE calling createComment
      const mockGetTipsTotalAmount = jest.fn().mockResolvedValue('1000000000000000000');
      plebbitTipping.contract.getTipsTotalAmount = mockGetTipsTotalAmount;

      // Create comment
      await plebbitTipping.createComment({ feeRecipients, recipientCommentCid: recipientCid });
      
      // Wait for debounced call to execute
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify first call
      expect(mockGetTipsTotalAmount).toHaveBeenCalledTimes(1);
      
      // Wait for cache to expire (cache.maxAge is 1000ms, wait 1200ms to be safe)
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Create comment again - should hit contract again
      await plebbitTipping.createComment({ feeRecipients, recipientCommentCid: recipientCid });
      
      // Should have been called twice now
      expect(mockGetTipsTotalAmount).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should cache sender comments separately', async () => {
      const feeRecipients = ['0x123'];
      const recipientCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const senderCid = 'QmTgqo6NqkBAm9ks4Z1CirgW4Di3QuA6iRgn68EHi6D8R5';
      const sender = '0x456';

      // Set up the mock BEFORE calling createSenderComment
      const mockGetTipsTotalAmount = jest.fn().mockResolvedValue('1000000000000000000');
      plebbitTipping.contract.getTipsTotalAmount = mockGetTipsTotalAmount;

      // Create sender comment
      const senderComment = await plebbitTipping.createSenderComment({ 
        feeRecipients, 
        recipientCommentCid: recipientCid,
        senderCommentCid: senderCid,
        sender 
      });

      // Verify sender comment is cached separately
      const cacheKey = plebbitTipping.createSenderCacheKey(feeRecipients, recipientCid, senderCid, sender);
      expect(plebbitTipping.senderComments[cacheKey]).toBeDefined();
    }, 5000);
  });

  describe('Fee Recipient Fallback', () => {
    it('should use default fee recipient when comment.tipping.eth.feeRecipientAddress is not available', () => {
      const commentWithoutFeeRecipient = { content: 'test' };
      const feeRecipient = plebbitTipping.getFeeRecipient(commentWithoutFeeRecipient);
      expect(feeRecipient).toBe(plebbitTipping.defaultFeeRecipient);
    });

    it('should use comment.tipping.eth.feeRecipientAddress when available', () => {
      const commentWithFeeRecipient = {
        tipping: {
          eth: {
            feeRecipientAddress: '0xCustomFeeRecipient'
          }
        }
      };
      const feeRecipient = plebbitTipping.getFeeRecipient(commentWithFeeRecipient);
      expect(feeRecipient).toBe('0xCustomFeeRecipient');
    });
  });

  describe('Cache Keys', () => {
    it('should create unique cache keys for different parameters', () => {
      const feeRecipients1 = ['0x123'];
      const feeRecipients2 = ['0x456'];
      const recipientCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';

      const key1 = plebbitTipping.createCacheKey(feeRecipients1, recipientCid);
      const key2 = plebbitTipping.createCacheKey(feeRecipients2, recipientCid);

      expect(key1).not.toBe(key2);
    });

    it('should create unique sender cache keys', () => {
      const feeRecipients = ['0x123'];
      const recipientCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const senderCid1 = 'QmTgqo6NqkBAm9ks4Z1CirgW4Di3QuA6iRgn68EHi6D8R5';
      const senderCid2 = 'QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN';
      const sender = '0x456';

      const key1 = plebbitTipping.createSenderCacheKey(feeRecipients, recipientCid, senderCid1, sender);
      const key2 = plebbitTipping.createSenderCacheKey(feeRecipients, recipientCid, senderCid2, sender);

      expect(key1).not.toBe(key2);
    });
  });
});
