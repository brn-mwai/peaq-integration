import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  EvmClient,
  PeaqAnchorService,
  PeaqDidIssuer,
  PeaqStorageClient,
  SubstrateClient,
  PEAQ_AGUNG,
  buildMerkleTree,
  formatPeaqDid,
  peaqDidDocumentSchema,
  sha256Hex,
} from "../../src/index.js";

// Live integration suite. Submits real extrinsics + transactions to agung
// testnet. Skipped unless PEAQ_LIVE_TESTS=1 and the relevant signer secrets
// are present. Each spec is independently runnable so a partial-config fail
// reveals which dependency is missing rather than masking under one failure.

const LIVE = process.env.PEAQ_LIVE_TESTS === "1";

describe.skipIf(!LIVE)("peaq agung live integration", () => {
  describe("EVM anchor", () => {
    let evm: EvmClient;
    let service: PeaqAnchorService;

    beforeAll(() => {
      const pk = process.env.PEAQ_EVM_PRIVATE_KEY;
      if (!pk) throw new Error("PEAQ_EVM_PRIVATE_KEY required for EVM live tests");
      evm = new EvmClient({ network: PEAQ_AGUNG, privateKey: pk as `0x${string}` });
      service = new PeaqAnchorService({ evm });
    });

    it("RPC chain ID matches agung", async () => {
      const id = await evm.chainIdOnRpc();
      expect(id).toBe(PEAQ_AGUNG.chainId);
    }, 30_000);

    it("submits a Merkle anchor and the receipt is fetchable", async () => {
      const leaves = ["alpha", "beta", "gamma", "delta"].map((s) => sha256Hex(s));
      const tree = buildMerkleTree(leaves);
      const today = new Date().toISOString().slice(0, 10);

      const receipt = await service.submitViaEvm({
        workspaceId: "live-test",
        anchorDate: today,
        leafHashes: leaves,
      });

      expect(receipt.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(receipt.rootHex).toBe(tree.root);
      expect(receipt.attempts).toBeGreaterThanOrEqual(1);

      const onchain = await evm.getReceipt(receipt.txHash as `0x${string}`);
      expect(onchain).not.toBeNull();
      expect(onchain!.status).toBe("success");
      expect(onchain!.inputData.toLowerCase()).toBe(`0x${tree.root}`.toLowerCase());
    }, 90_000);
  });

  describe("Substrate DID + Storage", () => {
    let substrate: SubstrateClient;

    beforeAll(async () => {
      const mnemonic = process.env.PEAQ_SUBSTRATE_MNEMONIC;
      if (!mnemonic) throw new Error("PEAQ_SUBSTRATE_MNEMONIC required for substrate live tests");
      substrate = new SubstrateClient({ network: PEAQ_AGUNG, signerMnemonic: mnemonic });
      await substrate.connect();
    }, 30_000);

    afterAll(async () => {
      await substrate?.disconnect();
    });

    it("substrate health reports a finalized block", async () => {
      const h = await substrate.health();
      expect(h.ok).toBe(true);
      expect(h.finalized).toBeGreaterThan(0);
    }, 30_000);

    it("writes + reads a storage item", async () => {
      const storage = new PeaqStorageClient({ substrate });
      const itemType = `axi.live.${Date.now()}`.slice(0, 64);
      const payload = `live-test-${Date.now()}`;

      const receipt = await storage.addItem(itemType, payload);
      expect(receipt.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(receipt.blockNumber).toBeGreaterThan(0);

      const owner = substrate.signerAddress();
      expect(owner).not.toBeNull();
      const fetched = await storage.getItem(owner!, itemType);
      expect(fetched.value).not.toBeNull();
    }, 90_000);

    it("issues a DID document and reads it back", async () => {
      const issuer = new PeaqDidIssuer({ substrate });
      const didId = `0x${sha256Hex(`live-${Date.now()}`)}`;
      const did = formatPeaqDid(didId);
      const doc = peaqDidDocumentSchema.parse({
        id: did,
        controller: did,
        verificationMethod: [
          {
            id: `${did}#key-1`,
            type: "Sr25519VerificationKey2020",
            controller: did,
            publicKeyHex: didId,
          },
        ],
        authentication: [`${did}#key-1`],
      });

      const receipt = await issuer.writeDocument(did, doc);
      expect(receipt.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

      const fetched = await issuer.readDocument(did);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(did);
    }, 90_000);
  });
});
