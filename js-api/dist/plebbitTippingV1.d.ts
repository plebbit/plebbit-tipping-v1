declare class PlebbitTippingV1Instance {
    private contract;
    private commentsCache;
    private senderCommentsCache;
    private rpcUrls;
    private cache;
    private defaultFeeRecipient;
    constructor(rpcUrls: string[], cache: {
        maxAge: number;
    }, contractAddress: string);
    createTip({ feeRecipients, recipientCommentCid, senderCommentCid, sender }: {
        feeRecipients: string[];
        recipientCommentCid: string;
        senderCommentCid?: string;
        sender?: string;
    }): Promise<{
        send(): Promise<{
            transactionHash: any;
            receipt: any;
            error: undefined;
        }>;
    }>;
    createComment({ feeRecipients, recipientCommentCid }: {
        feeRecipients: string[];
        recipientCommentCid: string;
    }): Promise<{
        tipsTotalAmount: any;
        updateTipsTotalAmount(): Promise<void>;
    }>;
    createSenderComment({ feeRecipients, recipientCommentCid, senderCommentCid, sender }: {
        feeRecipients: string[];
        recipientCommentCid: string;
        senderCommentCid?: string;
        sender: string;
    }): Promise<{
        tipsTotalAmount: any;
        updateTipsTotalAmount(): Promise<void>;
    }>;
    private getTipsTotalAmount;
    getFeePercent(): Promise<any>;
    getMinimumTipAmount(): Promise<any>;
}
export declare function PlebbitTippingV1({ rpcUrls, cache }: {
    rpcUrls: string[];
    cache: {
        maxAge: number;
    };
}): Promise<PlebbitTippingV1Instance>;
export {};
