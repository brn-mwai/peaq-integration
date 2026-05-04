import { z } from "zod";

const DID_PREFIX = "did:peaq:";
const DID_BODY_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;

export const peaqDidSchema = z
  .string()
  .startsWith(DID_PREFIX)
  .refine((value) => DID_BODY_REGEX.test(value.slice(DID_PREFIX.length)), {
    message: "DID body must be base58-charset (1-9, A-H, J-N, P-Z, a-k, m-z)",
  });

export type PeaqDid = z.infer<typeof peaqDidSchema>;

export function isPeaqDid(value: string): value is PeaqDid {
  return peaqDidSchema.safeParse(value).success;
}

export function parsePeaqDid(value: string): { method: "peaq"; id: string } {
  const parsed = peaqDidSchema.parse(value);
  return { method: "peaq", id: parsed.slice(DID_PREFIX.length) };
}

export function formatPeaqDid(id: string): PeaqDid {
  return peaqDidSchema.parse(`${DID_PREFIX}${id}`);
}

export const verificationMethodTypeSchema = z.enum([
  "Ed25519VerificationKey2020",
  "Sr25519VerificationKey2020",
]);
export type VerificationMethodType = z.infer<typeof verificationMethodTypeSchema>;

export const serviceTypeSchema = z.enum(["payment", "p2p", "metadata"]);
export type PeaqServiceType = z.infer<typeof serviceTypeSchema>;

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
        publicKeyHex: z.string().regex(/^0x[a-fA-F0-9]+$/).optional(),
      }),
    )
    .min(1),
  service: z
    .array(
      z.object({
        id: z.string().min(1),
        type: serviceTypeSchema,
        serviceEndpoint: z.string().min(1),
      }),
    )
    .default([]),
  authentication: z.array(z.string()).default([]),
  assertionMethod: z.array(z.string()).default([]),
});

export type PeaqDidDocument = z.infer<typeof peaqDidDocumentSchema>;
