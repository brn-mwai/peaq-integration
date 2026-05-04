import { Command } from "commander";
import kleur from "kleur";
import { buildContext } from "../../lib/context.js";

export function buildStorageCommand(): Command {
  const cmd = new Command("storage").description("peaqStorage pallet ops: put / get / update");

  cmd
    .command("put")
    .description("peaqStorage.addItem: add a typed item")
    .requiredOption("--type <t>", "Item type (1-64 chars)")
    .requiredOption("--value <v>", "Item value (string)")
    .action(async (opts: { type: string; value: string }) => {
      const ctx = await buildContext({ needsSigner: true });
      try {
        const r = await ctx.storage.addItem(opts.type, opts.value);
        console.log(kleur.green(`✓ peaqStorage.addItem submitted`));
        console.log(`  txHash:       ${r.txHash}`);
        console.log(`  blockNumber:  ${r.blockNumber}`);
        console.log(`  itemType:     ${r.itemType}`);
      } finally {
        await ctx.disconnect();
      }
    });

  cmd
    .command("update")
    .description("peaqStorage.updateItem: replace value for an existing typed item")
    .requiredOption("--type <t>", "Item type")
    .requiredOption("--value <v>", "New value")
    .action(async (opts: { type: string; value: string }) => {
      const ctx = await buildContext({ needsSigner: true });
      try {
        const r = await ctx.storage.updateItem(opts.type, opts.value);
        console.log(kleur.green(`✓ peaqStorage.updateItem submitted | block=${r.blockNumber}`));
      } finally {
        await ctx.disconnect();
      }
    });

  cmd
    .command("get <owner> <type>")
    .description("peaqStorage.itemStore: read by owner + type")
    .action(async (owner: string, type: string) => {
      const ctx = await buildContext();
      try {
        const r = await ctx.storage.getItem(owner, type);
        if (!r.value) {
          console.log(kleur.gray(`(no item)`));
        } else {
          console.log(`  value (hex):  ${r.value}`);
        }
      } finally {
        await ctx.disconnect();
      }
    });

  return cmd;
}
