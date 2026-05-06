# @aximobility/peaq-integration

The library. Typed clients for peaq's pallets and EVM, plus the daily Merkle anchor service.

The full repo lives in [`peaq-integration`](../..). The CLI that wraps this library is in [`apps/peaq-cli`](../../apps/peaq-cli).

---

## What it gives you

```
@aximobility/peaq-integration
├── chain/
│   ├── SubstrateClient   Talks to peaq's WSS for pallet calls
│   ├── EvmClient         Talks to peaq EVM for anchor transactions
│   ├── networks          mainnet (3338) + agung (9990) configs
│   └── retry             Exponential backoff with jitter
├── did/
│   ├── PeaqDidIssuer     Writes DID documents to peaqDid
│   ├── PeaqDidResolver   Reads DID documents back
│   └── didMethod         Validates "did:peaq:..." strings
├── storage/
│   └── PeaqStorageClient peaqStorage pallet wrapper (addItem, getItem, updateItem)
├── rbac/
│   └── PeaqRbacClient    peaqRbac pallet wrapper
├── anchor/
│   ├── PeaqAnchorService Submits a Merkle root via EVM or Substrate
│   ├── merkle            Build, prove, verify
│   └── verifier          Cross-checks an on-chain root against leaves
├── signers/
│   ├── KmsEd25519Signer  Production: keys live in AWS KMS, never in memory
│   └── MnemonicSigner    Development only
├── env                   Zod-validated env loader
├── idempotency           Replay-safe submission cache
└── logger                pino with secret redaction
```

---

## Install

```bash
pnpm add @aximobility/peaq-integration
```

The library uses `@polkadot/api` (Substrate) and `viem` (EVM) under the hood.

---

## Connect to peaq

```ts
import {
  SubstrateClient,
  EvmClient,
  resolveNetwork,
} from "@aximobility/peaq-integration";

const network = resolveNetwork(process.env.PEAQ_NETWORK); // "mainnet" or "agung"

const substrate = new SubstrateClient({
  network,
  signerMnemonic: process.env.PEAQ_SIGNER_MNEMONIC,
});
await substrate.connect();

const evm = new EvmClient({
  network,
  privateKey: process.env.PEAQ_EVM_PRIVATE_KEY as `0x${string}`,
});
```

Both clients pull RPC endpoints from `chain/networks.ts` by default. Override with `httpsUrl` / `wssUrl` if you need a private node.

---

## Issue a DID

```ts
import { PeaqDidIssuer } from "@aximobility/peaq-integration";

const issuer = new PeaqDidIssuer({ substrate });

const receipt = await issuer.writeDocument(
  "did:peaq:5GrwvaEFyM...your-address",
  {
    id: "did:peaq:5GrwvaEFyM...your-address",
    controller: "did:peaq:5GrwvaEFyM...your-address",
    verificationMethod: [
      {
        id: "did:peaq:5GrwvaEFyM...#key-1",
        type: "Sr25519VerificationKey2020",
        controller: "did:peaq:5GrwvaEFyM...your-address",
        publicKeyHex: "0x...",
      },
    ],
  },
);

console.log(receipt.txHash, receipt.blockNumber);
```

The issuer validates the document against the peaq DID method spec before submitting. Bad documents fail at the boundary, not deep inside `@polkadot/api`.

---

## Resolve a DID

```ts
import { PeaqDidResolver } from "@aximobility/peaq-integration";

const resolver = new PeaqDidResolver({ substrate });

const document = await resolver.resolve("did:peaq:5GrwvaEFyM...");
// → { id, controller, verificationMethod, service?, ... }
```

---

## Anchor a Merkle root

There are two paths. Pick one.

### Via EVM (cheaper, simpler tooling)

```ts
import { PeaqAnchorService } from "@aximobility/peaq-integration";

const anchor = new PeaqAnchorService({ substrate, evm });

const receipt = await anchor.submitViaEvm({
  workspaceId: "roam",
  anchorDate: "2026-05-07",
  leafHashes: ["b94d27...", "2ca7d6...", /* one 64-hex per leaf */],
});

console.log(receipt.txHash, receipt.root);
```

### Via Substrate (data-rich, uses peaqStorage)

