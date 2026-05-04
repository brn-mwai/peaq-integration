import { Command } from "commander";
import kleur from "kleur";
import { buildContext } from "../../lib/context.js";

export function buildHealthCommand(): Command {
  const cmd = new Command("health").description("Probe substrate + EVM endpoints, exit 0 only if healthy");

  cmd.action(async () => {
    const ctx = await buildContext();
    try {
      const subHealth = await ctx.substrate.health();
      const evmHealth = await ctx.evm.health();
      const ok = subHealth.ok && evmHealth.ok;
      console.log(JSON.stringify({ substrate: subHealth, evm: evmHealth, ok }, null, 2));
      if (!ok) {
        console.log(kleur.red("✗ unhealthy"));
        process.exit(1);
      }
      console.log(kleur.green("✓ healthy"));
    } finally {
      await ctx.disconnect();
    }
  });

  return cmd;
}
