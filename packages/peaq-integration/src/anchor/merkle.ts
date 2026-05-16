import { createHash } from "node:crypto";

export function sha256Hex(data: string | Buffer | Uint8Array): string {
  const h = createHash("sha256");
  h.update(typeof data === "string" ? Buffer.from(data, "utf8") : data);
  return h.digest("hex");
}

export const GENESIS_HASH = "0".repeat(64);

// Domain-separation tag for interior nodes. Leaves are externally-computed payload
// hashes (raw sha256); interior nodes are sha256(NODE_PREFIX || left || right). The
// prefix means an interior node value can never be re-presented as a leaf without
// finding a sha256 preimage — closes the classic Merkle second-preimage attack.
const NODE_PREFIX = "01";

function hashNode(left: string, right: string): string {
  return sha256Hex(NODE_PREFIX + left + right);
}

export interface MerkleTree {
  root: string;
  leafHashes: string[];
  levels: string[][];
}

export function buildMerkleTree(leafHashes: string[]): MerkleTree {
  if (leafHashes.length === 0) {
    throw new Error("Cannot build Merkle tree from empty leaves");
  }
  for (const leaf of leafHashes) {
    if (!/^[0-9a-f]{64}$/.test(leaf)) {
      throw new Error(`Invalid leaf hash (expected 64-hex): ${leaf}`);
    }
  }

  const levels: string[][] = [leafHashes.slice()];
  let current = leafHashes.slice();
  while (current.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = current[i + 1] ?? left;
      next.push(hashNode(left, right));
    }
    levels.push(next);
    current = next;
  }
  return { root: current[0]!, leafHashes, levels };
}

export interface MerkleProof {
  leafHash: string;
  leafIndex: number;
  siblings: Array<{ hash: string; side: "left" | "right" }>;
  root: string;
}

export function buildMerkleProof(tree: MerkleTree, leafIndex: number): MerkleProof {
  if (leafIndex < 0 || leafIndex >= tree.leafHashes.length) {
    throw new Error(`leafIndex ${leafIndex} out of range`);
  }
  const siblings: MerkleProof["siblings"] = [];
  let index = leafIndex;
  for (let level = 0; level < tree.levels.length - 1; level++) {
    const nodes = tree.levels[level]!;
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    const sibling = nodes[siblingIndex] ?? nodes[index]!;
    siblings.push({ hash: sibling, side: isRight ? "left" : "right" });
    index = Math.floor(index / 2);
  }
  return {
    leafHash: tree.leafHashes[leafIndex]!,
    leafIndex,
    siblings,
    root: tree.root,
  };
}

export function verifyMerkleProof(proof: MerkleProof): boolean {
  let acc = proof.leafHash;
  for (const { hash, side } of proof.siblings) {
    acc = side === "left" ? hashNode(hash, acc) : hashNode(acc, hash);
  }
  return acc === proof.root;
}

export function chainHash(previousHash: string, payloadHash: string): string {
  return sha256Hex(previousHash + payloadHash);
}
