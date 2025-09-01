# @plebbit/tipping-v1

JavaScript/TypeScript API for the PlebbitTippingV1 smart contract.

## Installation

```bash
npm install @plebbit/tipping-v1
```

## Usage

The library now operates in a simplified mode where private keys are only required when creating tip transactions:

| Operation | Private Key Required | Method |
|-----------|---------------------|---------|
| **Read-Only** | ❌ No | `createComment()`, `getFeePercent()`, `getMinimumTipAmount()` |
| **Transactions** | ✅ Yes (in `createTip()`) | `createTip()` with `privateKey` parameter |

### Basic Setup (Read-Only)

For reading tip amounts and contract data (no transactions):

```javascript
import { PlebbitTippingV1 } from '@plebbit/tipping-v1';

// Initialize the API (read-only mode)
const plebbitTippingV1 = await PlebbitTippingV1({
  rpcUrls: ['https://your-rpc-url.com'],
  cache: { maxAge: 60000 }
  // No privateKey needed for read-only operations
});

// Get tip amounts for a comment
const comment = await plebbitTippingV1.createComment({
  feeRecipients: ['0x1234567890abcdef1234567890abcdef12345678'],
  recipientCommentCid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
});

console.log('Tips total amount:', comment.tipsTotalAmount.toString());
await comment.updateTipsTotalAmount(); // Force refresh from blockchain
```

### Transaction Setup (With Private Key)

For creating actual tip transactions, provide the private key directly to the `createTip` method:

```javascript
import { PlebbitTippingV1 } from '@plebbit/tipping-v1';

// Initialize without private key (simplified setup)
const plebbitTippingV1 = await PlebbitTippingV1({
  rpcUrls: ['https://your-rpc-url.com'],
  cache: { maxAge: 60000 }
  // No privateKey in constructor
});

// Create and send a tip transaction with private key
const tip = await plebbitTippingV1.createTip({
  feeRecipients: ['0x1234567890abcdef1234567890abcdef12345678'],
  recipientCommentCid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  senderCommentCid: 'QmZ9Wg8vnqVjLYXsBhFk9H9GNzpkG4QPkTxSZaLfFJ6rNY', // optional
  sender: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',      // optional
  privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' // Required for transactions
});

const result = await tip.send();
console.log('✅ Transaction successful!');
console.log('Transaction hash:', result.transactionHash);
console.log('Block number:', result.receipt.blockNumber);
```

### Environment Variables (Recommended)

```javascript
const plebbitTippingV1 = await PlebbitTippingV1({
  rpcUrls: [process.env.RPC_URL],
  cache: { maxAge: 60000 }
});

// Use private key from environment when creating tips
const tip = await plebbitTippingV1.createTip({
  feeRecipients: ['0x1234...'],
  recipientCommentCid: 'QmXyz...',
  privateKey: process.env.PRIVATE_KEY // Secure private key loading
});
```

## Architecture

The JS-API implements intelligent caching and debouncing to optimize blockchain calls and improve performance. Here's how the data flows:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   JS-API        │    │  Smart Contract │
│                 │    │                 │    │                 │
│ createComment() │───▶│ Cache Layer     │───▶│ getTipsTotal    │
│                 │    │ - comments[]    │    │ Amount()        │
│ updateTips()    │───▶│ - senderComments│    │                 │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              ▲
                              │
                              │ updateTipsTotalAmount()
                              │ forces fresh call
```

### Caching Strategy

- **First call**: Makes blockchain call and caches result
- **Subsequent calls**: Uses cached value (no blockchain call)
- **Manual refresh**: `updateTipsTotalAmount()` bypasses cache for fresh data
- **Automatic expiration**: Cache expires after `cache.maxAge` milliseconds

### Debouncing & Bulk Optimization

The API uses intelligent debouncing to batch multiple requests and optimize blockchain calls:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Multiple      │    │   Debounce      │    │   Smart         │
│   Requests      │───▶│   Layer         │───▶│   Contract      │
│   (100ms)       │    │   - 100ms delay │    │   - Bulk calls  │
│                 │    │   - Deduplication│    │   - Single tx   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**How it works:**
1. **Multiple rapid requests** (within 100ms) are collected
2. **Deduplication** removes duplicate requests
3. **Bulk call** to smart contract with all unique requests
4. **Single transaction** instead of multiple individual calls

**Example scenario:**
```javascript
// These 3 calls happen within 100ms
const comment1 = await plebbitTipping.createComment({...}); // Request 1
const comment2 = await plebbitTipping.createComment({...}); // Request 2  
const comment3 = await plebbitTipping.createComment({...}); // Request 3

