export interface TipOptions {
  feeRecipients: string[];
  recipientCommentCid: string;
  senderCommentCid?: string;
  sender?: string;
}

export interface PlebbitTippingV1Options {
  rpcUrls: string[];
  cache?: {
    maxAge: number;
  };
  privateKey?: string;
}
