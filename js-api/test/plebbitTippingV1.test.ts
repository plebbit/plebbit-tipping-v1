import assert from 'assert';
import { PlebbitTippingV1 } from '../src/plebbitTippingV1';
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const rpcUrl = 'http://127.0.0.1:8545';
const cache = { maxAge: 60000 };

async function runTests() {
  try {
    console.log('Starting PlebbitTippingV1 tests...');
    console.log('Admin address from .env:', process.env.ADMIN_ADDRESS);
    
    const plebbitTipping = await PlebbitTippingV1({ rpcUrls: [rpcUrl], cache });
    console.log('PlebbitTippingV1 instance created successfully');

    // Test contract connectivity
    try {
      const feePercent = await plebbitTipping.getFeePercent();
      console.log('Contract connected successfully. Fee percent:', feePercent.toString());
      
      const minTipAmount = await plebbitTipping.getMinimumTipAmount();
      console.log('Minimum tip amount:', minTipAmount.toString());
    } catch (error) {
      console.error('Contract connection failed:', error.message);
      return;
    }

    // Test comment creation and caching
    const recipientCommentCid = 'QmTestRecipientCid123';
    const senderCommentCid = 'QmTestSenderCid456';
    const feeRecipients = [process.env.ADMIN_ADDRESS];

    try {
      const comment = await plebbitTipping.createComment({
        feeRecipients,
        recipientCommentCid,
      });
      console.log('Comment created successfully with tipsTotalAmount:', comment.tipsTotalAmount.toString());
      
      const senderComment = await plebbitTipping.createSenderComment({
        feeRecipients,
        recipientCommentCid,
        senderCommentCid,
        sender: process.env.ADMIN_ADDRESS,
      });
      console.log('Sender comment created successfully');
      
    } catch (error) {
      console.error('Comment creation failed:', error.message);
    }

    console.log('All tests completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

runTests();
