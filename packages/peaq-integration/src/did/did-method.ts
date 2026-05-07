import {hexToU8a} from "@polkadot/util";
import {decodeAddress} from "@polkadot/util-crypto";
import {z} from "zod";

const DID_PREFIX = "did:peaq:";
const DID_BODY_REGEX = /^(0x[a-fA-F0-9]{40,64}|[1-9A-HJ-NP-Za-km-z]+)$/;

/**
 * Resolve a `did:peaq:...` string (or its body) to the on-chain account bytes
 * that the peaq pallets expect (AccountId32 = 32 raw bytes).
 *
 * Accepts:
 *   - `did:peaq:0x<hex>` (EVM-style hex extension)
 *   - `did:peaq:<ss58-base58>` (canonical peaq DID method)
 *   - bare `0x<hex>` body
 *   - bare `<ss58-base58>` body
 */
export function didToAccount(didOrBody: string): Uint8Array {
    const body = didOrBody.startsWith(DID_PREFIX) ? didOrBody.slice(DID_PREFIX.length) : didOrBody;
    if (body.startsWith("0x")) {
        return hexToU8a(body);
    }
    return decodeAddress(body);
}

export const peaqDidSchema = z
    .string()
    .startsWith(DID_PREFIX)
    .refine((value) => DID_BODY_REGEX.test(value.slice(DID_PREFIX.length)), {
        message: "DID body must be 0x-prefixed hex (EVM address / public key) or base58 (ss58)",
    });

export type PeaqDid = z.infer<typeof peaqDidSchema>;

export function isPeaqDid(value: string): value is PeaqDid {
    return peaqDidSchema.safeParse(value).success;
}

export function parsePeaqDid(value: string): {method: "peaq"; id: string} {
    const parsed = peaqDidSchema.parse(value);
    return {method: "peaq", id: parsed.slice(DID_PREFIX.length)};
}

export function formatPeaqDid(id: string): PeaqDid {
    return peaqDidSchema.parse(`${DID_PREFIX}${id}`);
}

export const verificationMethodTypeSchema = z.enum([
    "Ed25519VerificationKey2020",
    "Sr25519VerificationKey2020",
    "EcdsaSecp256k1RecoveryMethod2020",
]);
export type VerificationMethodType = z.infer<typeof verificationMethodTypeSchema>;

export const serviceTypeSchema = z.string().min(1).max(64);
export type PeaqServiceType = z.infer<typeof serviceTypeSchema>;

const peaqServiceSchema = z
    .object({
        id: z.string().min(1),
        type: serviceTypeSchema,
        serviceEndpoint: z.string().min(1).optional(),
        data: z.string().min(1).optional(),
    })
    .refine((s) => s.serviceEndpoint !== undefined || s.data !== undefined, {
        message: "service must have serviceEndpoint or data",
    });

const peaqSignatureSchema = z.object({
    type: z.string().min(1),
    issuer: z.string().min(1),
    hash: z.string().min(1),
});

export const peaqDidDocumentSchema = z.object({
    id: peaqDidSchema,
    controller: peaqDidSchema,
    verificationMethod: z
        .array(
            z.object({
                id: z.string().min(1),
                type: verificationMethodTypeSchema,
                controller: peaqDidSchema,
                publicKeyMultibase: z.string().optional(),
                publicKeyHex: z
                    .string()
                    .regex(/^0x[a-fA-F0-9]+$/)
                    .optional(),
            }),
        )
        .min(1),
    service: z.array(peaqServiceSchema).default([]),
    authentication: z.array(z.string()).default([]),
    assertionMethod: z.array(z.string()).default([]),
    signature: peaqSignatureSchema.optional(),
});

export type PeaqDidDocument = z.infer<typeof peaqDidDocumentSchema>;
export type PeaqDidService = z.infer<typeof peaqServiceSchema>;
export type PeaqDidSignature = z.infer<typeof peaqSignatureSchema>;
