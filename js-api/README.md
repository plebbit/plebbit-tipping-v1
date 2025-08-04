# @plebbit/tipping-v1

JavaScript/TypeScript API for the PlebbitTippingV1 smart contract.

## Installation

```bash
npm install @plebbit/tipping-v1
```

## Usage

```javascript
import { PlebbitTippingV1 } from '@plebbit/tipping-v1';

// Initialize the API
const plebbitTippingV1 = await PlebbitTippingV1({
  rpcUrls: ['https://your-rpc-url.com'],
  cache: { maxAge: 60000 }
});

// Create and send a tip
const tip = await plebbitTippingV1.createTip({
  feeRecipients: ['0x...'],
  recipientCommentCid: 'QmXyz...',
  senderCommentCid: 'QmAbc...',
  sender: '0x...'
});

await tip.send();
console.log('Transaction hash:', tip.transactionHash);

// Get tip amounts for a comment
const comment = await plebbitTippingV1.createComment({
  feeRecipients: ['0x...'],
  recipientCommentCid: 'QmXyz...'
});

console.log('Tips total amount:', comment.tipsTotalAmount);
await comment.updateTipsTotalAmount();
```

## API Reference

### PlebbitTippingV1

#### Constructor Options

- `rpcUrls: string[]` - Array of RPC URLs to connect to
- `cache?: { maxAge: number }` - Optional caching configuration

#### Methods

- `createTip(options)` - Create a new tip transaction
- `createComment(options)` - Create a comment instance for tip tracking
- `createSenderComment(options)` - Create a sender comment instance for tip tracking

### Tip

Properties:
- `transactionHash` - Transaction hash after sending
- `receipt` - Transaction receipt
- `error` - Any error that occurred

Methods:
- `send()` - Send the tip transaction

### Comment / SenderComment

Properties:
- `tipsTotalAmount` - Total amount of tips received

Methods:
- `updateTipsTotalAmount()` - Refresh the tips total amount

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
   node test/simple.test.js
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
   node test/simple.test.js
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
