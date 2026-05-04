import { ApiPromise, WsProvider } from "@polkadot/api";
import type { SubmittableExtrinsic } from "@polkadot/api-base/types";
import { Keyring } from "@polkadot/keyring";
import type { KeyringPair } from "@polkadot/keyring/types";
import type { ISubmittableResult } from "@polkadot/types/types";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { z } from "zod";
import { logger } from "../logger.js";
import type { ExternalSigner } from "../signers/types.js";
import type { PeaqNetworkConfig } from "./networks.js";
import { retryWithBackoff } from "./retry.js";

export interface SubstrateClientConfig {
  network: PeaqNetworkConfig;
  wssUrl?: string;
  signerMnemonic?: string;
  externalSigner?: ExternalSigner;
  retryMaxAttempts?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

export interface ExtrinsicReceipt {
  txHash: string;
  blockHash: string;
  blockNumber: number;
  events: Array<{ section: string; method: string; data: unknown }>;
  durationMs: number;
}

const mnemonicSchema = z
  .string()
  .min(12)
  .refine((s) => s.split(/\s+/).length >= 12, "Mnemonic must be 12+ words");

export class SubstrateClient {
  private api: ApiPromise | null = null;
  private signer: KeyringPair | null = null;
  private readonly external: ExternalSigner | null;
  private readonly cfg: Omit<Required<SubstrateClientConfig>, "externalSigner">;

  constructor(cfg: SubstrateClientConfig) {
    this.cfg = {
      network: cfg.network,
      wssUrl: cfg.wssUrl ?? cfg.network.endpoints.wssRpc[0]!,
      signerMnemonic: cfg.signerMnemonic ?? "",
      retryMaxAttempts: cfg.retryMaxAttempts ?? 5,
      retryBaseMs: cfg.retryBaseMs ?? 500,
      retryMaxMs: cfg.retryMaxMs ?? 30_000,
    };
    this.external = cfg.externalSigner ?? null;
  }

  async connect(): Promise<void> {
    if (this.api) return;
    await cryptoWaitReady();

    const provider = new WsProvider(this.cfg.wssUrl);
    this.api = await ApiPromise.create({
      provider: provider as never,
      throwOnConnect: true,
    });
    await this.api.isReady;

    if (this.external) {
      logger.info(
        {
          event: "peaq.substrate.externalSignerLoaded",
          address: this.external.address,
          cryptoType: this.external.cryptoType,
        },
        "Substrate external signer loaded (HSM/KMS path)",
      );
    } else if (this.cfg.signerMnemonic) {
      mnemonicSchema.parse(this.cfg.signerMnemonic);
      const keyring = new Keyring({ type: "sr25519", ss58Format: this.cfg.network.ss58Prefix });
      this.signer = keyring.addFromMnemonic(this.cfg.signerMnemonic);
      logger.info(
        { event: "peaq.substrate.signerLoaded", address: this.signer.address },
        "Substrate signer loaded (mnemonic)",
      );
    }

    logger.info(
      {
        event: "peaq.substrate.connected",
        network: this.cfg.network.name,
        chainName: (await this.api.rpc.system.chain()).toString(),
        nodeName: (await this.api.rpc.system.name()).toString(),
        nodeVersion: (await this.api.rpc.system.version()).toString(),
      },
      "Substrate connected",
    );
  }

  async disconnect(): Promise<void> {
    if (!this.api) return;
    await this.api.disconnect();
    this.api = null;
    this.signer = null;
  }

  getApi(): ApiPromise {
    if (!this.api) throw new Error("Substrate client not connected");
    return this.api;
  }

  getSigner(): KeyringPair {
    if (!this.signer) throw new Error("Substrate signer not loaded (set signerMnemonic or externalSigner)");
    return this.signer;
  }

  signerAddress(): string | null {
    return this.external?.address ?? this.signer?.address ?? null;
  }

  hasSigner(): boolean {
    return this.signer !== null || this.external !== null;
  }

  async health(): Promise<{ ok: boolean; chain?: string; finalized?: number; reason?: string }> {
    if (!this.api) return { ok: false, reason: "not-connected" };
    try {
      const [chain, header] = await Promise.all([
        this.api.rpc.system.chain(),
        this.api.rpc.chain.getFinalizedHead().then((h) => this.api!.rpc.chain.getHeader(h)),
      ]);
      return { ok: true, chain: chain.toString(), finalized: header.number.toNumber() };
    } catch (err) {
      return { ok: false, reason: (err as Error).message };
    }
  }

  async submitExtrinsic(
    extrinsic: SubmittableExtrinsic<"promise", ISubmittableResult>,
  ): Promise<ExtrinsicReceipt> {
    if (!this.hasSigner()) {
      throw new Error("Substrate signer not loaded (set signerMnemonic or externalSigner)");
    }
    const start = Date.now();
    const externalSigner = this.external;
    const localPair = this.signer;
    const signWith: Parameters<typeof extrinsic.signAndSend>[0] = externalSigner
      ? externalSigner.address
      : localPair!;
    const signOpts = externalSigner
      ? { signer: externalSigner.asPolkadotSigner() as never, nonce: -1 as const }
      : { nonce: -1 as const };
    const outcome = await retryWithBackoff(
      () =>
        new Promise<ExtrinsicReceipt>((resolve, reject) => {
          let unsub: (() => void) | null = null;
          extrinsic
            .signAndSend(signWith, signOpts, (result) => {
              if (result.dispatchError) {
                const decoded = this.decodeDispatchError(result.dispatchError);
                if (unsub) unsub();
                reject(new Error(`Dispatch error: ${decoded}`));
                return;
              }
              if (result.status.isInBlock || result.status.isFinalized) {
                const blockHash = result.status.isFinalized
                  ? result.status.asFinalized.toHex()
                  : result.status.asInBlock.toHex();
                const events = result.events.map((record) => ({
                  section: record.event.section,
                  method: record.event.method,
                  data: record.event.data.toHuman(),
                }));
                if (unsub) unsub();
                this.api!.rpc.chain
                  .getHeader(blockHash)
                  .then((header) => {
                    resolve({
                      txHash: extrinsic.hash.toHex(),
                      blockHash,
                      blockNumber: header.number.toNumber(),
                      events,
                      durationMs: Date.now() - start,
                    });
                  })
                  .catch(reject);
              }
            })
            .then((u) => {
              unsub = u;
            })
            .catch(reject);
        }),
      {
        maxAttempts: this.cfg.retryMaxAttempts,
        baseMs: this.cfg.retryBaseMs,
        maxMs: this.cfg.retryMaxMs,
      },
    );

    if (!outcome.ok) {
      throw new Error(
        `Extrinsic failed after ${outcome.attempts} attempts: ${(outcome.error as Error).message}`,
      );
    }
    return outcome.value;
  }

  private decodeDispatchError(error: unknown): string {
    const err = error as { isModule?: boolean; asModule?: unknown; toString: () => string };
    if (err.isModule && this.api) {
      try {
        const mod = this.api.registry.findMetaError(err.asModule as never);
        return `${mod.section}.${mod.name}: ${mod.docs.join(" ").trim()}`;
      } catch {
        return err.toString();
      }
    }
    return err.toString();
  }
}
