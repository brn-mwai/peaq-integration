import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).default("info"),
  SERVICE_NAME: z.string().default("peaq-integration"),

  PEAQ_NETWORK: z.enum(["mainnet", "agung"]).default("agung"),
  PEAQ_WSS_URL: z.string().url().optional(),
  PEAQ_HTTPS_URL: z.string().url().optional(),

  PEAQ_SIGNER_MNEMONIC: z.string().min(1).optional(),
  PEAQ_EVM_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),

  PEAQ_ANCHOR_TO_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default("0x000000000000000000000000000000000000dEaD"),

  PEAQ_DID_CONTROLLER: z.string().optional(),

  PEAQ_RETRY_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  PEAQ_RETRY_BASE_MS: z.coerce.number().int().positive().default(500),
  PEAQ_RETRY_MAX_MS: z.coerce.number().int().positive().default(30_000),

  SENTRY_DSN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