// Result: Only 1 blockchain call instead of 3!
// All 3 comments get their data from the same bulk call
```


## API Reference

### PlebbitTippingV1

#### Constructor Options

- `rpcUrls: string[]` - Array of RPC URLs to connect to (only the first is used currently)
- `cache?: { maxAge: number }` - Optional caching configuration
  - `maxAge`: Cache expiration time in milliseconds (default: 60000ms)
- `privateKey?: string` - Optional private key for transaction signing
  - **Required for**: `createTip()` transactions
  - **Not needed for**: Read-only operations like `createComment()`, `getFeePercent()`, etc.
  - **Security**: Store in environment variables, never hardcode in source code

#### Methods

- `createTip(options)` - Create a new tip transaction
- `createComment(options)` - Create a comment instance for tip tracking
- `createSenderComment(options)` - Create a sender comment instance for tip tracking
- `getFeePercent()` - Get the fee percentage from the smart contract
- `getMinimumTipAmount()` - Get the minimum tip amount from the smart contract

### Options Interfaces

#### TipOptions
```typescript
interface TipOptions {
  feeRecipients: string[];        // Array of fee recipient addresses
  recipientCommentCid: string;     // CID of the comment being tipped
  senderCommentCid?: string;       // Optional CID of the sender's comment
  sender?: string;                 // Optional sender address
}
```

#### CommentOptions
```typescript
interface CommentOptions {
  feeRecipients: string[];        // Array of fee recipient addresses
  recipientCommentCid: string;     // CID of the comment to track
}
```

#### SenderCommentOptions
```typescript
interface SenderCommentOptions {
  feeRecipients: string[];        // Array of fee recipient addresses
  recipientCommentCid: string;     // CID of the comment being tipped
  senderCommentCid?: string;       // Optional CID of the sender's comment
  sender: string;                  // Sender address
}
```

### Detailed Method Documentation

#### `createTip(options)`
Creates a new tip transaction. The tip amount is automatically set to the contract's minimum tip amount if no custom amount is provided.

**Requirements:**
- Requires `privateKey` to be set during initialization
- Wallet must have sufficient ETH balance for the tip + gas fees

**Parameters:**
- `options: TipOptions` - Tip configuration

**Returns:**
- `Promise<Tip>` - Tip object with send method

**Example:**
```javascript
// Requires privateKey in constructor
const plebbitTippingV1 = await PlebbitTippingV1({
  rpcUrls: ['https://your-rpc-url.com'],
  privateKey: process.env.PRIVATE_KEY // Required!
});

const tip = await plebbitTippingV1.createTip({
  feeRecipients: ['0x1234...'],
  recipientCommentCid: 'QmXyz...',
  senderCommentCid: 'QmAbc...',  // optional
  sender: '0x5678...'            // optional
});

const result = await tip.send();
console.log('✅ Transaction successful!');
console.log('Transaction hash:', result.transactionHash);
console.log('Tip amount:', ethers.formatEther(result.tipAmount), 'ETH');
```

#### `createComment(options)`
Creates a comment instance for tracking tip amounts. Uses intelligent caching to optimize blockchain calls.

**Parameters:**
- `options: CommentOptions` - Comment configuration

**Returns:**
- `Promise<Comment>` - Comment object with tip tracking methods

**Example:**
```javascript
const comment = await plebbitTippingV1.createComment({
  feeRecipients: ['0x1234...'],
  recipientCommentCid: 'QmXyz...'
});

