export interface TipOptions {
  feeRecipients: string[];
  recipientCommentCid: string;
  senderCommentCid?: string;
  sender?: string;
  tipAmount?: bigint; // Custom tip amount in wei, if not provided uses 2x minimum
}

export interface PlebbitTippingV1Options {
  rpcUrls: string[];
  cache?: {
    maxAge: number;
  };
  privateKey?: string;
}

export interface TransactionResult {
  transactionHash?: string;
  receipt?: any;
  error?: Error;
}

export interface TipTransaction {
  transactionHash?: string;
  receipt?: any;
  error?: Error;
  send(): Promise<TransactionResult>;
}
