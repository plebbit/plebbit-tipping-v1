import { ethers } from "ethers";
import { CID } from "multiformats/cid";
import { abi as PlebbitTippingV1Abi } from "./PlebbitTippingV1.json";
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
class PlebbitTippingV1Instance {
    constructor(rpcUrls, cache, contractAddress) {
        this.commentsCache = {};
        this.senderCommentsCache = {};
        this.defaultFeeRecipient = process.env.ADMIN_ADDRESS || "0x7CC17990FE944919Aa6b91AA576CEBf1E9454749"; // from .env or fallback
        this.rpcUrls = rpcUrls;
        this.cache = cache;
        const provider = new ethers.JsonRpcProvider(rpcUrls[0]);
        this.contract = new ethers.Contract(contractAddress, PlebbitTippingV1Abi, provider);
    }
    async createTip({ feeRecipients, recipientCommentCid, senderCommentCid, sender }) {
        const cidBytes = CID.parse(recipientCommentCid).bytes;
        const tipTx = await this.contract.tip(sender || ethers.ZeroAddress, ethers.parseEther("0.01"), // example amount
        feeRecipients[0], senderCommentCid ? CID.parse(senderCommentCid).bytes : ethers.ZeroHash, cidBytes, { from: sender });
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
        const cidBytes = CID.parse(recipientCommentCid).bytes;
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
    "http://127.0.0.1:8545": "0xba4f5e2ca1Ff09BeeCCD91Ef828b5AdB972936Cb", // localhost - from deployment
    "https://sepolia.infura.io": "0x49753cB4ff375e04D2BC2A64971F60cD1a091381", // sepolia
    "https://polygon-amoy.g.alchemy.com": "0x49753cB4ff375e04D2BC2A64971F60cD1a091381", // amoy
    "https://base-sepolia.g.alchemy.com": "0x49753cB4ff375e04D2BC2A64971F60cD1a091381", // base sepolia
};
// Factory function matching the requirements
export async function PlebbitTippingV1({ rpcUrls, cache }) {
    // Use first RPC URL to determine contract address
    const contractAddress = DEFAULT_CONTRACT_ADDRESSES[rpcUrls[0]] || DEFAULT_CONTRACT_ADDRESSES["http://127.0.0.1:8545"];
    return new PlebbitTippingV1Instance(rpcUrls, cache, contractAddress);
}
