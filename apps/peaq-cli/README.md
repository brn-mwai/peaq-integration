# peaq-cli

Operator's command-line tool for the peaq integration. Use it to anchor data, manage DIDs, write to peaqStorage, and check that everything's healthy.

The library this wraps is in [`packages/peaq-integration`](../../packages/peaq-integration).

---

## Install

The CLI is part of the monorepo. From the repo root:

```bash
pnpm install
pnpm peaq --help        # alias for `pnpm --filter @aximobility/peaq-cli dev`
```

---

## Configure once

```bash
cp .env.example .env.local
```

Set at minimum:

```
PEAQ_NETWORK=agung                         # or "mainnet"
PEAQ_SIGNER_MNEMONIC="word1 word2 ..."     # for Substrate-side commands
PEAQ_EVM_PRIVATE_KEY=0x...                 # for EVM-side commands
```

`pnpm peaq status` confirms the config + reaches both networks.

---

## Commands

### Status + health

```bash
pnpm peaq status
# → Network summary + RPC + WSS endpoints + currency + chain ID
#   Reaches both Substrate and EVM and reports latency.

pnpm peaq health
# → JSON with per-endpoint health. Exits 0 if both up, 1 otherwise.
#   Use this in k8s liveness/readiness probes.
```

### DIDs

```bash
pnpm peaq did write-doc did:peaq:5GrwvaEFyM...
# Reads a DID document from stdin, validates against the peaq DID spec, submits.

pnpm peaq did resolve <did|address>
# W3C-style resolution result.

pnpm peaq did add-attribute \
  --did did:peaq:5GrwvaEFyM... \
  --name service \
  --value '{"id":"did:peaq:.../svc-1","type":"payment","serviceEndpoint":"https://..."}'

pnpm peaq did read-attribute did:peaq:5GrwvaEFyM... service
```

### Anchor a Merkle root

Anchoring is the core daily operation. We submit a Merkle root over yesterday's audit-log to peaq, so any auditor can prove a single event.

```bash
# Preview the root before submitting (sanity check)
pnpm peaq anchor preview --leaves leaves.json

# Submit via EVM (default; cheaper, easier tooling)
pnpm peaq anchor submit \
  --workspace-id roam \
  --anchor-date 2026-05-07 \
  --leaves leaves.json \
  --via evm

# Submit via Substrate (data-rich path, uses peaqStorage)
pnpm peaq anchor submit \
  --workspace-id roam \
  --anchor-date 2026-05-07 \
  --leaves leaves.json \
  --via substrate

# Verify an existing anchor on-chain
pnpm peaq anchor verify-on-chain \
  --tx-hash 0x... \
  --root <64-hex>
```

`leaves.json` is a JSON array of 64-hex strings — one per leaf in the tree.

### peaqStorage

```bash
pnpm peaq storage put \
  --type "axi.profile" \
  --value '{"foo":"bar"}'

pnpm peaq storage update \
  --type "axi.profile" \
  --value '{"foo":"baz"}'

pnpm peaq storage get <owner-address> "axi.profile"
```

---

## Common workflows

### Daily anchor cron (via EVM)

```bash
# In a cron job at 00:05 UTC daily:
pnpm peaq anchor submit \
  --workspace-id "$WORKSPACE_ID" \
  --anchor-date "$(date -u -d 'yesterday' +%Y-%m-%d)" \
  --leaves "/var/anchor/leaves-$(date -u -d 'yesterday' +%Y-%m-%d).json" \
  --via evm
```

The library has built-in idempotency on `(workspace_id, anchor_date)`, so a retry won't double-submit.

### Onboard a new vehicle

```bash
# 1. Generate the DID document for the vehicle's tracker
node scripts/build-did-doc.js --tracker-pubkey 0x... > /tmp/doc.json

# 2. Submit it to peaqDid
cat /tmp/doc.json | pnpm peaq did write-doc did:peaq:5GrwvaEFyM...

# 3. Confirm it resolves
pnpm peaq did resolve did:peaq:5GrwvaEFyM...
```

### Pre-flight before going to mainnet

```bash
PEAQ_NETWORK=agung pnpm peaq status
PEAQ_NETWORK=agung pnpm peaq health

# Submit a small anchor to Agung
PEAQ_NETWORK=agung pnpm peaq anchor submit \
  --workspace-id smoke-test \
  --anchor-date "$(date -u +%Y-%m-%d)" \
  --leaves test-leaves.json \
  --via evm

# Repeat for mainnet only after success above
PEAQ_NETWORK=mainnet pnpm peaq status
```

---

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Network or signer unhealthy |
| 2 | Bad input (validation failed) |
| 3 | On-chain submission failed permanently (e.g. balance too low) |
| 4 | Idempotent no-op (already submitted) |

Useful in scripts: `pnpm peaq health` returning 1 means the chain is unreachable, not that your config is wrong.

---

## Tips

- The CLI never logs your private key or mnemonic. Even at `LOG_LEVEL=debug`, sensitive fields are redacted.
- Add `--verbose` to any command to see the full structured log line per RPC call.
- Set `LOG_LEVEL=debug` for a deeper trace through retries.
- Mnemonic in env vs KMS: development uses the env mnemonic; production should swap in a KMS-backed signer (see the library README).

---

## Troubleshooting

**`pnpm peaq status` hangs:**
The default WSS endpoint is unreachable. Try `PEAQ_WSS_RPC=wss://wss-async.agung.peaq.network`.

**`anchor submit` fails with "balance too low":**
Top up your signer wallet. The retry classifier short-circuits permanent errors instead of burning gas re-trying.

**`did write-doc` rejects the document:**
The Zod validator gives a precise field path. Read the error; it tells you exactly which field is missing or malformed.

**`anchor verify-on-chain` returns false:**
Either the txHash isn't an anchor transaction, or the leaves you used to compute the expected root don't match what was submitted. Run `anchor preview` against the original leaves to compare.

---

## License

Apache-2.0.