console.log('Current tips:', comment.tipsTotalAmount);
await comment.updateTipsTotalAmount(); // Force refresh
```

#### `createSenderComment(options)`
Creates a sender-specific comment instance for tip tracking. Extends the basic comment functionality with sender information.

**Parameters:**
- `options: SenderCommentOptions` - Sender comment configuration

**Returns:**
- `Promise<SenderComment>` - Sender comment object with tip tracking methods

**Example:**
```javascript
const senderComment = await plebbitTippingV1.createSenderComment({
  feeRecipients: ['0x1234...'],
  recipientCommentCid: 'QmXyz...',
  senderCommentCid: 'QmAbc...',  // optional
  sender: '0x5678...'
});
```

#### `getFeePercent()`
Retrieves the fee percentage from the smart contract.

**Returns:**
- `Promise<bigint>` - Fee percentage as a bigint

**Example:**
```javascript
const feePercent = await plebbitTippingV1.getFeePercent();
console.log('Fee percentage:', feePercent.toString());
```

#### `getMinimumTipAmount()`
Retrieves the minimum tip amount from the smart contract.

**Returns:**
- `Promise<bigint>` - Minimum tip amount as a bigint

**Example:**
```javascript
const minAmount = await plebbitTippingV1.getMinimumTipAmount();
console.log('Minimum tip amount:', ethers.formatEther(minAmount), 'ETH');
```

### Tip

Properties:
- `transactionHash` - Transaction hash after sending
- `receipt` - Transaction receipt
- `error` - Any error that occurred

Methods:
- `send()` - Send the tip transaction

### Comment / SenderComment

Properties:
- `tipsTotalAmount` - Total amount of tips received (cached)

Methods:
- `updateTipsTotalAmount()` - Refresh the tips total amount (bypasses cache)

### Network Support

The API automatically detects the contract address based on the RPC URL:

- **Localhost**: `0x49753cB4ff375e04D2BC2A64971F60cD1a091381`
- **Sepolia**: `0x49753cB4ff375e04D2BC2A64971F60cD1a091381`
- **Polygon Amoy**: `0x49753cB4ff375e04D2BC2A64971F60cD1a091381`
- **Base Sepolia**: `0x49753cB4ff375e04D2BC2A64971F60cD1a091381`

### Error Handling

All methods return promises that may reject with the following error types:
- **Contract errors**: When smart contract calls fail
- **Network errors**: When RPC connections fail
- **Validation errors**: When invalid parameters are provided
- **CID errors**: When invalid CIDs are provided
- **Wallet errors**: When private key is missing for transactions
- **Insufficient funds**: When wallet doesn't have enough ETH

**Example error handling:**
```javascript
try {
  const tip = await plebbitTippingV1.createTip({
    feeRecipients: ['0x1234...'],
    recipientCommentCid: 'QmXyz...'
  });
  const result = await tip.send();
  console.log('Success:', result.transactionHash);
} catch (error) {
  if (error.message.includes('insufficient funds')) {
    console.error('Not enough ETH in wallet for tip + gas');
  } else if (error.message.includes('private key')) {
    console.error('Private key required for transactions');
  } else {
    console.error('Transaction failed:', error.message);
  }
}
```

## Development

```bash
# Build
npm run build

# Run tests (see Testing section below)
npm test

# Development mode
npm run dev
```

## Quick Start (Localhost Testing)

Want to test the js-api locally? Follow these simple steps:

### Option 1: Automatic Deployment (Recommended)

The `hardhat-deploy` plugin automatically deploys contracts when you start the node:

1. **Start local blockchain** (contracts deploy automatically on localhost):
   ```bash
   cd contracts
   npx hardhat node
   ```

2. **Run the js-api tests**:
   ```bash
   cd js-api
   npm run build
   npm test  # Includes both read-only and transaction tests
   ```

### Option 2: Manual Deployment

If you prefer to control deployment manually:

1. **Start local blockchain** (without auto-deployment):
   ```bash
   cd contracts
   npx hardhat node --no-deploy
   ```

2. **Deploy the smart contract** (in a new terminal):
   ```bash
   cd contracts
   npx hardhat run deploy/00_deploy_contract.js --network localhost
   ```

3. **Run the js-api tests**:
   ```bash
   cd js-api
   npm run build
   npm test  # Includes both read-only and transaction tests
   ```

That's it! Your local testing environment is ready.

**Note**: The contract will be deployed at the same address (`0x49753cB4ff375e04D2BC2A64971F60cD1a091381`) in both cases due to deterministic deployment.

## Testing

We have a comprehensive test suite that validates the JS API and smart contracts across different environments. Run tests in the following sequence to ensure everything is working correctly:

### Test Types

- **Unit Tests** (`npm test`): Fast, mocked tests for development
- **Integration Tests** (`npm run test:integration`): Basic blockchain integration
- **Mainnet Fork Tests** (`npm run test:fork`): Comprehensive production-like testing
- **All Tests** (`npm run test:all`): Complete test suite

### 1. Basic Localhost Testing

First, test against a local Hardhat network with deployed contracts:

1. **Start local Hardhat node** (from project root):
   ```bash
   cd contracts
   npx hardhat node
   ```

2. **Deploy contracts** (in a new terminal):
   ```bash
   cd contracts
   npx hardhat run deploy/00_deploy_contract.js --network localhost
   ```

3. **Build and run basic tests**:
   ```bash
   cd js-api
   npm run build
   npm run test:unit
   ```

This validates:
- Contract deployment and connectivity
- Basic JS API functionality
- Comment creation and caching
- Environment variable loading

### 2. Mainnet Fork Testing

Test against real Ethereum mainnet state using a fork:

#### Prerequisites

1. Get an RPC URL from [Alchemy](https://www.alchemy.com/) or [Infura](https://infura.io/)
2. Add it to your `.env` file in the project root:
   ```bash
   MAINNET_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/your-api-key"
   # or
   NETWORK_0="https://eth-mainnet.g.alchemy.com/v2/your-api-key"
   ```

#### Running Mainnet Fork Tests

1. **Start forked Hardhat node** (from project root):
   ```bash
   cd contracts
   npm run node:fork
   ```
   
   This starts a local node forked from the latest Ethereum mainnet block.

2. **Deploy contract deterministically** (in a new terminal):
   ```bash
   cd contracts
   npx hardhat run deploy/00_deploy_contract.js --network localhost
   ```

3. **Run comprehensive mainnet fork tests**:
   ```bash
   cd js-api
   node test/integration/mainnet-fork.test.js
   ```

This comprehensive test:
- Validates mainnet fork connectivity and block number
- Tests contract interaction with real mainnet state
- Verifies deterministic deployment addresses
- Confirms all JS API functionality works with mainnet data

### 4. Contract-Level Tests

You can also run Solidity contract tests against the mainnet fork:

```bash
cd contracts
npm run test:fork
```

### Test Sequence Summary

For complete validation, run tests in this order:

1. `npm test` - Unit tests (fast, no blockchain needed)
2. `npm run test:integration` - Integration tests (requires local blockchain)
3. `npm run test:fork` - Mainnet fork tests (requires mainnet fork)
4. `npm run test:all` - Run all tests in sequence

### Benefits of This Testing Approach

- **Progressive validation**: From simple to complex environments
- **Real state testing**: Mainnet fork provides actual Ethereum state
- **Deterministic deployment**: Same contract addresses across environments
- **No gas costs**: All fork transactions are simulated locally
- **Comprehensive coverage**: Tests both JS API and smart contracts

### Configuration Options

Pin the fork to a specific block number for reproducible tests:

```bash
FORK_BLOCK_NUMBER=18500000  # Optional: pin to specific block
```

## How to Test the New Implementation

### 1. **Quick Local Testing**

```bash
# From project root
cd contracts
npx hardhat node  # Start local blockchain

