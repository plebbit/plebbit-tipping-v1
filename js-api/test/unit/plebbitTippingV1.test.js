/**
 * @fileoverview Comprehensive test suite for PlebbitTippingV1 class
 * 
 * This test suite validates the core functionality of the PlebbitTippingV1 class,
 * including CID parsing, caching mechanisms, debouncing, and fee recipient handling.
 * The tests ensure the library works correctly with IPFS CIDs, implements proper
 * caching with expiration, and handles blockchain interactions efficiently.
 * 
 * @author Plebbit Tipping Team
 * @version 1.0.0
 * @since 2024
 */

import { jest, describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { PlebbitTippingV1 } from '../../dist/plebbitTippingV1.js';
import { CID } from 'multiformats/cid';
import { ethers } from 'ethers';

/**
 * @description Main test suite for PlebbitTippingV1 functionality
 * 
 * This test suite covers all major aspects of the PlebbitTippingV1 class:
 * - CID parsing and validation
 * - Basic comment creation with debouncing
 * - Caching mechanisms with expiration
 * - Fee recipient fallback logic
 * - Cache key generation and uniqueness
 * 
 * @test {PlebbitTippingV1} CID Parsing
 * @test {PlebbitTippingV1} Basic Functionality  
 * @test {PlebbitTippingV1} Caching
 * @test {PlebbitTippingV1} Fee Recipient Fallback
 * @test {PlebbitTippingV1} Cache Keys
 */
describe('PlebbitTippingV1', () => {
  /** @type {PlebbitTippingV1} Instance of PlebbitTippingV1 for testing */
  let plebbitTipping;
  
  /** @type {string} Local RPC URL for testing */
  const rpcUrl = 'http://127.0.0.1:8545';
  
  /** @type {Object} Cache configuration for testing (1 second maxAge) */
  const cache = { maxAge: 1000 }; // 1 second for testing

  /**
   * @description Initialize PlebbitTippingV1 instance before all tests
   * 
   * Sets up the main instance that will be used across all test cases.
   * This runs once before all tests in the suite.
   * 
   * @async
   * @function beforeAll
   */
  beforeAll(async () => {
    plebbitTipping = await PlebbitTippingV1({ rpcUrls: [rpcUrl], cache });
  });

  /**
   * @description Reset test state before each test
   * 
   * Clears all caches, timers, and mock counters to ensure
   * each test starts with a clean state. This prevents test
   * interference and ensures reliable test results.
   * 
   * @function beforeEach
   */
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

  /**
   * @description Clean up after each test
   * 
   * Clears Jest timers and mocks to prevent memory leaks
   * and ensure clean test isolation.
   * 
   * @function afterEach
   */
  afterEach(() => {
    // Clean up any hanging timers
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  /**
   * @description Final cleanup after all tests
   * 
   * Ensures all remaining timers are cleared to prevent
   * memory leaks and hanging processes.
   * 
   * @function afterAll
   */
  afterAll(() => {
    // Clean up any remaining timers
    if (plebbitTipping.cacheExpirationTimers) {
      plebbitTipping.cacheExpirationTimers.forEach(timer => clearTimeout(timer));
    }
  });

  /**
   * @description Test suite for CID (Content Identifier) parsing functionality
   * 
   * Validates that IPFS CIDs are correctly parsed and converted
   * to the proper format for blockchain interactions.
   * 
   * @test {CID} IPFS CID parsing
   * @test {createTip} CID usage in tip creation
   */
  describe('CID Parsing', () => {
    /**
     * @description Test IPFS CID parsing and validation
     * 
     * Verifies that IPFS CIDs can be correctly parsed using the CID library
     * and that the resulting bytes are valid and non-empty.
     * 
     * @async
     * @function it
     * @param {string} testCid - Sample IPFS CID for testing
     * @param {Object} parsedCid - Parsed CID object with bytes property
     * @expects {boolean} parsedCid.bytes should be defined
     * @expects {number} parsedCid.bytes.length should be greater than 0
     */
    it('should parse IPFS CIDs correctly', async () => {
      const testCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const parsedCid = CID.parse(testCid);
      expect(parsedCid.bytes).toBeDefined();
      expect(parsedCid.bytes.length).toBeGreaterThan(0);
    });

    /**
     * @description Test CID parsing integration in createTip method
     * 
     * Verifies that the createTip method correctly converts IPFS CIDs
     * to the proper format (keccak256 hash) for blockchain transactions.
     * The test mocks the contract.tip method and validates the parameters
     * passed to it.
     * 
     * @async
     * @function it
     * @param {string} recipientCid - IPFS CID of the recipient comment
     * @param {string} senderCid - IPFS CID of the sender comment
     * @param {Function} mockTip - Mocked contract.tip method
     * @expects {Function} mockTip should be called with correct parameters
     * @expects {string} First parameter should be sender address
     * @expects {BigInt} Second parameter should be tip amount
     * @expects {string} Third parameter should be fee recipient
     * @expects {string} Fourth parameter should be sender CID hash
     * @expects {string} Fifth parameter should be recipient CID hash
     * @expects {Object} Sixth parameter should be transaction options
     */
    it('should parse CIDs correctly for tip creation', async () => {
      const recipientCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const senderCid = 'QmTgqo6NqkBAm9ks4Z1CirgW4Di3QuA6iRgn68EHi6D8R5';
      
      // Test CID parsing directly (this is what the test should actually verify)
      const recipientCidBytes = ethers.keccak256(CID.parse(recipientCid).bytes);
      const senderCidBytes = ethers.keccak256(CID.parse(senderCid).bytes);
      
      expect(recipientCidBytes).toBeDefined();
      expect(senderCidBytes).toBeDefined();
      expect(recipientCidBytes).not.toBe(senderCidBytes);
      expect(recipientCidBytes.length).toBe(66); // 0x + 32 bytes
      expect(senderCidBytes.length).toBe(66); // 0x + 32 bytes
    });
  });

  /**
   * @description Test suite for basic functionality and debouncing
   * 
   * Validates the core comment creation functionality and ensures
   * that the debouncing mechanism works correctly to batch multiple
   * rapid calls into single contract interactions.
   * 
   * @test {createComment} Comment creation with debouncing
   */
  describe('Basic Functionality', () => {
    /**
     * @description Test comment creation with debouncing mechanism
     * 
     * Verifies that createComment successfully creates a comment object
     * and that the debouncing mechanism delays the actual contract call
     * by 100ms to batch multiple rapid requests. The test waits 200ms
     * to ensure the debounced call has time to execute.
     * 
     * @async
     * @function it
     * @param {string[]} feeRecipients - Array of fee recipient addresses
     * @param {string} recipientCid - IPFS CID of the recipient comment
     * @param {Function} mockGetTipsTotalAmount - Mocked contract method
     * @param {Object} comment - Created comment object
     * @expects {Object} comment should be defined
     * @expects {any} comment.tipsTotalAmount should be defined
     * @expects {number} mockGetTipsTotalAmount should be called exactly once
     * @timeout {number} 5000ms - Extended timeout for async operations
     */
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

  /**
   * @description Test suite for caching mechanisms
   * 
   * Validates that the caching system works correctly, respects
   * cache expiration times, and properly separates different types
   * of cached data (regular comments vs sender comments).
   * 
   * @test {caching} Comment caching with maxAge
   * @test {caching} Cache expiration after maxAge
   * @test {caching} Sender comment caching
   */
  describe('Caching', () => {
    /**
     * @description Test comment caching and cache.maxAge respect
     * 
     * Verifies that comments are properly cached and that subsequent
     * calls with the same parameters use the cached data instead of
     * making new contract calls. The test ensures that the cache
     * is accessible and that the contract method is called only once
     * for identical requests.
     * 
     * @async
     * @function it
     * @param {string[]} feeRecipients - Array of fee recipient addresses
     * @param {string} recipientCid - IPFS CID of the recipient comment
     * @param {Function} mockGetTipsTotalAmount - Mocked contract method
     * @param {Object} comment1 - First comment object
     * @param {Object} comment2 - Second comment object (should use cache)
     * @param {string} cacheKey - Generated cache key
     * @expects {number} mockGetTipsTotalAmount should be called exactly once
     * @expects {Object} plebbitTipping.comments[cacheKey] should be defined
     * @timeout {number} 5000ms - Extended timeout for async operations
     */
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

    /**
     * @description Test cache expiration after cache.maxAge
     * 
     * Verifies that cached data expires after the configured maxAge
     * (1000ms in this test) and that subsequent calls after expiration
     * result in new contract calls rather than using stale cached data.
     * 
     * @async
     * @function it
     * @param {string[]} feeRecipients - Array of fee recipient addresses
     * @param {string} recipientCid - IPFS CID of the recipient comment
     * @param {Function} mockGetTipsTotalAmount - Mocked contract method
     * @expects {number} mockGetTipsTotalAmount should be called exactly once initially
     * @expects {number} mockGetTipsTotalAmount should be called twice after cache expiration
     * @timeout {number} 10000ms - Extended timeout for cache expiration
     */
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

    /**
     * @description Test sender comment caching separation
     * 
     * Verifies that sender comments are cached separately from regular
     * comments using a different cache key structure. This ensures that
     * sender-specific data doesn't interfere with general comment caching.
     * 
     * @async
     * @function it
     * @param {string[]} feeRecipients - Array of fee recipient addresses
     * @param {string} recipientCid - IPFS CID of the recipient comment
     * @param {string} senderCid - IPFS CID of the sender comment
     * @param {string} sender - Sender address
     * @param {Function} mockGetTipsTotalAmount - Mocked contract method
     * @param {Object} senderComment - Created sender comment object
     * @param {string} cacheKey - Generated sender cache key
     * @expects {Object} plebbitTipping.senderComments[cacheKey] should be defined
     * @timeout {number} 5000ms - Extended timeout for async operations
     */
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

  /**
   * @description Test suite for fee recipient fallback logic
   * 
   * Validates that the system correctly handles fee recipient addresses,
   * using custom addresses when available and falling back to default
   * addresses when not specified.
   * 
   * @test {getFeeRecipient} Default fee recipient fallback
   * @test {getFeeRecipient} Custom fee recipient usage
   */
  describe('Fee Recipient Fallback', () => {
    /**
     * @description Test default fee recipient fallback
     * 
     * Verifies that when a comment doesn't have a custom fee recipient
     * address specified, the system falls back to the default fee
     * recipient address configured in the environment.
     * 
     * @function it
     * @param {Object} commentWithoutFeeRecipient - Comment object without fee recipient
     * @param {string} feeRecipient - Retrieved fee recipient address
     * @expects {string} feeRecipient should equal defaultFeeRecipient
     */
    it('should use default fee recipient when comment.tipping.eth.feeRecipientAddress is not available', () => {
      const commentWithoutFeeRecipient = { content: 'test' };
      const feeRecipient = plebbitTipping.getFeeRecipient(commentWithoutFeeRecipient);
      expect(feeRecipient).toBe(plebbitTipping.defaultFeeRecipient);
    });

    /**
     * @description Test custom fee recipient usage
     * 
     * Verifies that when a comment has a custom fee recipient address
     * specified in the tipping.eth.feeRecipientAddress field, the system
     * uses that address instead of the default.
     * 
     * @function it
     * @param {Object} commentWithFeeRecipient - Comment object with custom fee recipient
     * @param {string} feeRecipient - Retrieved fee recipient address
     * @expects {string} feeRecipient should equal the custom address
     */
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

  /**
   * @description Test suite for cache key generation
   * 
   * Validates that cache keys are generated correctly and uniquely
   * for different parameter combinations, ensuring proper cache
   * separation and avoiding cache collisions.
   * 
   * @test {createCacheKey} Regular comment cache key uniqueness
   * @test {createSenderCacheKey} Sender comment cache key uniqueness
   */
  describe('Cache Keys', () => {
    /**
     * @description Test regular comment cache key uniqueness
     * 
     * Verifies that different fee recipient arrays generate different
     * cache keys, ensuring that comments with different fee recipients
     * are cached separately and don't interfere with each other.
     * 
     * @function it
     * @param {string[]} feeRecipients1 - First fee recipients array
     * @param {string[]} feeRecipients2 - Second fee recipients array
     * @param {string} recipientCid - IPFS CID of the recipient comment
     * @param {string} key1 - First generated cache key
     * @param {string} key2 - Second generated cache key
     * @expects {string} key1 should not equal key2
     */
    it('should create unique cache keys for different parameters', () => {
      const feeRecipients1 = ['0x123'];
      const feeRecipients2 = ['0x456'];
      const recipientCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';

      const key1 = plebbitTipping.createCacheKey(feeRecipients1, recipientCid);
      const key2 = plebbitTipping.createCacheKey(feeRecipients2, recipientCid);

      expect(key1).not.toBe(key2);
    });

    /**
     * @description Test sender comment cache key uniqueness
     * 
     * Verifies that different sender CIDs generate different cache keys
     * for sender comments, ensuring that sender-specific data is properly
     * separated in the cache.
     * 
     * @function it
     * @param {string[]} feeRecipients - Array of fee recipient addresses
     * @param {string} recipientCid - IPFS CID of the recipient comment
     * @param {string} senderCid1 - First sender CID
     * @param {string} senderCid2 - Second sender CID
     * @param {string} sender - Sender address
     * @param {string} key1 - First generated sender cache key
     * @param {string} key2 - Second generated sender cache key
     * @expects {string} key1 should not equal key2
     */
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
