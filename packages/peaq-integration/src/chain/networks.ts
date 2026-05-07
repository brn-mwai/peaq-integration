import {defineChain} from "viem";

export type PeaqNetwork = "mainnet" | "agung";

export interface PeaqNetworkConfig {
    name: PeaqNetwork;
    chainId: number;
    nativeCurrency: {name: string; symbol: string; decimals: number};
    ss58Prefix: number;
    endpoints: {
        httpsRpc: readonly string[];
        wssRpc: readonly string[];
        blockExplorer: readonly string[];
    };
    paraId: number | null;
}

export const PEAQ_PRECOMPILE_ADDRESSES = {
    did: "0x0000000000000000000000000000000000000800",
    storage: "0x0000000000000000000000000000000000000801",
    rbac: "0x0000000000000000000000000000000000000802",
    erc20: "0x0000000000000000000000000000000000000809",
} as const;

export const PEAQ_MAINNET: PeaqNetworkConfig = {
    name: "mainnet",
    chainId: 3338,
    nativeCurrency: {name: "PEAQ", symbol: "PEAQ", decimals: 18},
    ss58Prefix: 42,
    // peaq updated their RPCs in 2025-07; quicknode is now the primary, publicnode is the
    // documented fallback. onfinality.io is deprecated and intentionally not listed here.
    endpoints: {
        httpsRpc: [
            "https://quicknode1.peaq.xyz",
            "https://quicknode2.peaq.xyz",
            "https://quicknode3.peaq.xyz",
            "https://peaq-rpc.publicnode.com",
        ],
        wssRpc: [
            "wss://quicknode1.peaq.xyz",
            "wss://quicknode2.peaq.xyz",
            "wss://quicknode3.peaq.xyz",
            "wss://peaq-rpc.publicnode.com",
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
    nativeCurrency: {name: "Agung", symbol: "AGNG", decimals: 18},
    ss58Prefix: 42,
    endpoints: {
        httpsRpc: [
            "https://peaq-agung.api.onfinality.io/public",
            "https://wss-async-agung.peaq.xyz",
        ],
        wssRpc: [
            "wss://peaq-agung.api.onfinality.io/public-ws",
            "wss://wss-async-agung.peaq.xyz",
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
            default: {http: [...cfg.endpoints.httpsRpc]},
            public: {http: [...cfg.endpoints.httpsRpc]},
        },
        blockExplorers:
            cfg.endpoints.blockExplorer.length > 0
                ? {
                      default: {
                          name: cfg.name === "mainnet" ? "Subscan" : "Subscan (testnet)",
                          url: cfg.endpoints.blockExplorer[0]!,
                      },
                  }
                : undefined,
    });
}
