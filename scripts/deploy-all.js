// deploy/deploy-all.js
require('dotenv').config();
const { spawn, execSync } = require('child_process');
const waitOn = require('wait-on'); // npm install wait-on
const semver = require('semver');
const minVersion = '20.19.0';

if (!semver.satisfies(process.version, '>=' + minVersion)) {
  console.error(`Node.js ${minVersion} or higher is required. Current version: ${process.version}`);
  process.exit(1);
}

async function deployToForks() {
  let i = 0;
  while (true) {
    const forkUrl = process.env[`NETWORK_${i}`];
    if (!forkUrl) break;

    const port = 8545 + i; // Use a different port for each fork
    console.log(`\nStarting Hardhat node for NETWORK_${i} on port ${port}...`);

    // Start Hardhat node with --fork
    const node = spawn('npx', [
      'hardhat', 'node',
      '--fork', forkUrl,
      '--port', port,
    ], { stdio: 'inherit' });

    // Wait for node to be ready
    await waitOn({ resources: [`tcp:localhost:${port}`] });

    // Create a temporary Hardhat config for this network
    const networkName = `custom${i}`;
    const hardhatConfig = `
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
    ${networkName}: {
      url: "http://localhost:${port}",
      accounts: ["${process.env.PRIVATE_KEY}"]
    }
  },
  namedAccounts: {
    deployer: {
      default: 0, // here 0 means the first account by default
    },
  }
};
    `;
    require('fs').writeFileSync('hardhat.temp.config.js', hardhatConfig);

    // Deploy using the temp config
    console.log(`Deploying to ${networkName} (forked from ${forkUrl})...`);
    execSync(
      `npx hardhat run deploy/00_deploy_contract.js --network ${networkName} --config hardhat.temp.config.js`,
      { stdio: 'inherit' }
    );

    // Clean up
    require('fs').unlinkSync('hardhat.temp.config.js');
    node.kill();
    await new Promise(resolve => node.on('exit', resolve));
    await new Promise(res => setTimeout(res, 1000)); // Optional: extra delay
    i++;
  }
}

deployToForks();