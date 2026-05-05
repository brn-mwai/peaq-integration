import {z} from "zod";

// did:peaq DID format. Per https://docs.peaq.xyz/peaqchain/sdk-reference/javascript/did-operations
// the SDK accepts EITHER an EVM hex address (0x + 40 hex) OR a Substrate ss58
// address as the body. We accept both; downstream consumers should treat the
// body as opaque text + let the substrate side normalise to public-key bytes.

const DID_PREFIX = "did:peaq:";

// Permissive body matcher: ss58 base58 chars OR 0x + 40 hex (EVM address) OR
// 0x + 64 hex (32-byte public key). The chain itself is the source of truth
// for what's valid; we only stop the most obviously malformed inputs.
const DID_BODY_REGEX = /^(0x[a-fA-F0-9]{40,64}|[1-9A-HJ-NP-Za-km-z]+)$/;

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

// Verification method types per the live SDK. EVM signers use
// EcdsaSecp256k1RecoveryMethod2020; Substrate signers use Ed25519/Sr25519.
// Source: https://docs.peaq.xyz/peaqchain/sdk-reference/javascript/did-operations
export const verificationMethodTypeSchema = z.enum([
    "Ed25519VerificationKey2020",
    "Sr25519VerificationKey2020",
    "EcdsaSecp256k1RecoveryMethod2020",
]);
export type VerificationMethodType = z.infer<typeof verificationMethodTypeSchema>;

// Service type is a free-form identifier per the SDK examples (e.g. "machineData",
// "admin", "payment"). We do not constrain it to an enum because peaq doesn't.
export const serviceTypeSchema = z.string().min(1).max(64);
export type PeaqServiceType = z.infer<typeof serviceTypeSchema>;

// Service entry: id + type required; either serviceEndpoint OR data may be
// present (some service types embed a URL, others embed an inline value).
const peaqServiceSchema = z
    .object({
        id: z.string().min(1),
        type: serviceTypeSchema,
        serviceEndpoint: z.string().min(1).optional(),
        data: z.string().min(1).optional(),
    })
    .refine((s) => s.serviceEndpoint !== undefined || s.data !== undefined, {
        message: "service must have serviceEndpoint or data (or both)",
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
    // Optional signature block per the SDK spec; omitted in most documents.
    signature: peaqSignatureSchema.optional(),
});

export type PeaqDidDocument = z.infer<typeof peaqDidDocumentSchema>;
export type PeaqDidService = z.infer<typeof peaqServiceSchema>;
export type PeaqDidSignature = z.infer<typeof peaqSignatureSchema>;
