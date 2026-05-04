// Signer interface decoupling key custody from extrinsic submission.
// SubstrateClient accepts either a Mnemonic (in-process keyring) OR an
// ExternalSigner (HSM, KMS, Ledger). The ExternalSigner shape matches what
// @polkadot/api signAndSend expects via { signer: SignerInterface } so we
// can plug straight into the existing extrinsic path.

export type CryptoType = "sr25519" | "ed25519" | "ecdsa";

export interface SignedRaw {
  signature: `0x${string}`;
}

export interface PolkadotSignerPayloadRaw {
  data: `0x${string}` | string;
  type: "bytes" | "payload";
}

export interface PolkadotSignerLike {
  signRaw(payload: PolkadotSignerPayloadRaw): Promise<{ id: number; signature: `0x${string}` }>;
}

export interface ExternalSigner {
  cryptoType: CryptoType;
  address: string;
  publicKeyHex: `0x${string}`;
  asPolkadotSigner(): PolkadotSignerLike;
}
