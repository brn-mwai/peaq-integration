import { describe, expect, it } from "vitest";
import {
  PEAQ_AGUNG,
  PEAQ_MAINNET,
  PEAQ_NETWORKS,
  resolveNetwork,
  viemChain,
} from "../src/chain/networks.js";

describe("peaq networks", () => {
  it("mainnet chain id is 3338", () => {
    expect(PEAQ_MAINNET.chainId).toBe(3338);
    expect(PEAQ_MAINNET.nativeCurrency.symbol).toBe("PEAQ");
  });

  it("agung testnet chain id is 9990", () => {
    expect(PEAQ_AGUNG.chainId).toBe(9990);
    expect(PEAQ_AGUNG.nativeCurrency.symbol).toBe("AGNG");
  });

  it("resolveNetwork accepts mainnet | agung and rejects others", () => {
    expect(resolveNetwork("mainnet")).toBe(PEAQ_NETWORKS.mainnet);
    expect(resolveNetwork("agung")).toBe(PEAQ_NETWORKS.agung);
    expect(() => resolveNetwork("unknown")).toThrow(/Unknown peaq network/);
  });

  it("resolveNetwork defaults to agung when undefined", () => {
    expect(resolveNetwork(undefined)).toBe(PEAQ_NETWORKS.agung);
  });

  it("viemChain produces a valid chain definition with explorer", () => {
    const chain = viemChain(PEAQ_MAINNET);
    expect(chain.id).toBe(3338);
    expect(chain.name).toBe("peaq");
    expect(chain.nativeCurrency.symbol).toBe("PEAQ");
    expect(chain.blockExplorers?.default.url).toBe("https://peaq.subscan.io");
  });

  it("every endpoint URL parses", () => {
    for (const cfg of [PEAQ_MAINNET, PEAQ_AGUNG]) {
      for (const url of cfg.endpoints.httpsRpc) expect(() => new URL(url)).not.toThrow();
      for (const url of cfg.endpoints.wssRpc) expect(() => new URL(url)).not.toThrow();
      for (const url of cfg.endpoints.blockExplorer) expect(() => new URL(url)).not.toThrow();
    }
  });
});
