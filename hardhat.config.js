require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
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
    },
    localhost: {
      url: "http://127.0.0.1:8545",
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
};
