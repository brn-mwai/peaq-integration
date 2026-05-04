import { z } from "zod";
import type { Hash, Hex } from "viem";
import { logger } from "../logger.js";
import type { EvmClient } from "../chain/evm-client.js";
import type { SubstrateClient } from "../chain/substrate-client.js";
import { buildMerkleTree } from "./merkle.js";

export interface AnchorRequest {
  workspaceId: string;
  anchorDate: string;
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
  workspaceId: z.string().min(1).max(64),
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leafHashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)).min(1),
});

export interface AnchorServiceConfig {
  evm?: EvmClient;
  substrate?: SubstrateClient;
  evmToAddress?: `0x${string}`;
  substrateItemPrefix?: string;
}

export class PeaqAnchorService {
  constructor(private readonly cfg: AnchorServiceConfig) {}

  async submitViaEvm(request: AnchorRequest): Promise<EvmAnchorReceipt> {
    if (!this.cfg.evm) throw new Error("EVM client not configured");
    const parsed = anchorRequestSchema.parse(request);
    const tree = buildMerkleTree(parsed.leafHashes);
    const data = `0x${tree.root}` as Hex;
    const to = (this.cfg.evmToAddress ?? "0x000000000000000000000000000000000000dEaD") as `0x${string}`;

    logger.info(
      {
        event: "peaq.anchor.evm.submitting",
        workspaceId: parsed.workspaceId,
        anchorDate: parsed.anchorDate,
        leafCount: parsed.leafHashes.length,
        root: tree.root,
        to,
      },
      "Submitting Merkle anchor via EVM",
    );

    const txResult = await this.cfg.evm.sendCalldata({ to, data });
    return {
      txHash: txResult.txHash,
      rootHex: tree.root,
      toAddress: to,
      attempts: txResult.attempts,
      durationMs: txResult.durationMs,
    };
  }

  async submitViaSubstrate(request: AnchorRequest): Promise<SubstrateAnchorReceipt> {
    if (!this.cfg.substrate) throw new Error("Substrate client not configured");
    const parsed = anchorRequestSchema.parse(request);
    const tree = buildMerkleTree(parsed.leafHashes);
    const itemType = `${this.cfg.substrateItemPrefix ?? "axi.anchor"}.${parsed.workspaceId}.${parsed.anchorDate}`;

    const api = this.cfg.substrate.getApi();
    if (!api.tx.peaqStorage?.addItem) {
      throw new Error("peaqStorage.addItem not found on connected node");
    }

    const tx = api.tx.peaqStorage.addItem(stringToBytes(itemType), hexToBytes(tree.root));
    logger.info(
      {
        event: "peaq.anchor.substrate.submitting",
        workspaceId: parsed.workspaceId,
        anchorDate: parsed.anchorDate,
        leafCount: parsed.leafHashes.length,
        itemType,
        root: tree.root,
      },
      "Submitting Merkle anchor via Substrate peaqStorage.addItem",
    );

    const receipt = await this.cfg.substrate.submitExtrinsic(tx);
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
