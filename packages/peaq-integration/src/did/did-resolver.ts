import { hexToU8a, u8aToHex } from "@polkadot/util";
import { decodeAddress } from "@polkadot/util-crypto";
import { z } from "zod";
import type { SubstrateClient } from "../chain/substrate-client.js";
import type { PeaqDidIssuer } from "./did-issuer.js";
import { type PeaqDidDocument, formatPeaqDid, peaqDidSchema } from "./did-method.js";

export interface DidResolverConfig {
  substrate: SubstrateClient;
  issuer: PeaqDidIssuer;
}

export interface ResolutionResult {
  didResolutionMetadata: { contentType: "application/did+ld+json" | "application/did+json" };
  didDocument: PeaqDidDocument | null;
  didDocumentMetadata: {
    onChainCreatedBlock: number | null;
    onChainValidityBlock: number | null;
    versionId: string | null;
  };
}

export class PeaqDidResolver {
  constructor(private readonly cfg: DidResolverConfig) {}

  async resolve(didOrAddress: string): Promise<ResolutionResult> {
    const did = this.normaliseToDid(didOrAddress);
    const doc = await this.cfg.issuer.readDocument(did);
    const attr = await this.cfg.issuer.readAttribute(did, "doc");
    return {
      didResolutionMetadata: {
        contentType: doc ? "application/did+ld+json" : "application/did+json",
      },
      didDocument: doc,
      didDocumentMetadata: {
        onChainCreatedBlock: attr.createdBlock,
        onChainValidityBlock: attr.validityBlock,
        versionId: attr.createdBlock !== null ? `block-${attr.createdBlock}` : null,
      },
    };
  }

  private normaliseToDid(input: string): string {
    if (input.startsWith("did:peaq:")) {
      return peaqDidSchema.parse(input);
    }
    if (input.startsWith("0x")) {
      return formatPeaqDid(input);
    }
    try {
      const bytes = decodeAddress(input);
      return formatPeaqDid(u8aToHex(bytes));
    } catch (err) {
      throw new Error(`Could not normalise ${input} to did:peaq: ${(err as Error).message}`);
    }
  }
}

export const universalResolverInputSchema = z.string().min(1);
export const _u8aToHex = u8aToHex;
export const _hexToU8a = hexToU8a;
