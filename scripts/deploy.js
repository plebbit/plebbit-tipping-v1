// deploy/01_deploy_plebbit.js
module.exports = async ({ getNamedAccounts, deployments, ethers }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
  
    const minimumTipAmount = ethers.parseEther("0.001");
    const feePercent = 5;
  
    // Use a salt (must be 32 bytes, e.g., a hash)
    const salt = ethers.keccak256(ethers.toUtf8Bytes("plebbit-v1-salt"));
  
    await deploy("PlebbitTippingV1", {
      from: deployer,
      args: [minimumTipAmount, feePercent],
      deterministicDeployment: salt,
      log: true,
    });
  };