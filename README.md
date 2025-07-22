# Plebbit Tipping v1

This is a Solidity smart contract project using Hardhat for a decentralized tipping system called `PlebbitTippingV1`.

## Features
- **tip**: Allows users to send tips to other users with an optional comment.
- **getTipsTotalAmount**: Gets the total tip amount for a particular comment and fee recipients.
- **getTips**: Retrieves the list of tips for a comment.
- Access control with admin and moderator roles using OpenZeppelin's AccessControl.
- Deterministic contract address deployment across different chains.

## Prerequisites
- Node.js (preferably LTS)
- npm

## Getting Started

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd plebbit-tipping-v1
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the contract:
   ```bash
   npm run compile
   ```

### Running Tests

Execute the following command to run the tests:
```bash
npm test
```

### Deployment

Start a local Hardhat node:
```bash
npm run node
```

Deploy the contract locally:
```bash
npm run deploy:localhost
```

For general deployment:
```bash
npm run deploy
```

#### Running Tests on a Mainnet Fork (Ethereum)

You can run tests against a fork of the current Ethereum mainnet using Hardhat.  
You'll need an RPC URL from a provider like Alchemy or Infura.

1. Set your mainnet RPC URL as an environment variable:
   ```bash
   export MAINNET_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/your-api-key"
   ```

2. Start a Hardhat node forked from mainnet:
   ```bash
   npx hardhat node --fork $MAINNET_RPC_URL
   ```

3. In a new terminal, run the tests:
   ```bash
   npm test
   ```

## Contract API

### Main Functions

- `tip(address recipient, uint256 amount, address feeRecipient, bytes32 senderCommentCid, bytes32 recipientCommentCid)`
- `getTipsTotalAmount(bytes32 recipientCommentCid, address[] calldata feeRecipients)`
- `getTipsTotalAmounts(bytes32[] calldata recipientCommentCids, address[][] calldata feeRecipients)`
- `getTipsTotalAmountsSameFeeRecipients(bytes32[] calldata recipientCommentCids, address[] calldata feeRecipients)`
- `getTipsAmounts(bytes32 recipientCommentCid, address[] calldata feeRecipients, uint256 offset, uint256 limit)`
- `getTips(bytes32 recipientCommentCid, address[] calldata feeRecipients, uint256 offset, uint256 limit)`
- `getSenderTipsTotalAmount(bytes32 senderCommentCid, address sender, bytes32 recipientCommentCid, address[] calldata feeRecipients)`
- `getSenderTipsTotalAmounts(bytes32 senderCommentCid, address sender, bytes32[] calldata recipientCommentCids, address[][] calldata feeRecipients)`
- `getSenderTipsTotalAmountsSameFeeRecipients(bytes32 senderCommentCid, address sender, bytes32[] calldata recipientCommentCids, address[] calldata feeRecipients)`

### Admin Functions

- `setMinimumTipAmount(uint256 _minimumTipAmount)` - Only moderators
- `setFeePercent(uint256 _feePercent)` - Only moderators (1-20%)

## License

This project is licensed under the MIT License.
