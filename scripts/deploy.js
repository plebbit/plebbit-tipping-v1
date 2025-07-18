const { ethers } = require("hardhat");

async function main() {
  // Deploy with initial parameters
  const minimumTipAmount = ethers.parseEther("0.001"); // 0.001 ETH minimum
  const feePercent = 5; // 5% fee

  console.log("Deploying PlebbitTippingV1...");
  
  const PlebbitTippingV1 = await ethers.getContractFactory("PlebbitTippingV1");
  const plebbitTipping = await PlebbitTippingV1.deploy(minimumTipAmount, feePercent);
  
  await plebbitTipping.waitForDeployment();
  
  console.log("PlebbitTippingV1 deployed to:", await plebbitTipping.getAddress());
  console.log("Minimum tip amount:", ethers.formatEther(minimumTipAmount), "ETH");
  console.log("Fee percent:", feePercent, "%");
  
  // Verify deployment
  const deployedMinimumTipAmount = await plebbitTipping.minimumTipAmount();
  const deployedFeePercent = await plebbitTipping.feePercent();
  
  console.log("\nVerification:");
  console.log("Deployed minimum tip amount:", ethers.formatEther(deployedMinimumTipAmount), "ETH");
  console.log("Deployed fee percent:", deployedFeePercent.toString(), "%");
  
  return plebbitTipping;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
