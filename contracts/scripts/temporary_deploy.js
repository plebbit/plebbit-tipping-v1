// temporary_deploy.js
const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with the account:', deployer.address);
  console.log('Account balance:', (await ethers.provider.getBalance(deployer.address)).toString());
  
  const PlebbitTippingV1 = await ethers.getContractFactory('PlebbitTippingV1');
  const contract = await PlebbitTippingV1.deploy(
    process.env.ADMIN_ADDRESS, 
    ethers.parseEther("0.001"),
    5
  );

  await contract.waitForDeployment();
  console.log('PlebbitTippingV1 deployed to:', await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
