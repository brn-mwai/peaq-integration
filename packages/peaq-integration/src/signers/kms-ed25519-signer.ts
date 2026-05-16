import { Keyring } from "@polkadot/keyring";
import { hexToU8a, u8aToHex } from "@polkadot/util";
import { cryptoWaitReady, encodeAddress } from "@polkadot/util-crypto";
import { z } from "zod";
import type { ExternalSigner, PolkadotSignerLike, PolkadotSignerPayloadRaw } from "./types.js";

// KMS-direct Ed25519 signer. Private key never leaves AWS KMS; this signer
// fetches the public key once at boot, derives the SS58 address, then routes
// every extrinsic signature through KMS.Sign. The private key material is
// never imported into Node memory.
//
// peaq accepts Ed25519 verification keys (see Ed25519VerificationKey2020 in
// the PeaqDidDocument schema). For sr25519-only use cases, deploy a Polkadot
// Vault or Ledger; AWS KMS does not currently support sr25519.
//
// Dependency strategy: @aws-sdk/client-kms is intentionally NOT a hard dep
// because operators using mnemonic-only or hardware-vault signers should not
// pay the ~2MB SDK cost. Loaded via dynamic import; throw a clear error if
// missing.

export const kmsEd25519ConfigSchema = z.object({
  keyId: z.string().min(1),
  region: z.string().min(2).max(64),
  ss58Prefix: z.number().int().nonnegative().max(16384).default(42),
});

export type KmsEd25519Config = z.infer<typeof kmsEd25519ConfigSchema>;

interface KmsClientLike {
  send(cmd: unknown): Promise<{ PublicKey?: Uint8Array; Signature?: Uint8Array }>;
}

interface AwsKmsModule {
  KMSClient: new (cfg: { region: string }) => KmsClientLike;
  GetPublicKeyCommand: new (input: { KeyId: string }) => unknown;
  SignCommand: new (input: {
    KeyId: string;
    Message: Uint8Array;
    MessageType: "RAW";
    SigningAlgorithm: "EDDSA";
  }) => unknown;
}

async function loadAwsKms(): Promise<AwsKmsModule> {
  try {
    // @aws-sdk/client-kms is an optional peer dep loaded at runtime only when
    // operators use the KmsEd25519Signer path. The typecheck path doesn't need
    // it. The runtime path errors clearly if it's not installed.
    // @ts-expect-error optional peer dep, resolved at runtime only
    const mod = (await import("@aws-sdk/client-kms")) as unknown as AwsKmsModule;
    if (!mod.KMSClient || !mod.SignCommand || !mod.GetPublicKeyCommand) {
      throw new Error("@aws-sdk/client-kms loaded but expected exports missing");
    }
    return mod;
  } catch (err) {
    throw new Error(
      `KmsEd25519Signer requires @aws-sdk/client-kms as a peer dependency. Install with: pnpm add @aws-sdk/client-kms. Underlying error: ${(err as Error).message}`,
    );
  }
}

// SubjectPublicKeyInfo (DER) → raw Ed25519 32-byte public key.
// AWS KMS GetPublicKey returns SPKI; we strip the OID prefix to get the raw key.
function spkiToEd25519Raw(spki: Uint8Array): Uint8Array {
  const ED25519_SPKI_PREFIX = new Uint8Array([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);
  if (spki.length !== ED25519_SPKI_PREFIX.length + 32) {
    throw new Error(
      `Unexpected SPKI length: ${spki.length}, expected ${ED25519_SPKI_PREFIX.length + 32}`,
    );
  }
  for (let i = 0; i < ED25519_SPKI_PREFIX.length; i++) {
    if (spki[i] !== ED25519_SPKI_PREFIX[i]) {
      throw new Error("SPKI prefix mismatch — not an Ed25519 key");
    }
  }
  return spki.slice(ED25519_SPKI_PREFIX.length);
}

export class KmsEd25519Signer implements ExternalSigner {
  readonly cryptoType = "ed25519" as const;
  readonly address: string;
  readonly publicKeyHex: `0x${string}`;
  private readonly cfg: KmsEd25519Config;
  private readonly kms: KmsClientLike;
  private readonly aws: AwsKmsModule;

  private constructor(
    cfg: KmsEd25519Config,
    kms: KmsClientLike,
    aws: AwsKmsModule,
    publicKeyRaw: Uint8Array,
  ) {
    this.cfg = cfg;
    this.kms = kms;
    this.aws = aws;
    this.publicKeyHex = u8aToHex(publicKeyRaw) as `0x${string}`;
    this.address = encodeAddress(publicKeyRaw, cfg.ss58Prefix);
  }

  static async create(cfg: KmsEd25519Config): Promise<KmsEd25519Signer> {
    const parsed = kmsEd25519ConfigSchema.parse(cfg);
    const aws = await loadAwsKms();
    await cryptoWaitReady();

    const kms = new aws.KMSClient({ region: parsed.region });
    const pubResp = await kms.send(new aws.GetPublicKeyCommand({ KeyId: parsed.keyId }));
    if (!pubResp.PublicKey) {
      throw new Error(`AWS KMS GetPublicKey returned no PublicKey for ${parsed.keyId}`);
    }
    const raw = spkiToEd25519Raw(pubResp.PublicKey);
    return new KmsEd25519Signer(parsed, kms, aws, raw);
  }

  asPolkadotSigner(): PolkadotSignerLike {
    return {
      signRaw: async (payload: PolkadotSignerPayloadRaw) => {
        const data = typeof payload.data === "string" ? payload.data : payload.data;
        const message = data.startsWith("0x") ? hexToU8a(data) : new TextEncoder().encode(data);
        const out = await this.kms.send(
          new this.aws.SignCommand({
            KeyId: this.cfg.keyId,
            Message: message,
            MessageType: "RAW",
            SigningAlgorithm: "EDDSA",
          }),
        );
        if (!out.Signature) {
          throw new Error(`AWS KMS Sign returned no Signature for keyId ${this.cfg.keyId}`);
        }
        const sig = u8aToHex(out.Signature) as `0x${string}`;
        return { id: 0, signature: sig };
      },
    };
  }

  static derivePeaqAddress(publicKeyHex: `0x${string}`, ss58Prefix = 42): string {
    void Keyring;
    return encodeAddress(hexToU8a(publicKeyHex), ss58Prefix);
  }
}
