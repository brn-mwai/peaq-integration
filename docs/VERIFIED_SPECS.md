# Verified peaq specs

What this code targets, with the source we verified against. Anything we couldn't verify is flagged at the bottom.

## Verified ✅

| Fact | Value | Source |
|---|---|---|
| Mainnet EVM chain ID | `3338` | [chainid.network/chain/3338](https://chainid.network/chain/3338) · [chainlist.org/chain/3338](https://chainlist.org/chain/3338) |
| Mainnet native currency | `PEAQ` | [chainlist.org/chain/3338](https://chainlist.org/chain/3338) |
| Mainnet TGE | 12 Nov 2024 | [peaq.xyz/blog/the-peaq-token-launch](https://www.peaq.xyz/blog/the-peaq-token-launch-all-you-need-to-know) |
| Agung testnet chain ID | `9990` | [docs.peaq.xyz/build/getting-started/connecting-to-peaq](https://docs.peaq.xyz/build/getting-started/connecting-to-peaq) |
| Agung native currency | `AGNG` | [docs.peaq.network/docs/learn/token-and-token-utility/agung-token-faucet](https://docs.peaq.network/docs/learn/token-and-token-utility/agung-token-faucet/) |
| Polkadot ParaID (peaq) | `3338` | [parachains.info/details/peaq](https://parachains.info/details/peaq) |
| Substrate + EVM (single node) | confirmed | [peaq.xyz/blog/peaq-public-testnet-is-live](https://www.peaq.xyz/blog/peaq-public-testnet-is-live-supporting-ink-evm-smart-contracts) |
| Mainnet RPC (HTTPS) | `peaq-rpc.publicnode.com`, `peaq.api.onfinality.io/public`, `quicknode{1,2,3}.peaq.xyz` | [docs.peaq.xyz](https://docs.peaq.xyz/build/getting-started/connecting-to-peaq) |
| Mainnet RPC (WSS) | same hosts with `wss://` | docs |
| Agung RPC | `peaq-agung.api.onfinality.io/public`, `wss-async.agung.peaq.network` | docs |
| Block explorers | Subscan, peaqscan, Blockscout (`scout.peaq.xyz`) | docs + chainlist |
| Official TS SDK | `@peaq-network/sdk` v0.2.13 | [npmjs.com/package/@peaq-network/sdk](https://www.npmjs.com/package/@peaq-network/sdk) |
| Official Python SDK | `peaq-sdk` 0.2.1 | [pypi.org/project/peaq-sdk](https://pypi.org/project/peaq-sdk/) |
| Pallets | `peaqDid`, `peaqRbac`, `peaqStorage` (+ EVM precompiles) | [docs.peaq.xyz/build/advanced-operations/precompiles/introduction](https://docs.peaq.xyz/build/advanced-operations/precompiles/introduction) |
| DID method spec | `did:peaq:…`, charset `[1-9A-HJ-NP-Za-km-z]` | [github.com/peaqnetwork/peaq-did-specifications](https://github.com/peaqnetwork/peaq-did-specifications) |
| DID extrinsics | `addAttribute`, `readAttribute`, `updateAttribute`, `removeAttribute` | spec repo |
| Verification key types | Ed25519VerificationKey2020, sr25519 | spec repo |
| Service types | `payment`, `p2p`, `metadata` | spec repo |
| Storage extrinsics | `addItem`, `getItem`, `updateItem` | [github.com/peaqnetwork/peaq-storage-pallet](https://github.com/peaqnetwork/peaq-storage-pallet) |
| Faucet (agung) | Discord `#agung-faucet` (`!send <addr>`) | [docs.peaq.xyz/build/getting-started/get-test-tokens](https://docs.peaq.xyz/build/getting-started/get-test-tokens) |
| Latest node release | `peaq-v0.0.111` (2026-03-23) | [github.com/peaqnetwork/peaq-network-node](https://github.com/peaqnetwork/peaq-network-node) |

## Could not verify ⚠ (must confirm with peaq team before mainnet review)

| Item | Why it matters | Action |
|---|---|---|
| Exact extrinsic fee for `peaqDid.addAttribute` and `peaqStorage.addItem` (in PEAQ + USD) | Capacity planning and cost-of-anchor model | Email devs@peaq.network |
| DePIN bulk-write pricing tier | High-frequency anchor pricing | Email devs@peaq.network |
| Strict W3C JSON-LD VC compliance | Insurance arbitrage pitch relies on this | Spec is in draft, get a written confirmation |
| Validator/collator decentralisation metrics | Threat model / liveness assumptions | Subscan dashboard + ask peaq for current count |
| Major incidents/forks since mainnet launch | Risk model | Email devs@peaq.network |
| KREST → PEAQ token migration plan | Krest canary network policy | Email devs@peaq.network |
| Official viem chain definition shipped by peaq | Type-safe EVM tooling | We synthesise via `defineChain`; ask if peaq plans an official |

## Source-of-truth quick links

- Docs: <https://docs.peaq.xyz/>
- Builder docs: <https://docs.peaq.network/>
- Network node repo: <https://github.com/peaqnetwork/peaq-network-node>
- TS SDK repo: <https://github.com/peaqnetwork/peaq-js>
- DID spec: <https://github.com/peaqnetwork/peaq-did-specifications>
- Storage pallet: <https://github.com/peaqnetwork/peaq-storage-pallet>
- Subscan (mainnet): <https://peaq.subscan.io>
- Subscan (agung): <https://agung-testnet.subscan.io>
- Token launch context: <https://messari.io/report/a-peaq-at-mainnet>
