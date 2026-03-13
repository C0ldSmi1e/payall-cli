#!/usr/bin/env bun
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerCardCommands } from "./commands/cards.js";
import { registerWalletCommands } from "./commands/wallet.js";

const program = new Command();

program
  .name("payall")
  .description("Payall CLI - Crypto card management from the terminal")
  .version("0.1.0");

registerAuthCommands(program);
registerCardCommands(program);
registerWalletCommands(program);

program.parse();
