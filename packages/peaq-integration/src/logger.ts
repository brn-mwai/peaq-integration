import pino from "pino";

const REDACT_PATHS = [
  "*.privateKey",
  "*.signerMnemonic",
  "*.mnemonic",
  "*.password",
  "*.secret",
  "*.token",
  "*.bearer",
  "*.authorization",
  "headers.authorization",
];

export const logger = pino({
  name: process.env.SERVICE_NAME ?? "peaq-integration",
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: { service: process.env.SERVICE_NAME ?? "peaq-integration" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