```ts
const receipt = await anchor.submitViaSubstrate({
  workspaceId: "roam",
  anchorDate: "2026-05-07",
  leafHashes: [/* 64-hex per leaf */],
});
```

Both return a typed receipt. Persist `txHash` so you can prove the anchor later.

---

## Verify an anchor

```ts
const ok = await anchor.verifyOnChain({
  txHash: "0x...",
  expectedRoot: "0x...",
});
// → boolean
```

The verifier reads the on-chain transaction, extracts the root, and compares it against the value you stored. No external service required.

---

## Use peaqStorage

```ts
import { PeaqStorageClient } from "@aximobility/peaq-integration";

const storage = new PeaqStorageClient({ substrate });

await storage.put({ type: "axi.profile", value: '{"foo":"bar"}' });
const item = await storage.get({ owner: "5GrwvaEFyM...", type: "axi.profile" });
await storage.update({ type: "axi.profile", value: '{"foo":"baz"}' });
```

---

## Use peaqRbac

```ts
import { PeaqRbacClient } from "@aximobility/peaq-integration";

const rbac = new PeaqRbacClient({ substrate });

await rbac.addRole({ roleId: "operator", name: "Operator" });
await rbac.assignRoleToUser({ roleId: "operator", userId: "5GrwvaEFyM..." });
const roles = await rbac.fetchUserRoles("5GrwvaEFyM...");
```

---

## Configure environment

The library uses Zod to validate env. Provide these:

```bash
PEAQ_NETWORK=agung                          # or "mainnet"
PEAQ_SIGNER_MNEMONIC="word1 word2 ..."      # 12 or 24 words
PEAQ_EVM_PRIVATE_KEY=0x...                  # 0x-prefixed 64-hex

# Optional overrides:
PEAQ_HTTPS_RPC=https://...
PEAQ_WSS_RPC=wss://...
LOG_LEVEL=info                              # debug | info | warn | error
```

Loading with `loadEnv()` will throw immediately if a required value is missing or malformed.

```ts
import { loadEnv } from "@aximobility/peaq-integration";

const env = loadEnv();    // parsed + validated
```

---

## Production signers

Don't put a mnemonic in your env file. Use `KmsEd25519Signer` instead.

```ts
import { KmsEd25519Signer } from "@aximobility/peaq-integration";

const signer = new KmsEd25519Signer({
  awsRegion: "eu-west-1",
  kmsKeyArn: "arn:aws:kms:eu-west-1:...",
});

const substrate = new SubstrateClient({ network, signer });
```

The signer never exposes the private key to your process. Each signature round-trips through KMS.

---

## Retries

Every client uses `retryWithBackoff` internally. The retry classifier knows the difference between:

- **Retryable**: network blips, rate-limit, RPC overload, timeout.
- **Permanent**: insufficient balance, malformed transaction, priority too low.

Permanent errors short-circuit so you don't burn budget retrying transactions that won't change.

You can tune retry behaviour at construction time:

```ts
new EvmClient({
  network,
  privateKey: "0x...",
  retryMaxAttempts: 5,
  retryBaseMs: 500,
  retryMaxMs: 30_000,
});
```

---

## Idempotency

If your service crashes mid-anchor and restarts, you don't want to submit the same anchor twice. The library has a built-in `idempotency` cache keyed by `(workspaceId, anchorDate)` — second submit is a no-op.

```ts
import { idempotencyCache } from "@aximobility/peaq-integration";

await idempotencyCache.run(
  `anchor:${workspaceId}:${anchorDate}`,
  async () => anchor.submitViaEvm({ workspaceId, anchorDate, leafHashes }),
);
```

---

## Logging

```ts
import { logger } from "@aximobility/peaq-integration";

logger.info({ event: "did.issued", did: "did:peaq:..." }, "DID issued");
```

The logger is pino-shaped, structured JSON to stdout. Sensitive fields are redacted by default — you can write a private key into a log object and it'll come out as `[REDACTED]`.

---

## Tests

```bash
pnpm --filter @aximobility/peaq-integration test
```

Covers: network specs, Merkle tree round-trip, retry classifier, DID method validation, DID document Zod schema, KMS signer signature shape.

Live tests against Agung are opt-in: `PEAQ_LIVE_TESTS=1 pnpm test`.

---

## License

Apache-2.0.
