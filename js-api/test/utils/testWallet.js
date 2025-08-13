/**
 * @fileoverview Test wallet utilities for funding and managing test accounts
 * 
 * This module provides utilities for creating and funding test wallets
 * using Hardhat's local development accounts. It handles the common pattern
 * of creating a random test wallet and funding it from the first Hardhat account.
 * 
 * @author Plebbit Tipping Team
 * @version 1.0.0
 * @since 2024
 */

import { ethers } from 'ethers';

/**
 * Default Hardhat accounts with their private keys
 * These are the standard development accounts that Hardhat provides
 */
const HARDHAT_ACCOUNTS = [
  {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
  },
  {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
  },
  {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
  }
];

/**
 * Creates a test wallet setup with funding capability
 * 
 * @param {string} rpcUrl - The RPC URL to connect to (should be local Hardhat node)
 * @param {string} [fundingAmount='10.0'] - Amount of ETH to fund the test wallet with
 * @returns {Promise<Object>} Object containing test wallet details and funding function
 */
export async function createTestWallet(rpcUrl = 'http://127.0.0.1:8545', fundingAmount = '10.0') {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  // Create a random wallet for testing
  const testWallet = ethers.Wallet.createRandom().connect(provider);
  
  // Use first Hardhat account as funder
  const funderWallet = new ethers.Wallet(HARDHAT_ACCOUNTS[0].privateKey, provider);
  
  /**
   * Funds the test wallet from the first Hardhat account
   * 
   * @returns {Promise<Object>} Transaction receipt
   */
  const fundWallet = async () => {
    console.log(`Funding test wallet ${testWallet.address} with ${fundingAmount} ETH...`);
    
    const tx = await funderWallet.sendTransaction({
      to: testWallet.address,
      value: ethers.parseEther(fundingAmount)
    });
    
    const receipt = await tx.wait();
    console.log(`✅ Funded test wallet. Transaction hash: ${receipt.hash}`);
    
    return receipt;
  };
  
  /**
   * Gets the balance of the test wallet
   * 
   * @returns {Promise<string>} Balance in ETH as string
   */
  const getBalance = async () => {
    const balance = await provider.getBalance(testWallet.address);
    return ethers.formatEther(balance);
  };
  
  return {
    // Wallet details
    address: testWallet.address,
    privateKey: testWallet.privateKey,
    wallet: testWallet,
    
    // Hardhat account details (for reference)
    funderAddress: funderWallet.address,
    funderPrivateKey: funderWallet.privateKey,
    
    // Utility functions
    fundWallet,
    getBalance,
    
    // Direct access to first Hardhat account if needed
    getFirstHardhatAccount: () => ({
      address: HARDHAT_ACCOUNTS[0].address,
      privateKey: HARDHAT_ACCOUNTS[0].privateKey
    })
  };
}

/**
 * Gets the first Hardhat account (commonly used for testing)
 * 
 * @returns {Object} First Hardhat account with address and private key
 */
export function getFirstHardhatAccount() {
  return {
    address: ethers.getAddress(HARDHAT_ACCOUNTS[0].address), // Ensure proper checksumming
    privateKey: HARDHAT_ACCOUNTS[0].privateKey
  };
}

/**
 * Creates a provider connected wallet from a private key
 * 
 * @param {string} privateKey - The private key to create wallet from
 * @param {string} rpcUrl - The RPC URL to connect to
 * @returns {ethers.Wallet} Connected wallet instance
 */
export function createWalletFromPrivateKey(privateKey, rpcUrl = 'http://127.0.0.1:8545') {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

/**
 * Waits for the local Hardhat node to be ready
 * 
 * @param {string} rpcUrl - The RPC URL to check
 * @param {number} maxRetries - Maximum number of connection attempts
 * @param {number} retryDelay - Delay between retry attempts in milliseconds
 * @returns {Promise<boolean>} True if node is ready, false if timeout
 */
export async function waitForHardhatNode(rpcUrl = 'http://127.0.0.1:8545', maxRetries = 10, retryDelay = 1000) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await provider.getBlockNumber();
      console.log('✅ Hardhat node is ready');
      return true;
    } catch (error) {
      console.log(`⏳ Waiting for Hardhat node... (attempt ${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  console.log('❌ Hardhat node not ready after maximum retries');
  return false;
}
