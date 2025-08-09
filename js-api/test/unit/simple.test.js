import { PlebbitTippingV1 } from '../../dist/plebbitTippingV1.js';
import { createTestWallet, getFirstHardhatAccount } from '../utils/testWallet.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const rpcUrl = 'http://127.0.0.1:8545';
const cache = { maxAge: 60000 };

describe('PlebbitTippingV1', () => {
  let plebbitTipping;

  beforeAll(async () => {
    console.log('Starting PlebbitTippingV1 tests...');
    console.log('Admin address from .env:', process.env.ADMIN_ADDRESS);
    
    plebbitTipping = await PlebbitTippingV1({ rpcUrls: [rpcUrl], cache });
    console.log('PlebbitTippingV1 instance created successfully');
  });

  describe('Contract connectivity', () => {
    test('should connect to contract and get fee percent', async () => {
      const feePercent = await plebbitTipping.getFeePercent();
      console.log('Contract connected successfully. Fee percent:', feePercent.toString());
      expect(feePercent).toBeDefined();
    });

    test('should get minimum tip amount', async () => {
      const minTipAmount = await plebbitTipping.getMinimumTipAmount();
      console.log('Minimum tip amount:', minTipAmount.toString());
      expect(minTipAmount).toBeDefined();
    });
  });

  describe('Comment creation', () => {
    test('should create comment with valid CID', async () => {
      // Use valid CID format (base58 encoded multihash)
      const recipientCommentCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const feeRecipients = [process.env.ADMIN_ADDRESS || '0xf39fd6E51AAB6bD838C26c4FD3B5E0D5E9E8F4aC'];

      const comment = await plebbitTipping.createComment({
        feeRecipients,
        recipientCommentCid,
      });
      
      console.log('Comment created successfully with tipsTotalAmount:', comment.tipsTotalAmount.toString());
      expect(comment).toBeDefined();
      expect(comment.tipsTotalAmount).toBeDefined();
    });

    test('should create sender comment with valid CIDs', async () => {
      // Use valid CID format (base58 encoded multihash)
      const recipientCommentCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const senderCommentCid = 'QmZ9Wg8vnqVjLYXsBhFk9H9GNzpkG4QPkTxSZaLfFJ6rNY';
      const feeRecipients = [process.env.ADMIN_ADDRESS || '0xf39fd6E51AAB6bD838C26c4FD3B5E0D5E9E8F4aC'];

      const senderComment = await plebbitTipping.createSenderComment({
        feeRecipients,
        recipientCommentCid,
        senderCommentCid,
        sender: process.env.ADMIN_ADDRESS || '0xf39fd6E51AAB6bD838C26c4FD3B5E0D5E9E8F4aC',
      });
      
      console.log('Sender comment created successfully');
      expect(senderComment).toBeDefined();
    });
  });

  describe('Transaction tests with funded wallet', () => {
    let testWalletInfo;
    let plebbitTippingWithSigner;

    beforeAll(async () => {
      // Create and fund a test wallet
      testWalletInfo = await createTestWallet(rpcUrl, '5.0');
      await testWalletInfo.fundWallet();
      
      // Verify funding
      const balance = await testWalletInfo.getBalance();
      console.log(`Test wallet balance: ${balance} ETH`);
      expect(parseFloat(balance)).toBeGreaterThan(4); // Should have ~5 ETH minus gas
      
      // Create PlebbitTippingV1 instance with the funded wallet's private key
      plebbitTippingWithSigner = await PlebbitTippingV1({ 
        rpcUrls: [rpcUrl], 
        cache,
        privateKey: testWalletInfo.privateKey
      });
      console.log('PlebbitTippingV1 instance created with signer');
    });

    test('should create actual tip transaction', async () => {
      const recipientCommentCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
      const senderCommentCid = 'QmZ9Wg8vnqVjLYXsBhFk9H9GNzpkG4QPkTxSZaLfFJ6rNY';
      const feeRecipients = [testWalletInfo.funderAddress]; // Use the funder as fee recipient

      console.log('Creating tip transaction...');
      const result = await plebbitTippingWithSigner.createTip({
        feeRecipients,
        recipientCommentCid,
        senderCommentCid,
        sender: testWalletInfo.address // Use test wallet as sender
      });

      console.log('Sending transaction...');
      const receipt = await result.send();
      
      console.log(`✅ Transaction successful! Hash: ${receipt.transactionHash}`);
      expect(receipt.transactionHash).toBeDefined();
      expect(receipt.receipt).toBeDefined();
      expect(receipt.error).toBeUndefined();
    }, 30000); // 30 second timeout for blockchain interaction

    test('should work with first Hardhat account directly', async () => {
      // Alternative approach: use first Hardhat account directly
      const hardhatAccount = getFirstHardhatAccount();
      
      const plebbitTippingHardhat = await PlebbitTippingV1({
        rpcUrls: [rpcUrl],
        cache,
        privateKey: hardhatAccount.privateKey
      });

      const recipientCommentCid = 'QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN';
      const senderCommentCid = 'QmTgqo6NqkBAm9ks4Z1CirgW4Di3QuA6iRgn68EHi6D8R5';
      const feeRecipients = [hardhatAccount.address];

      console.log('Creating tip with first Hardhat account...');
      const result = await plebbitTippingHardhat.createTip({
        feeRecipients,
        recipientCommentCid,
        senderCommentCid,
        sender: hardhatAccount.address
      });

      const receipt = await result.send();
      console.log(`✅ Hardhat account transaction successful! Hash: ${receipt.transactionHash}`);
      
      expect(receipt.transactionHash).toBeDefined();
      expect(receipt.receipt).toBeDefined();
    }, 30000);
  });
});
