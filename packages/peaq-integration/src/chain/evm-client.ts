import { createPublicClient, createWalletClient, http, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { logger } from "../logger.js";
import type { PeaqNetworkConfig } from "./networks.js";
import { viemChain } from "./networks.js";
import { retryWithBackoff } from "./retry.js";

export interface EvmClientConfig {
  network: PeaqNetworkConfig;
  httpsUrl?: string;
  privateKey?: Hex;
  retryMaxAttempts?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

const privateKeySchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Private key must be 0x-prefixed 64-hex");

export class EvmClient {
  private readonly cfg: Required<EvmClientConfig>;
  private readonly publicClient: ReturnType<typeof createPublicClient>;
  private readonly walletClient: ReturnType<typeof createWalletClient> | null;
  private readonly chain: ReturnType<typeof viemChain>;

  constructor(cfg: EvmClientConfig) {
    this.cfg = {
      network: cfg.network,
      httpsUrl: cfg.httpsUrl ?? cfg.network.endpoints.httpsRpc[0]!,
      privateKey: cfg.privateKey ?? ("0x" as Hex),
      retryMaxAttempts: cfg.retryMaxAttempts ?? 5,
      retryBaseMs: cfg.retryBaseMs ?? 500,
      retryMaxMs: cfg.retryMaxMs ?? 30_000,
    };
    this.chain = viemChain(cfg.network);
    this.publicClient = createPublicClient({ chain: this.chain, transport: http(this.cfg.httpsUrl) });

    if (cfg.privateKey && cfg.privateKey !== "0x") {
      privateKeySchema.parse(cfg.privateKey);
      const account = privateKeyToAccount(cfg.privateKey);
      this.walletClient = createWalletClient({ account, chain: this.chain, transport: http(this.cfg.httpsUrl) });
      logger.info(
        { event: "peaq.evm.signerLoaded", address: account.address },
        "EVM signer loaded",
      );
    } else {
      this.walletClient = null;
    }
  }

  signerAddress(): string | null {
    return this.walletClient?.account?.address ?? null;
  }

  async chainIdOnRpc(): Promise<number> {
    const id = await this.publicClient.getChainId();
    return id;
  }

  async health(): Promise<{
    ok: boolean;
    chainId?: number;
    expectedChainId: number;
    blockNumber?: number;
    reason?: string;
  }> {
    const expected = this.cfg.network.chainId;
    try {
      const [chainId, blockNumber] = await Promise.all([
        this.publicClient.getChainId(),
        this.publicClient.getBlockNumber(),
      ]);
      if (chainId !== expected) {
        return {
          ok: false,
          chainId,
          expectedChainId: expected,
          blockNumber: Number(blockNumber),
          reason: `RPC chain ID mismatch: got ${chainId}, expected ${expected}`,
        };
      }
      return { ok: true, chainId, expectedChainId: expected, blockNumber: Number(blockNumber) };
    } catch (err) {
      return { ok: false, expectedChainId: expected, reason: (err as Error).message };
    }
  }

  async sendCalldata(input: {
    to: `0x${string}`;
    data: Hex;
    valueWei?: bigint;
  }): Promise<{ txHash: Hash; durationMs: number; attempts: number }> {
    if (!this.walletClient) throw new Error("EVM signer not loaded (set privateKey)");

    const start = Date.now();
    const outcome = await retryWithBackoff(
      async () =>
        this.walletClient!.sendTransaction({
          account: this.walletClient!.account!,
          chain: this.chain,
          to: input.to,
          data: input.data,
          value: input.valueWei ?? 0n,
        }),
      {
        maxAttempts: this.cfg.retryMaxAttempts,
        baseMs: this.cfg.retryBaseMs,
        maxMs: this.cfg.retryMaxMs,
      },
    );

    if (!outcome.ok) {
      throw new Error(
        `EVM tx failed after ${outcome.attempts} attempts: ${(outcome.error as Error).message}`,
      );
    }
    return { txHash: outcome.value, durationMs: Date.now() - start, attempts: outcome.attempts };
  }

  async getReceipt(txHash: Hash): Promise<{
    blockNumber: bigint;
    status: "success" | "reverted";
    inputData: Hex;
  } | null> {
    try {
      const [receipt, tx] = await Promise.all([
        this.publicClient.getTransactionReceipt({ hash: txHash }),
        this.publicClient.getTransaction({ hash: txHash }),
      ]);
      return {
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        inputData: tx.input,
      };
    } catch {
      return null;
    }
  }
}
