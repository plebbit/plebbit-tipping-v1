import { PlebbitTippingV1 } from '../../dist/plebbitTippingV1.js';
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
      const feeRecipients = [process.env.ADMIN_ADDRESS];

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
      const feeRecipients = [process.env.ADMIN_ADDRESS];

      const senderComment = await plebbitTipping.createSenderComment({
        feeRecipients,
        recipientCommentCid,
        senderCommentCid,
        sender: process.env.ADMIN_ADDRESS,
      });
      
      console.log('Sender comment created successfully');
      expect(senderComment).toBeDefined();
    });
  });
});
