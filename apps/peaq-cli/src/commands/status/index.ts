import { Command } from "commander";
import kleur from "kleur";
import { resolveNetwork, env } from "@aximobility/peaq-integration";
import { buildContext } from "../../lib/context.js";

export function buildStatusCommand(): Command {
  const cmd = new Command("status").description("Show network + endpoint + signer state");

  cmd.action(async () => {
    const network = resolveNetwork(env.PEAQ_NETWORK);
    console.log(kleur.bold().cyan(`\npeaq integration status\n`));
    console.log(`  network:           ${network.name}`);
    console.log(`  chain id (EVM):    ${network.chainId}`);
    console.log(`  native currency:   ${network.nativeCurrency.symbol}`);
    console.log(`  ss58 prefix:       ${network.ss58Prefix}`);
    console.log(`  para id:           ${network.paraId ?? kleur.gray("n/a")}`);
    console.log(`  wss endpoints:     ${network.endpoints.wssRpc.length}`);
    console.log(`  https endpoints:   ${network.endpoints.httpsRpc.length}`);
    console.log(`  block explorer:    ${network.endpoints.blockExplorer[0]}`);

    const ctx = await buildContext();
    try {
      const subHealth = await ctx.substrate.health();
      const evmHealth = await ctx.evm.health();
      console.log(kleur.bold(`\nLive checks`));
      console.log(`  substrate:         ${subHealth.ok ? kleur.green("up") : kleur.red("down")}${subHealth.chain ? ` (${subHealth.chain}, finalized=${subHealth.finalized})` : ""}`);
      if (!subHealth.ok && subHealth.reason) console.log(kleur.red(`    reason: ${subHealth.reason}`));
      console.log(`  evm:               ${evmHealth.ok ? kleur.green("up") : kleur.red("down")}${evmHealth.chainId ? ` (chain=${evmHealth.chainId}, block=${evmHealth.blockNumber})` : ""}`);
      if (!evmHealth.ok && evmHealth.reason) console.log(kleur.red(`    reason: ${evmHealth.reason}`));
      console.log(`  substrate signer:  ${ctx.substrate.signerAddress() ?? kleur.gray("none")}`);
      console.log(`  evm signer:        ${ctx.evm.signerAddress() ?? kleur.gray("none")}`);
    } finally {
      await ctx.disconnect();
    }
  });

  return cmd;
}
