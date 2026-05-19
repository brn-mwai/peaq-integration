import type { Hash, Hex } from "viem";
import { z } from "zod";
import type { EvmClient } from "../chain/evm-client.js";
import type { SubstrateClient } from "../chain/substrate-client.js";
import { type IdempotencyCache, makeAnchorIdempotencyKey } from "../idempotency.js";
import { logger } from "../logger.js";
import { buildMerkleTree } from "./merkle.js";

/** peaqStorage.addItem caps item_type at 64 bytes (docs.peaq.xyz, checked 2026-05-16). */
export const PEAQ_STORAGE_ITEM_TYPE_MAX_BYTES = 64;

export interface AnchorRequest {
  workspaceId: string;
  /** ISO hour bucket `YYYY-MM-DDTHH` — the trust layer anchors a Merkle root hourly. */
  anchorHour: string;
  leafHashes: string[];
}

export interface EvmAnchorReceipt {
  txHash: Hash;
  rootHex: string;
  toAddress: `0x${string}`;
  attempts: number;
  durationMs: number;
}

export interface SubstrateAnchorReceipt {
  txHash: string;
  blockHash: string;
  blockNumber: number;
  rootHex: string;
  itemType: string;
  durationMs: number;
}

const anchorRequestSchema = z.object({
  // Capped at 32 so the composed Substrate itemType stays inside the 64-byte
  // peaqStorage limit (prefix + "." + workspaceId + "." + yyyy-mm-ddTHH <= 57 bytes).
  workspaceId: z.string().min(1).max(32),
  // Hourly anchor bucket: yyyy-mm-ddTHH (e.g. "2026-05-19T14"). Hour precision —
  // the trust layer commits one Merkle root per hour, not per day.
  anchorHour: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}$/),
  leafHashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1),
});

type ParsedAnchorRequest = z.infer<typeof anchorRequestSchema>;

export interface AnchorServiceConfig {
  evm?: EvmClient;
  substrate?: SubstrateClient;
  evmToAddress?: `0x${string}`;
  substrateItemPrefix?: string;
  /**
   * Optional idempotency caches. When supplied, a re-fired anchor for the same
   * (workspaceId, anchorHour) returns the cached receipt instead of submitting
   * a second transaction. Strongly recommended for cron-driven callers — a
   * retried or double-fired run otherwise lands a duplicate anchor.
   */
  idempotency?: {
    evm?: IdempotencyCache<EvmAnchorReceipt>;
    substrate?: IdempotencyCache<SubstrateAnchorReceipt>;
  };
}

export class PeaqAnchorService {
  constructor(private readonly cfg: AnchorServiceConfig) {}

  async submitViaEvm(request: AnchorRequest): Promise<EvmAnchorReceipt> {
    if (!this.cfg.evm) throw new Error("EVM client not configured");
    const parsed = anchorRequestSchema.parse(request);
    const run = (): Promise<EvmAnchorReceipt> => this.doSubmitViaEvm(parsed);

    const cache = this.cfg.idempotency?.evm;
    if (!cache) return run();
    const key = `${makeAnchorIdempotencyKey(parsed.workspaceId, parsed.anchorHour)}.evm`;
    const { receipt } = await cache.getOrCompute(key, run);
    return receipt;
  }

  async submitViaSubstrate(request: AnchorRequest): Promise<SubstrateAnchorReceipt> {
    if (!this.cfg.substrate) throw new Error("Substrate client not configured");
    const parsed = anchorRequestSchema.parse(request);
    const run = (): Promise<SubstrateAnchorReceipt> => this.doSubmitViaSubstrate(parsed);

    const cache = this.cfg.idempotency?.substrate;
    if (!cache) return run();
    const key = `${makeAnchorIdempotencyKey(parsed.workspaceId, parsed.anchorHour)}.substrate`;
    const { receipt } = await cache.getOrCompute(key, run);
    return receipt;
  }

  private async doSubmitViaEvm(parsed: ParsedAnchorRequest): Promise<EvmAnchorReceipt> {
    const evm = this.cfg.evm!;
    const tree = buildMerkleTree(parsed.leafHashes);
    const data = `0x${tree.root}` as Hex;
    const to = (this.cfg.evmToAddress ??
      "0x000000000000000000000000000000000000dEaD") as `0x${string}`;

    logger.info(
      {
        event: "peaq.anchor.evm.submitting",
        workspaceId: parsed.workspaceId,
        anchorHour: parsed.anchorHour,
        leafCount: parsed.leafHashes.length,
        root: tree.root,
        to,
      },
      "Submitting Merkle anchor via EVM",
    );

    const txResult = await evm.sendCalldata({ to, data });
    return {
      txHash: txResult.txHash,
      rootHex: tree.root,
      toAddress: to,
      attempts: txResult.attempts,
      durationMs: txResult.durationMs,
    };
  }

  private async doSubmitViaSubstrate(parsed: ParsedAnchorRequest): Promise<SubstrateAnchorReceipt> {
    const substrate = this.cfg.substrate!;
    const tree = buildMerkleTree(parsed.leafHashes);
    const itemType = `${this.cfg.substrateItemPrefix ?? "axi.anchor"}.${parsed.workspaceId}.${parsed.anchorHour}`;

    const itemTypeBytes = Buffer.byteLength(itemType, "utf8");
    if (itemTypeBytes > PEAQ_STORAGE_ITEM_TYPE_MAX_BYTES) {
      throw new Error(
        `Substrate anchor itemType is ${itemTypeBytes} bytes; peaqStorage.addItem caps ` +
          `item_type at ${PEAQ_STORAGE_ITEM_TYPE_MAX_BYTES} bytes. Shorten substrateItemPrefix or workspaceId.`,
      );
    }

    const api = substrate.getApi();
    if (!api.tx.peaqStorage?.addItem) {
      throw new Error("peaqStorage.addItem not found on connected node");
    }

    const tx = api.tx.peaqStorage.addItem(stringToBytes(itemType), hexToBytes(tree.root));
    logger.info(
      {
        event: "peaq.anchor.substrate.submitting",
        workspaceId: parsed.workspaceId,
        anchorHour: parsed.anchorHour,
        leafCount: parsed.leafHashes.length,
        itemType,
        root: tree.root,
      },
      "Submitting Merkle anchor via Substrate peaqStorage.addItem",
    );

    const receipt = await substrate.submitExtrinsic(tx);
    return {
      txHash: receipt.txHash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      rootHex: tree.root,
      itemType,
      durationMs: receipt.durationMs,
    };
  }
}

function stringToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
