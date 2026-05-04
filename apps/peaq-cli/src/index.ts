#!/usr/bin/env node
import { Command } from "commander";
import { buildAnchorCommand } from "./commands/anchor/index.js";
import { buildDidCommand } from "./commands/did/index.js";
import { buildHealthCommand } from "./commands/health/index.js";
import { buildStatusCommand } from "./commands/status/index.js";
import { buildStorageCommand } from "./commands/storage/index.js";

const program = new Command();

program
  .name("peaq")
  .description("AXI Mobility peaq operator CLI: did + anchor + storage + status")
  .version("0.1.0");

program.addCommand(buildStatusCommand());
program.addCommand(buildHealthCommand());
program.addCommand(buildDidCommand());
program.addCommand(buildAnchorCommand());
program.addCommand(buildStorageCommand());

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
