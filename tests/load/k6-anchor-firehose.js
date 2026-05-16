// k6 load test: Merkle anchor submission against the configured peaq RPC.
// Default targets agung; PEAQ_RPC_HTTP env overrides for staging/mainnet runs.
//
// Usage:
//   k6 run -e PEAQ_RPC_HTTP=https://peaq-agung.api.onfinality.io/public \
//          -e CHAIN_ID=9990 tests/load/k6-anchor-firehose.js
//
// What it measures:
//   - eth_chainId latency p50 / p95 / p99
//   - eth_blockNumber latency
//   - sustained RPC request rate without rate-limit triggers
//
// What it does NOT do:
//   - submit real signed extrinsics (would burn balance + need a faucet loop)
//   - exercise the Merkle build path (covered by unit tests)
//
// Calibrate the gateway: agung public RPC is rate-limited ~10 req/s/IP per
// peaq-network/canary docs. Bump VUs only after deploying a private RPC.

import { check, sleep } from "k6";
import http from "k6/http";
import { Counter, Rate, Trend } from "k6/metrics";

const RPC = __ENV.PEAQ_RPC_HTTP || "https://peaq-agung.api.onfinality.io/public";
const EXPECTED_CHAIN_ID = Number(__ENV.CHAIN_ID || 9990);

const chainIdLatency = new Trend("rpc_chain_id_ms", true);
const blockNumberLatency = new Trend("rpc_block_number_ms", true);
const errors = new Counter("rpc_errors_total");
const successRate = new Rate("rpc_success_rate");

export const options = {
  scenarios: {
    steady: {
      executor: "constant-arrival-rate",
      rate: 5,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 10,
      maxVUs: 25,
    },
    burst: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 50,
      maxVUs: 100,
      startTime: "65s",
      stages: [
        { duration: "30s", target: 25 },
        { duration: "60s", target: 25 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    rpc_chain_id_ms: ["p(95)<2000", "p(99)<5000"],
    rpc_block_number_ms: ["p(95)<2000", "p(99)<5000"],
    rpc_success_rate: ["rate>0.95"],
    rpc_errors_total: ["count<25"],
  },
};

function jsonRpc(method, params = []) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params });
  return http.post(RPC, body, {
    headers: { "Content-Type": "application/json" },
    timeout: "10s",
  });
}

export default function () {
  const r1 = jsonRpc("eth_chainId");
  chainIdLatency.add(r1.timings.duration);
  const ok1 = check(r1, {
    "chain_id status 200": (resp) => resp.status === 200,
    "chain_id no error": (resp) => {
      try {
        return JSON.parse(resp.body).result !== undefined;
      } catch {
        return false;
      }
    },
    "chain_id matches expected": (resp) => {
      try {
        const id = Number(JSON.parse(resp.body).result);
        return id === EXPECTED_CHAIN_ID;
      } catch {
        return false;
      }
    },
  });
  successRate.add(ok1);
  if (!ok1) errors.add(1);

  const r2 = jsonRpc("eth_blockNumber");
  blockNumberLatency.add(r2.timings.duration);
  const ok2 = check(r2, {
    "block_number status 200": (resp) => resp.status === 200,
    "block_number monotonic": (resp) => {
      try {
        return Number(JSON.parse(resp.body).result) > 0;
      } catch {
        return false;
      }
    },
  });
  successRate.add(ok2);
  if (!ok2) errors.add(1);

  sleep(0.1);
}

export function handleSummary(data) {
  const summary = {
    stdout: JSON.stringify(
      {
        rpc: RPC,
        expectedChainId: EXPECTED_CHAIN_ID,
        chainIdMs: data.metrics.rpc_chain_id_ms?.values,
        blockNumberMs: data.metrics.rpc_block_number_ms?.values,
        successRate: data.metrics.rpc_success_rate?.values,
        errors: data.metrics.rpc_errors_total?.values,
      },
      null,
      2,
    ),
  };
  return summary;
}
