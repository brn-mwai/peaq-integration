import {
  EvmClient,
  PeaqAnchorService,
  PeaqDidIssuer,
  PeaqDidResolver,
  PeaqRbacClient,
  PeaqStorageClient,
  SubstrateClient,
  env,
  resolveNetwork,
} from "@aximobility/peaq-integration";

export interface CliContext {
  substrate: SubstrateClient;
  evm: EvmClient;
  did: { issuer: PeaqDidIssuer; resolver: PeaqDidResolver };
  storage: PeaqStorageClient;
  rbac: PeaqRbacClient;
  anchor: PeaqAnchorService;
  disconnect: () => Promise<void>;
}

export async function buildContext(opts: { needsSigner?: boolean } = {}): Promise<CliContext> {
  const network = resolveNetwork(env.PEAQ_NETWORK);
  const substrate = new SubstrateClient({
    network,
    ...(env.PEAQ_WSS_URL ? { wssUrl: env.PEAQ_WSS_URL } : {}),
    ...(env.PEAQ_SIGNER_MNEMONIC ? { signerMnemonic: env.PEAQ_SIGNER_MNEMONIC } : {}),
    retryMaxAttempts: env.PEAQ_RETRY_MAX_ATTEMPTS,
    retryBaseMs: env.PEAQ_RETRY_BASE_MS,
    retryMaxMs: env.PEAQ_RETRY_MAX_MS,
  });
  await substrate.connect();
  if (opts.needsSigner && !env.PEAQ_SIGNER_MNEMONIC) {
    throw new Error(
      "PEAQ_SIGNER_MNEMONIC required for this command. Set it via env or Secrets Manager.",
    );
  }

  const evm = new EvmClient({
    network,
    ...(env.PEAQ_HTTPS_URL ? { httpsUrl: env.PEAQ_HTTPS_URL } : {}),
    ...(env.PEAQ_EVM_PRIVATE_KEY ? { privateKey: env.PEAQ_EVM_PRIVATE_KEY as `0x${string}` } : {}),
    retryMaxAttempts: env.PEAQ_RETRY_MAX_ATTEMPTS,
    retryBaseMs: env.PEAQ_RETRY_BASE_MS,
    retryMaxMs: env.PEAQ_RETRY_MAX_MS,
  });

  const issuer = new PeaqDidIssuer({ substrate });
  const resolver = new PeaqDidResolver({ substrate, issuer });
  const storage = new PeaqStorageClient({ substrate });
  const rbac = new PeaqRbacClient({ substrate });
  const anchor = new PeaqAnchorService({
    substrate,
    evm,
    evmToAddress: env.PEAQ_ANCHOR_TO_ADDRESS as `0x${string}`,
  });

  return {
    substrate,
    evm,
    did: { issuer, resolver },
    storage,
    rbac,
    anchor,
    disconnect: async () => {
      await substrate.disconnect();
    },
  };
}
