import type { Hash } from "viem";
import { z } from "zod";
import type { EvmClient } from "../chain/evm-client.js";
import type { MerkleProof } from "./merkle.js";
import { sha256Hex, verifyMerkleProof } from "./merkle.js";

export interface OfflineVerificationInput {
  leafPayload: string | Uint8Array;
  proof: MerkleProof;
}

export type OfflineVerificationResult =
  | { valid: true; computedLeafHash: string; rootHex: string }
  | { valid: false; reason: string; computedLeafHash: string };

export function verifyOffline(input: OfflineVerificationInput): OfflineVerificationResult {
  const computed = sha256Hex(input.leafPayload);
  if (computed !== input.proof.leafHash) {
    return { valid: false, reason: "Leaf hash mismatch", computedLeafHash: computed };
  }
  if (!verifyMerkleProof(input.proof)) {
    return { valid: false, reason: "Merkle proof invalid", computedLeafHash: computed };
  }
  return { valid: true, computedLeafHash: computed, rootHex: input.proof.root };
}

export interface OnChainVerificationInput {
  evm: EvmClient;
  txHash: Hash;
  expectedRootHexNo0x: string;
}

export type OnChainVerificationResult =
  | { valid: true; blockNumber: bigint; status: "success" }
  | { valid: false; reason: string; blockNumber?: bigint };

const rootSchema = z.string().regex(/^[0-9a-f]{64}$/, "Expected 64-hex Merkle root");

export async function verifyOnChain(
  input: OnChainVerificationInput,
): Promise<OnChainVerificationResult> {
  const expectedRoot = rootSchema.parse(input.expectedRootHexNo0x).toLowerCase();
  const receipt = await input.evm.getReceipt(input.txHash);
  if (!receipt) return { valid: false, reason: "Transaction not found" };
  if (receipt.status !== "success") {
    return { valid: false, reason: `Transaction reverted`, blockNumber: receipt.blockNumber };
  }
  const calldata = receipt.inputData.startsWith("0x") ? receipt.inputData.slice(2) : receipt.inputData;
  if (calldata.toLowerCase() !== expectedRoot) {
    return {
      valid: false,
      reason: `Calldata != expected root (got ${calldata.slice(0, 16)}…)`,
      blockNumber: receipt.blockNumber,
    };
  }
  return { valid: true, blockNumber: receipt.blockNumber, status: "success" };
}
