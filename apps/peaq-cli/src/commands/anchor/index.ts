import { Command } from "commander";
import kleur from "kleur";
import { buildMerkleTree, verifyOnChain } from "@aximobility/peaq-integration";
import { buildContext } from "../../lib/context.js";

export function buildAnchorCommand(): Command {
  const cmd = new Command("anchor").description("Daily Merkle anchor: preview / submit / verify on-chain");

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
    .description("Submit a Merkle anchor via EVM (calldata = root) or Substrate (peaqStorage.addItem)")
    .requiredOption("--workspace-id <id>", "Workspace identifier (label only)")
    .requiredOption("--anchor-date <yyyy-mm-dd>", "Date the anchor covers")
    .requiredOption("--leaves <path>", "Path to JSON file of leaf hashes")
    .option("--via <kind>", "evm | substrate", "evm")
    .action(async (opts: { workspaceId: string; anchorDate: string; leaves: string; via?: string }) => {
      const fs = await import("node:fs/promises");
      const text = await fs.readFile(opts.leaves, "utf8");
      const leafHashes = JSON.parse(text) as string[];
      const ctx = await buildContext({ needsSigner: opts.via !== "evm" });
      try {
        if (opts.via === "substrate") {
          const r = await ctx.anchor.submitViaSubstrate({
            workspaceId: opts.workspaceId,
            anchorDate: opts.anchorDate,
            leafHashes,
          });
          console.log(kleur.green(`✓ Anchor submitted via Substrate`));
          console.log(`  txHash:       ${r.txHash}`);
          console.log(`  blockNumber:  ${r.blockNumber}`);
          console.log(`  itemType:     ${r.itemType}`);
          console.log(`  rootHex:      ${r.rootHex}`);
        } else {
          const r = await ctx.anchor.submitViaEvm({
            workspaceId: opts.workspaceId,
            anchorDate: opts.anchorDate,
            leafHashes,
          });
          console.log(kleur.green(`✓ Anchor submitted via EVM`));
          console.log(`  txHash:       ${r.txHash}`);
          console.log(`  toAddress:    ${r.toAddress}`);
          console.log(`  rootHex:      ${r.rootHex}`);
          console.log(`  attempts:     ${r.attempts}`);
          console.log(`  duration:     ${r.durationMs}ms`);
        }
      } finally {
        await ctx.disconnect();
      }
    });

  cmd
    .command("verify-on-chain")
    .description("Verify an anchor tx on-chain: receipt OK + calldata matches expected root")
    .requiredOption("--tx-hash <hash>", "0x… anchor tx hash")
    .requiredOption("--root <root>", "Expected Merkle root in 64-hex (no 0x)")
    .action(async (opts: { txHash: string; root: string }) => {
      const ctx = await buildContext();
      try {
        const r = await verifyOnChain({
          evm: ctx.evm,
          txHash: opts.txHash as `0x${string}`,
          expectedRootHexNo0x: opts.root,
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
