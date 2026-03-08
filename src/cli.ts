#!/usr/bin/env bun
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerCardCommands } from "./commands/cards.js";

const program = new Command();

program
  .name("payall")
  .description("Payall CLI - Crypto card management from the terminal")
  .version("0.1.0");

registerAuthCommands(program);
registerCardCommands(program);

program.parse();
