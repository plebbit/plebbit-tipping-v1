require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require('hardhat-deploy');
require('dotenv').config();
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20", // <-- set to at least 0.8.20
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true,
      // Forking configuration (uncomment and set MAINNET_RPC_URL in .env to use)
      ...(process.env.MAINNET_RPC_URL ? {
        forking: {
          url: process.env.MAINNET_RPC_URL,
          blockNumber: process.env.FORK_BLOCK_NUMBER ? parseInt(process.env.FORK_BLOCK_NUMBER) : undefined
        }
      } : {}),
      // Gas configuration for forked networks
      initialBaseFeePerGas: 0, // Set to 0 for local testing to avoid high gas fees
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      // Gas configuration to handle high mainnet fees when forked
      gasMultiplier: 2, // Multiply gas estimates by 2 for safety
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID", // Set this in your .env
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`] : [],
      chainId: 11155111,
    },
    amoy: {
      url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology", // Set this in your .env
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`] : [],
      chainId: 80002,
      gasPrice: 50_000_000_000, // 50 gwei
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", // Set this in your .env
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY.startsWith('0x') ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`] : [],
      chainId: 84532,
      gasPrice: 1000000000, // 1 gwei
    },
  },
  namedAccounts: {
    deployer: {
      default: 0, // here 0 means the first account by default
    },
  },
  deterministicDeployment: (network) => {
    // Use a fixed salt for deterministic deployment
    return {
      factory: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
      deployer: "0x3fab184622dc19b6109349b94811493bf2a45362",
      funding: "10000000000000000",
      signedTx: "0x00",
    };
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "YOUR_ETHERSCAN_API_KEY",
  },
};
