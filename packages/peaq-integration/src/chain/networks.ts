import { defineChain } from "viem";

export type PeaqNetwork = "mainnet" | "agung";

export interface PeaqNetworkConfig {
  name: PeaqNetwork;
  chainId: number;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  ss58Prefix: number;
  endpoints: {
    httpsRpc: readonly string[];
    wssRpc: readonly string[];
    blockExplorer: readonly string[];
  };
  paraId: number | null;
}

export const PEAQ_MAINNET: PeaqNetworkConfig = {
  name: "mainnet",
  chainId: 3338,
  nativeCurrency: { name: "PEAQ", symbol: "PEAQ", decimals: 18 },
  ss58Prefix: 42,
  endpoints: {
    httpsRpc: [
      "https://peaq-rpc.publicnode.com",
      "https://peaq.api.onfinality.io/public",
      "https://quicknode1.peaq.xyz",
      "https://quicknode2.peaq.xyz",
      "https://quicknode3.peaq.xyz",
    ],
    wssRpc: [
      "wss://peaq-rpc.publicnode.com",
      "wss://peaq.api.onfinality.io/public-ws",
      "wss://quicknode1.peaq.xyz",
      "wss://quicknode2.peaq.xyz",
      "wss://quicknode3.peaq.xyz",
    ],
    blockExplorer: [
      "https://peaq.subscan.io",
      "https://peaqscan.xyz",
      "https://scout.peaq.xyz",
    ],
  },
  paraId: 3338,
};

export const PEAQ_AGUNG: PeaqNetworkConfig = {
  name: "agung",
  chainId: 9990,
  nativeCurrency: { name: "Agung", symbol: "AGNG", decimals: 18 },
  ss58Prefix: 42,
  endpoints: {
    httpsRpc: [
      "https://peaq-agung.api.onfinality.io/public",
      "https://wss-async.agung.peaq.network",
    ],
    wssRpc: [
      "wss://peaq-agung.api.onfinality.io/public-ws",
      "wss://wss-async.agung.peaq.network",
    ],
    blockExplorer: [
      "https://agung-testnet.subscan.io",
      "https://testnet.peaqscan.xyz",
    ],
  },
  paraId: null,
};

export const PEAQ_NETWORKS: Record<PeaqNetwork, PeaqNetworkConfig> = {
  mainnet: PEAQ_MAINNET,
  agung: PEAQ_AGUNG,
};

export function resolveNetwork(name: string | undefined): PeaqNetworkConfig {
  const requested = (name ?? "agung").toLowerCase() as PeaqNetwork;
  const cfg = PEAQ_NETWORKS[requested];
  if (!cfg) {
    throw new Error(`Unknown peaq network: ${name}. Valid: mainnet | agung.`);
  }
  return cfg;
}

export function viemChain(cfg: PeaqNetworkConfig) {
  return defineChain({
    id: cfg.chainId,
    name: cfg.name === "mainnet" ? "peaq" : "peaq-agung",
    nativeCurrency: cfg.nativeCurrency,
    rpcUrls: {
      default: { http: [...cfg.endpoints.httpsRpc] },
      public: { http: [...cfg.endpoints.httpsRpc] },
    },
    blockExplorers: cfg.endpoints.blockExplorer.length > 0
      ? {
          default: {
            name: cfg.name === "mainnet" ? "Subscan" : "Subscan (testnet)",
            url: cfg.endpoints.blockExplorer[0]!,
          },
        }
      : undefined,
  });
}
