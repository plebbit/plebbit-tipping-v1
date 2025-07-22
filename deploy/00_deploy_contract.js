// deploy/01_deploy_plebbit.js
module.exports = async function (hre) {
  const { getNamedAccounts, deployments, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  console.log("Deployer:", deployer);
  const minimumTipAmount = ethers.parseEther("0.001");
  const feePercent = 5;

  // Use a salt (must be 32 bytes, e.g., a hash)
  const salt = ethers.keccak256(ethers.toUtf8Bytes("plebbit-v1-salt"));

  const deployment = await deploy("PlebbitTippingV1", {
    from: deployer,
    args: [minimumTipAmount, feePercent],
    deterministicDeployment: salt,
    log: true,
  });
  if (deployment.newlyDeployed) {
    console.log("Deployed PlebbitTippingV1 at:", deployment.address);
  } else {
    console.log("PlebbitTippingV1 already deployed at:", deployment.address);
  }
  // Print the network name
  console.log("Deployment network:", hre.network.name);
};