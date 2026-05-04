import { Keyring } from "@polkadot/keyring";
import type { KeyringPair } from "@polkadot/keyring/types";
import { u8aToHex } from "@polkadot/util";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { z } from "zod";
import type { CryptoType, ExternalSigner, PolkadotSignerLike, PolkadotSignerPayloadRaw } from "./types.js";

// In-process mnemonic-backed signer. Used by SubstrateClient when callers
// pass `signerMnemonic` directly. Wrapped behind ExternalSigner so the
// extrinsic submission code path is identical regardless of custody.

const mnemonicSchema = z
  .string()
  .min(12)
  .refine((s) => s.split(/\s+/).length >= 12, "Mnemonic must be 12+ words");

export interface MnemonicSignerConfig {
  mnemonic: string;
  cryptoType?: CryptoType;
  ss58Prefix?: number;
}

export class MnemonicSigner implements ExternalSigner {
  readonly cryptoType: CryptoType;
  readonly address: string;
  readonly publicKeyHex: `0x${string}`;
  private readonly pair: KeyringPair;

  private constructor(pair: KeyringPair, cryptoType: CryptoType) {
    this.pair = pair;
    this.cryptoType = cryptoType;
    this.address = pair.address;
    this.publicKeyHex = u8aToHex(pair.publicKey) as `0x${string}`;
  }

  static async create(cfg: MnemonicSignerConfig): Promise<MnemonicSigner> {
    mnemonicSchema.parse(cfg.mnemonic);
    await cryptoWaitReady();
    const cryptoType = cfg.cryptoType ?? "sr25519";
    const keyring = new Keyring({ type: cryptoType, ...(cfg.ss58Prefix !== undefined ? { ss58Format: cfg.ss58Prefix } : {}) });
    const pair = keyring.addFromMnemonic(cfg.mnemonic);
    return new MnemonicSigner(pair, cryptoType);
  }

  asPolkadotSigner(): PolkadotSignerLike {
    return {
      signRaw: async (payload: PolkadotSignerPayloadRaw) => {
        const data = typeof payload.data === "string" ? payload.data : payload.data;
        const bytes = data.startsWith("0x")
          ? hexToBytes(data)
          : new TextEncoder().encode(data);
        const signature = u8aToHex(this.pair.sign(bytes)) as `0x${string}`;
        return { id: 0, signature };
      },
    };
  }

  rawPair(): KeyringPair {
    return this.pair;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
