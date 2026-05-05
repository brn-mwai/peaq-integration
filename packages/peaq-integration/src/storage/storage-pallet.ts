import { hexToU8a, stringToU8a } from "@polkadot/util";
import { z } from "zod";
import { logger } from "../logger.js";
import type { SubstrateClient } from "../chain/substrate-client.js";

export interface StorageClientConfig {
  substrate: SubstrateClient;
}

export interface StorageReceipt {
  txHash: string;
  blockHash: string;
  blockNumber: number;
  itemType: string;
  durationMs: number;
}

// Per https://docs.peaq.xyz/peaqchain/build/advanced-operations/precompiles/storage:
// peaqStorage layout is `64-byte key : 256-byte value`. Caller-side validation
// stops obviously oversized inputs before they hit the runtime.
export const PEAQ_STORAGE_KEY_MAX_BYTES = 64;
export const PEAQ_STORAGE_VALUE_MAX_BYTES = 256;

const itemTypeSchema = z
  .string()
  .min(1)
  .refine((s) => new TextEncoder().encode(s).length <= PEAQ_STORAGE_KEY_MAX_BYTES, {
    message: `itemType must be <= ${PEAQ_STORAGE_KEY_MAX_BYTES} UTF-8 bytes`,
  });
const itemPayloadSchema = z
  .union([z.string(), z.instanceof(Uint8Array)])
  .refine(
    (v) => {
      const bytes = v instanceof Uint8Array ? v.length : new TextEncoder().encode(v).length;
      return bytes <= PEAQ_STORAGE_VALUE_MAX_BYTES;
    },
    {message: `payload must be <= ${PEAQ_STORAGE_VALUE_MAX_BYTES} bytes`},
  );

export class PeaqStorageClient {
  constructor(private readonly cfg: StorageClientConfig) {}

  async addItem(itemType: string, payload: string | Uint8Array): Promise<StorageReceipt> {
    const validatedType = itemTypeSchema.parse(itemType);
    const payloadBytes = itemPayloadSchema
      .transform((v) => (v instanceof Uint8Array ? v : stringToU8a(v)))
      .parse(payload);

    const api = this.cfg.substrate.getApi();
    if (!api.tx.peaqStorage?.addItem) {
      throw new Error("peaqStorage.addItem extrinsic not found on connected node");
    }
    const tx = api.tx.peaqStorage.addItem(stringToU8a(validatedType), payloadBytes);

    logger.info(
      { event: "peaq.storage.addItem.submitting", itemType: validatedType, bytes: payloadBytes.length },
      "Submitting peaqStorage.addItem",
    );

    const receipt = await this.cfg.substrate.submitExtrinsic(tx);
    return {
      txHash: receipt.txHash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      itemType: validatedType,
      durationMs: receipt.durationMs,
    };
  }

  async updateItem(itemType: string, payload: string | Uint8Array): Promise<StorageReceipt> {
    const validatedType = itemTypeSchema.parse(itemType);
    const payloadBytes = itemPayloadSchema
      .transform((v) => (v instanceof Uint8Array ? v : stringToU8a(v)))
      .parse(payload);

    const api = this.cfg.substrate.getApi();
    if (!api.tx.peaqStorage?.updateItem) {
      throw new Error("peaqStorage.updateItem extrinsic not found on connected node");
    }
    const tx = api.tx.peaqStorage.updateItem(stringToU8a(validatedType), payloadBytes);
    const receipt = await this.cfg.substrate.submitExtrinsic(tx);
    return {
      txHash: receipt.txHash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      itemType: validatedType,
      durationMs: receipt.durationMs,
    };
  }

  async getItem(owner: string, itemType: string): Promise<{ value: string | null }> {
    const validatedType = itemTypeSchema.parse(itemType);
    const api = this.cfg.substrate.getApi();
    if (!api.query.peaqStorage?.itemStore) {
      throw new Error("peaqStorage.itemStore not found on connected node");
    }
    const ownerBytes = owner.startsWith("0x") ? hexToU8a(owner) : owner;
    const result = await api.query.peaqStorage.itemStore(ownerBytes, stringToU8a(validatedType));
    if ((result as unknown as { isNone?: boolean }).isNone) return { value: null };
    const unwrapped = (result as unknown as { unwrap: () => { toHex: () => string } }).unwrap();
    return { value: unwrapped.toHex() };
  }
}