# In another terminal
cd js-api
npm run build
npm test  # This will run the updated tests
```

### 2. **Test the New API Pattern**

Create a simple test script to verify the new behavior:

```javascript
// test-new-api.js
import { PlebbitTippingV1 } from './dist/plebbitTippingV1.js';

async function testNewAPI() {
  // Create instance without private key
  const plebbitTipping = await PlebbitTippingV1({
    rpcUrls: ['http://127.0.0.1:8545'],
    cache: { maxAge: 60000 }
  });

  console.log('✅ Instance created without private key');

  // Test read-only operations
  const feePercent = await plebbitTipping.getFeePercent();
  console.log('✅ Read-only operation works:', feePercent.toString());

  // Test transaction with private key (will fail without proper setup)
  try {
    const tip = await plebbitTipping.createTip({
      feeRecipients: ['0x1234...'],
      recipientCommentCid: 'QmXyz...',
      privateKey: '0xinvalid' // This should fail
    });
  } catch (error) {
    console.log('✅ Transaction properly requires valid private key');
  }
}

testNewAPI();
```

### 3. **Run the Updated Test Suite**

The tests have been updated to reflect the new API:

```bash
cd js-api
npm test
```

This will run:
- `simple.test.js` - Tests the new API pattern with private key in `createTip`
- `plebbitTippingV1.test.js` - Unit tests for caching and other functionality

### 4. **Verify the Changes Work**

The key changes to verify:

1. **Constructor no longer accepts `privateKey`**:
   ```javascript
   // ✅ This should work
   const plebbitTipping = await PlebbitTippingV1({
     rpcUrls: ['http://127.0.0.1:8545'],
     cache: { maxAge: 60000 }
   });

   // ❌ This should fail (no longer supported)
   const plebbitTipping = await PlebbitTippingV1({
     rpcUrls: ['http://127.0.0.1:8545'],
     cache: { maxAge: 60000 },
     privateKey: '0x...' // This parameter no longer exists
   });
   ```

2. **`createTip` now requires `privateKey`**:
   ```javascript
   // ✅ This should work
   const tip = await plebbitTipping.createTip({
     feeRecipients: ['0x1234...'],
     recipientCommentCid: 'QmXyz...',
     privateKey: '0x...' // Required parameter
   });

   // ❌ This should fail
   const tip = await plebbitTipping.createTip({
     feeRecipients: ['0x1234...'],
     recipientCommentCid: 'QmXyz...'
     // Missing privateKey will cause error
   });
   ```

### 5. **Integration Testing**

For full integration testing with actual transactions:

```bash
# Start local blockchain with funded accounts
cd contracts
npx hardhat node

# In another terminal, run integration tests
cd js-api
npm run test:integration
```

## Summary of Changes

1. **API Change**: `privateKey` moved from constructor to `createTip` method
2. **Tests Updated**: All test files updated to reflect new API pattern
3. **Documentation**: js-api/README.md needs complete rewrite for new API
4. **Backward Compatibility**: This is a breaking change - clients need to update their code

The main benefit is that clients no longer need to provide a private key when creating the instance, making the API more secure and flexible. The private key is only used when actually creating transactions.
