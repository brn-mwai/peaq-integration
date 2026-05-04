import { Command } from "commander";
import kleur from "kleur";
import { peaqDidDocumentSchema } from "@aximobility/peaq-integration";
import { buildContext } from "../../lib/context.js";

export function buildDidCommand(): Command {
  const cmd = new Command("did").description("peaq DID operations: create / read / update / remove / resolve");

  cmd
    .command("add-attribute")
    .description("Add a DID attribute (peaqDid.addAttribute)")
    .requiredOption("--did <did>", "did:peaq:<id> the attribute belongs to")
    .requiredOption("--name <name>", "Attribute name (1-64 chars)")
    .requiredOption("--value <value>", "Attribute value (string; binary not yet wired in CLI)")
    .option("--validity-days <n>", "Days the attribute is valid", "")
    .action(async (opts: { did: string; name: string; value: string; validityDays?: string }) => {
      const ctx = await buildContext({ needsSigner: true });
      try {
        const r = await ctx.did.issuer.addAttribute({
          did: opts.did,
          name: opts.name,
          value: opts.value,
          ...(opts.validityDays ? { validityDays: Number.parseInt(opts.validityDays, 10) } : {}),
        });
        console.log(kleur.green(`✓ peaqDid.addAttribute submitted`));
        console.log(`  txHash:       ${r.txHash}`);
        console.log(`  blockHash:    ${r.blockHash}`);
        console.log(`  blockNumber:  ${r.blockNumber}`);
        console.log(`  did:          ${r.did}`);
        console.log(`  attribute:    ${r.attributeName}`);
        console.log(`  duration:     ${r.durationMs}ms`);
      } finally {
        await ctx.disconnect();
      }
    });

  cmd
    .command("read-attribute <did> <name>")
    .description("Read a single DID attribute")
    .action(async (did: string, name: string) => {
      const ctx = await buildContext();
      try {
        const r = await ctx.did.issuer.readAttribute(did, name);
        if (!r.value) {
          console.log(kleur.gray(`(no attribute "${name}" on ${did})`));
          return;
        }
        console.log(`  value (hex):     ${r.value}`);
        console.log(`  validity block:  ${r.validityBlock ?? "-"}`);
        console.log(`  created block:   ${r.createdBlock ?? "-"}`);
      } finally {
        await ctx.disconnect();
      }
    });

  cmd
    .command("write-doc <did>")
    .description("Write a full DID document (JSON via stdin)")
    .action(async (did: string) => {
      const stdin = await readStdinJson();
      const document = peaqDidDocumentSchema.parse(stdin);
      const ctx = await buildContext({ needsSigner: true });
      try {
        const r = await ctx.did.issuer.writeDocument(did, document);
        console.log(kleur.green(`✓ DID document written`));
        console.log(`  txHash:       ${r.txHash}`);
        console.log(`  blockNumber:  ${r.blockNumber}`);
      } finally {
        await ctx.disconnect();
      }
    });

  cmd
    .command("resolve <didOrAddress>")
    .description("Resolve a DID document (W3C-style resolution result)")
    .action(async (didOrAddress: string) => {
      const ctx = await buildContext();
      try {
        const result = await ctx.did.resolver.resolve(didOrAddress);
        console.log(JSON.stringify(result, null, 2));
      } finally {
        await ctx.disconnect();
      }
    });

  return cmd;
}

async function readStdinJson(): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(data) as Record<string, unknown>);
      } catch (e) {
        reject(new Error(`stdin not valid JSON: ${(e as Error).message}`));
      }
    });
    process.stdin.on("error", reject);
  });
}
