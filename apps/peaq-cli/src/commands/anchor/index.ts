import {
  IdempotencyCache,
  InMemoryIdempotencyStore,
  buildMerkleTree,
  verifyOnChain,
} from "@aximobility/peaq-integration";
import { Command } from "commander";
import kleur from "kleur";
import { buildContext } from "../../lib/context.js";

// Process-scoped idempotency cache so a re-run of `anchor submit` with the same
// (workspaceId, anchorDate, via) inside one CLI invocation is a no-op. The cache
// is in-memory only; for cross-process / cross-restart safety, callers integrating
// the library directly should pass a persistent IdempotencyStore.
const cliAnchorCache = new IdempotencyCache<unknown>(new InMemoryIdempotencyStore<unknown>());

export function buildAnchorCommand(): Command {
  const cmd = new Command("anchor").description(
    "Daily Merkle anchor: preview / submit / verify on-chain",
  );

  cmd
    .command("preview")
    .description("Compute the Merkle root for a JSON file of leaf hashes (no submission)")
    .requiredOption("--leaves <path>", "Path to JSON file of leaf hashes")
    .action(async (opts: { leaves: string }) => {
      const fs = await import("node:fs/promises");
      const text = await fs.readFile(opts.leaves, "utf8");
      const leafHashes = JSON.parse(text) as string[];
      const tree = buildMerkleTree(leafHashes);
      console.log(`  leaf count:   ${tree.leafHashes.length}`);
      console.log(`  Merkle root:  ${tree.root}`);
    });

  cmd
    .command("submit")
    .description(
      "Submit a Merkle anchor via EVM (calldata = root) or Substrate (peaqStorage.addItem)",
    )
    .requiredOption("--workspace-id <id>", "Workspace identifier (label only)")
    .requiredOption("--anchor-date <yyyy-mm-dd>", "Date the anchor covers")
    .requiredOption("--leaves <path>", "Path to JSON file of leaf hashes")
    .option("--via <kind>", "evm | substrate", "evm")
    .action(
      async (opts: { workspaceId: string; anchorDate: string; leaves: string; via?: string }) => {
        const fs = await import("node:fs/promises");
        const text = await fs.readFile(opts.leaves, "utf8");
        const leafHashes = JSON.parse(text) as string[];
        const ctx = await buildContext({ needsSigner: opts.via !== "evm" });
        const idempotencyKey = `anchor:${opts.via ?? "evm"}:${opts.workspaceId}:${opts.anchorDate}`;
        try {
          if (opts.via === "substrate") {
            const { receipt, cached } = await cliAnchorCache.getOrCompute(idempotencyKey, () =>
              ctx.anchor.submitViaSubstrate({
                workspaceId: opts.workspaceId,
                anchorDate: opts.anchorDate,
                leafHashes,
              }),
            );
            const r = receipt as Awaited<ReturnType<typeof ctx.anchor.submitViaSubstrate>>;
            console.log(
              kleur.green(
                `✓ Anchor submitted via Substrate${cached ? " (idempotent cache hit)" : ""}`,
              ),
            );
            console.log(`  txHash:       ${r.txHash}`);
            console.log(`  blockNumber:  ${r.blockNumber}`);
            console.log(`  itemType:     ${r.itemType}`);
            console.log(`  rootHex:      ${r.rootHex}`);
          } else {
            const { receipt, cached } = await cliAnchorCache.getOrCompute(idempotencyKey, () =>
              ctx.anchor.submitViaEvm({
                workspaceId: opts.workspaceId,
                anchorDate: opts.anchorDate,
                leafHashes,
              }),
            );
            const r = receipt as Awaited<ReturnType<typeof ctx.anchor.submitViaEvm>>;
            console.log(
              kleur.green(`✓ Anchor submitted via EVM${cached ? " (idempotent cache hit)" : ""}`),
            );
            console.log(`  txHash:       ${r.txHash}`);
            console.log(`  toAddress:    ${r.toAddress}`);
            console.log(`  rootHex:      ${r.rootHex}`);
            console.log(`  attempts:     ${r.attempts}`);
            console.log(`  duration:     ${r.durationMs}ms`);
          }
        } finally {
          await ctx.disconnect();
        }
      },
    );

  cmd
    .command("verify-on-chain")
    .description("Verify an anchor tx on-chain: receipt OK + calldata matches expected root")
    .requiredOption("--tx-hash <hash>", "0x… anchor tx hash")
    .requiredOption("--root <root>", "Expected Merkle root in 64-hex (no 0x)")
    .option(
      "--anchored-by <address>",
      "0x… address that should have sent the anchor tx (AXI anchor wallet)",
    )
    .action(async (opts: { txHash: string; root: string; anchoredBy?: string }) => {
      const ctx = await buildContext();
      try {
        if (!opts.anchoredBy) {
          console.log(
            kleur.yellow(
              "! --anchored-by not set: verifying root presence only, not who anchored it",
            ),
          );
        }
        const r = await verifyOnChain({
          evm: ctx.evm,
          txHash: opts.txHash as `0x${string}`,
          expectedRootHexNo0x: opts.root,
          ...(opts.anchoredBy ? { expectedFrom: opts.anchoredBy as `0x${string}` } : {}),
        });
        if (r.valid) {
          console.log(kleur.green(`✓ verified | block=${r.blockNumber}`));
        } else {
          console.log(kleur.red(`✗ ${r.reason}`));
          process.exit(1);
        }
      } finally {
        await ctx.disconnect();
      }
    });

  return cmd;
}
