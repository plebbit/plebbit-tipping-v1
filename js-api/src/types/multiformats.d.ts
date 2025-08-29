declare module 'multiformats/cid' {
  export class CID {
    constructor(version: number, codec: number, hash: Uint8Array, bytes?: Uint8Array);
    static fromBytes(bytes: Uint8Array): CID;
    static fromString(str: string): CID;
    static parse(str: string): CID;
    toString(): string;
    toBytes(): Uint8Array;
    code: number;
    version: number;
    hash: Uint8Array;
    multihash: { bytes: Uint8Array };
  }
}

declare module 'multiformats/hashes/digest' {
  export function decode(bytes: Uint8Array): { code: number; digest: Uint8Array };
  export function encode(code: number, digest: Uint8Array): Uint8Array;
}
