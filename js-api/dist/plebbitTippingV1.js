"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlebbitTippingV1 = PlebbitTippingV1;
const ethers_1 = require("ethers");
const PlebbitTippingV1_json_1 = require("./PlebbitTippingV1.json");
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
class PlebbitTippingV1Instance {
    constructor(rpcUrls, cache, contractAddress) {
        this.commentsCache = {};
        this.senderCommentsCache = {};
        this.defaultFeeRecipient = process.env.ADMIN_ADDRESS || "0x7CC17990FE944919Aa6b91AA576CEBf1E9454749"; // from .env or fallback
        this.rpcUrls = rpcUrls;
        this.cache = cache;
        const provider = new ethers_1.ethers.JsonRpcProvider(rpcUrls[0]);
        this.contract = new ethers_1.ethers.Contract(contractAddress, PlebbitTippingV1_json_1.abi, provider);
    }
    async createTip({ feeRecipients, recipientCommentCid, senderCommentCid, sender }) {
        // For now, we'll use a simple string to bytes32 conversion instead of IPFS CID parsing
        const cidBytes = ethers_1.ethers.encodeBytes32String(recipientCommentCid);
        const tipTx = await this.contract.tip(sender || ethers_1.ethers.ZeroAddress, ethers_1.ethers.parseEther("0.01"), // example amount
        feeRecipients[0], senderCommentCid ? ethers_1.ethers.encodeBytes32String(senderCommentCid) : ethers_1.ethers.ZeroHash, cidBytes, { from: sender });
        return {
            async send() {
                const receipt = await tipTx.wait();
                return {
                    transactionHash: tipTx.hash,
                    receipt,
                    error: undefined,
                };
            }
        };
    }
    async createComment({ feeRecipients, recipientCommentCid }) {
        const cacheKey = `${feeRecipients.join()}:${recipientCommentCid}`;
        if (!this.commentsCache[cacheKey]) {
            this.commentsCache[cacheKey] = {
                tipsTotalAmount: await this.getTipsTotalAmount(feeRecipients, recipientCommentCid)
            };
            setTimeout(() => delete this.commentsCache[cacheKey], 60000);
        }
        const self = this;
        return {
            tipsTotalAmount: this.commentsCache[cacheKey].tipsTotalAmount,
            async updateTipsTotalAmount() {
                self.commentsCache[cacheKey].tipsTotalAmount = await self.getTipsTotalAmount(feeRecipients, recipientCommentCid);
            }
        };
    }
    async createSenderComment({ feeRecipients, recipientCommentCid, senderCommentCid, sender }) {
        const comment = await this.createComment({ feeRecipients, recipientCommentCid });
        return { ...comment };
    }
    async getTipsTotalAmount(feeRecipients, recipientCommentCid) {
        const cidBytes = ethers_1.ethers.encodeBytes32String(recipientCommentCid);
        const totalAmount = await this.contract.getTipsTotalAmount(cidBytes, feeRecipients);
        return totalAmount;
    }
    async getFeePercent() {
        return await this.contract.feePercent();
    }
    async getMinimumTipAmount() {
        return await this.contract.minimumTipAmount();
    }
}
// Default contract addresses for different networks
const DEFAULT_CONTRACT_ADDRESSES = {
    "http://127.0.0.1:8545": "0x49753cB4ff375e04D2BC2A64971F60cD1a091381", // localhost - deterministic deployment
    "https://sepolia.infura.io": "0x49753cB4ff375e04D2BC2A64971F60cD1a091381", // sepolia
    "https://polygon-amoy.g.alchemy.com": "0x49753cB4ff375e04D2BC2A64971F60cD1a091381", // amoy
    "https://base-sepolia.g.alchemy.com": "0x49753cB4ff375e04D2BC2A64971F60cD1a091381", // base sepolia
};
// Factory function matching the requirements
async function PlebbitTippingV1({ rpcUrls, cache }) {
    // Use first RPC URL to determine contract address
    const contractAddress = DEFAULT_CONTRACT_ADDRESSES[rpcUrls[0]] || DEFAULT_CONTRACT_ADDRESSES["http://127.0.0.1:8545"];
    return new PlebbitTippingV1Instance(rpcUrls, cache, contractAddress);
}
