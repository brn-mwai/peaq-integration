import { describe, expect, it } from "vitest";
import {
  GENESIS_HASH,
  buildMerkleProof,
  buildMerkleTree,
  chainHash,
  sha256Hex,
  verifyMerkleProof,
} from "../src/anchor/merkle.js";
import { verifyOffline } from "../src/anchor/verifier.js";

describe("merkle", () => {
  it("rejects empty leaves", () => {
    expect(() => buildMerkleTree([])).toThrow(/empty/);
  });

  it("rejects malformed leaf hashes", () => {
    expect(() => buildMerkleTree(["not-a-hash"])).toThrow(/Invalid leaf/);
  });

  it("single leaf root equals leaf", () => {
    const leaf = sha256Hex("a");
    const tree = buildMerkleTree([leaf]);
    expect(tree.root).toBe(leaf);
  });

  // interior nodes are domain-separated: sha256("01" || left || right)
  const node = (l: string, r: string) => sha256Hex(`01${l}${r}`);

  it("two-leaf root is sha256(0x01 || a || b)", () => {
    const a = sha256Hex("a");
    const b = sha256Hex("b");
    const tree = buildMerkleTree([a, b]);
    expect(tree.root).toBe(node(a, b));
  });

  it("odd-leaf count duplicates the last leaf (Bitcoin-style)", () => {
    const a = sha256Hex("a");
    const b = sha256Hex("b");
    const c = sha256Hex("c");
    const tree = buildMerkleTree([a, b, c]);
    expect(tree.root).toBe(node(node(a, b), node(c, c)));
  });

  it("buildMerkleProof + verifyMerkleProof round-trip for every leaf", () => {
    const leaves = ["a", "b", "c", "d", "e", "f", "g"].map(sha256Hex);
    const tree = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const proof = buildMerkleProof(tree, i);
      expect(verifyMerkleProof(proof)).toBe(true);
    }
  });

  it("tampered leaf fails verification", () => {
    const tree = buildMerkleTree([sha256Hex("a"), sha256Hex("b")]);
    const proof = buildMerkleProof(tree, 0);
    expect(verifyMerkleProof({ ...proof, leafHash: sha256Hex("not-a") })).toBe(false);
  });

  it("buildMerkleProof rejects out-of-range index", () => {
    const tree = buildMerkleTree([sha256Hex("a")]);
    expect(() => buildMerkleProof(tree, 5)).toThrow();
  });
});

describe("chain helpers", () => {
  it("GENESIS_HASH is 64 zeros", () => {
    expect(GENESIS_HASH).toBe("0".repeat(64));
  });

  it("chainHash is deterministic", () => {
    const a = chainHash(GENESIS_HASH, sha256Hex("event-1"));
    const b = chainHash(GENESIS_HASH, sha256Hex("event-1"));
    expect(a).toBe(b);
  });
});

describe("verifyOffline", () => {
  it("accepts a valid leaf payload", () => {
    const payload = JSON.stringify({ caseId: "case_1", at: 1714638000000 });
    const leaves = [sha256Hex(payload), sha256Hex("other")];
    const tree = buildMerkleTree(leaves);
    const proof = buildMerkleProof(tree, 0);
    const r = verifyOffline({ leafPayload: payload, proof });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.rootHex).toBe(tree.root);
  });

  it("rejects a tampered payload", () => {
    const payload = JSON.stringify({ caseId: "case_1" });
    const leaves = [sha256Hex(payload), sha256Hex("other")];
    const tree = buildMerkleTree(leaves);
    const proof = buildMerkleProof(tree, 0);
    const r = verifyOffline({ leafPayload: "tampered", proof });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toBe("Leaf hash mismatch");
  });
});
