import { hexToU8a, stringToU8a, u8aToHex } from "@polkadot/util";
import { z } from "zod";
import { logger } from "../logger.js";
import type { SubstrateClient } from "../chain/substrate-client.js";
import { peaqDidDocumentSchema, type PeaqDidDocument } from "./did-method.js";

export interface DidIssuerConfig {
  substrate: SubstrateClient;
}

export interface AddAttributeReceipt {
  txHash: string;
  blockHash: string;
  blockNumber: number;
  did: string;
  attributeName: string;
  durationMs: number;
}

const addAttributeInputSchema = z.object({
  did: z.string().min(1),
  name: z.string().min(1).max(64),
  value: z.union([z.string(), z.instanceof(Uint8Array)]),
  validityDays: z.number().int().positive().optional(),
});

export class PeaqDidIssuer {
  constructor(private readonly cfg: DidIssuerConfig) {}

  async addAttribute(input: z.input<typeof addAttributeInputSchema>): Promise<AddAttributeReceipt> {
    const parsed = addAttributeInputSchema.parse(input);
    const api = this.cfg.substrate.getApi();
    const signer = this.cfg.substrate.getSigner();

    const valueBytes = parsed.value instanceof Uint8Array ? parsed.value : stringToU8a(parsed.value);
    const validity = parsed.validityDays ? blocksFromDays(parsed.validityDays) : null;

    if (!api.tx.peaqDid?.addAttribute) {
      throw new Error("peaqDid.addAttribute extrinsic not found on connected node");
    }

    const tx = api.tx.peaqDid.addAttribute(
      signer.address,
      stringToU8a(parsed.name),
      valueBytes,
      validity,
    );

    logger.info(
      {
        event: "peaq.did.addAttribute.submitting",
        did: parsed.did,
        attributeName: parsed.name,
        validityDays: parsed.validityDays ?? null,
      },
      "Submitting peaqDid.addAttribute",
    );

    const receipt = await this.cfg.substrate.submitExtrinsic(tx);
    return {
      txHash: receipt.txHash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      did: parsed.did,
      attributeName: parsed.name,
      durationMs: receipt.durationMs,
    };
  }

  async readAttribute(did: string, name: string): Promise<{
    value: string | null;
    validityBlock: number | null;
    createdBlock: number | null;
  }> {
    const api = this.cfg.substrate.getApi();
    if (!api.query.peaqDid?.attributeStore) {
      throw new Error("peaqDid.attributeStore not found on connected node");
    }

    const did32 = hexToU8a(did);
    const nameBytes = stringToU8a(name);
    const result = await api.query.peaqDid.attributeStore(did32, nameBytes);

    if ((result as unknown as { isNone?: boolean }).isNone) {
      return { value: null, validityBlock: null, createdBlock: null };
    }

    const unwrapped = (result as unknown as {
      unwrap: () => { value: { toHex: () => string }; validity: { toNumber: () => number }; created: { toNumber: () => number } };
    }).unwrap();
    return {
      value: unwrapped.value.toHex(),
      validityBlock: unwrapped.validity.toNumber(),
      createdBlock: unwrapped.created.toNumber(),
    };
  }

  async writeDocument(did: string, document: PeaqDidDocument): Promise<AddAttributeReceipt> {
    const validated = peaqDidDocumentSchema.parse(document);
    const json = JSON.stringify(validated);
    return this.addAttribute({ did, name: "doc", value: json });
  }

  async readDocument(did: string): Promise<PeaqDidDocument | null> {
    const attribute = await this.readAttribute(did, "doc");
    if (!attribute.value) return null;
    const bytes = hexToU8a(attribute.value);
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text) as unknown;
    return peaqDidDocumentSchema.parse(parsed);
  }
}

function blocksFromDays(days: number): number {
  // peaq target block time is 12s per substrate parachain default. 7200 blocks/day.
  return days * 7200;
}

export { u8aToHex };
