import { describe, expect, it } from "vitest";
import {
  formatPeaqDid,
  isPeaqDid,
  parsePeaqDid,
  peaqDidDocumentSchema,
} from "../src/did/did-method.js";

describe("peaq DID method", () => {
  it("isPeaqDid accepts valid did:peaq", () => {
    expect(isPeaqDid("did:peaq:5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY")).toBe(true);
  });

  it("isPeaqDid rejects unknown methods", () => {
    expect(isPeaqDid("did:key:abc")).toBe(false);
    expect(isPeaqDid("did:peaq:")).toBe(false);
    expect(isPeaqDid("did:peaq:has-dash")).toBe(false);
    expect(isPeaqDid("did:peaq:has space")).toBe(false);
  });

  it("parsePeaqDid splits method + id", () => {
    const r = parsePeaqDid("did:peaq:5GrwvaEF");
    expect(r.method).toBe("peaq");
    expect(r.id).toBe("5GrwvaEF");
  });

  it("formatPeaqDid prepends the method prefix", () => {
    expect(formatPeaqDid("5GrwvaEF")).toBe("did:peaq:5GrwvaEF");
  });

  it("formatPeaqDid rejects invalid charset", () => {
    expect(() => formatPeaqDid("invalid-chars")).toThrow();
  });
});

describe("peaq DID document schema", () => {
  it("validates a minimal document", () => {
    const doc = peaqDidDocumentSchema.parse({
      id: "did:peaq:5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      controller: "did:peaq:5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      verificationMethod: [
        {
          id: "did:peaq:5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY#keys-1",
          type: "Sr25519VerificationKey2020",
          controller: "did:peaq:5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
          publicKeyHex: "0x0011223344",
        },
      ],
    });
    expect(doc.id).toMatch(/^did:peaq:/);
    expect(doc.service).toEqual([]);
  });

  it("rejects an unknown verification method type", () => {
    const r = peaqDidDocumentSchema.safeParse({
      id: "did:peaq:5GrwvaEF",
      controller: "did:peaq:5GrwvaEF",
      verificationMethod: [
        { id: "x", type: "MadeUp", controller: "did:peaq:5GrwvaEF", publicKeyHex: "0xab" },
      ],
    });
    expect(r.success).toBe(false);
  });
});
