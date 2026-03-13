import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { loadWalletKey } from "../auth/store.js";
import { formatAddress } from "../auth/wallet.js";
import { getAllBalances } from "../wallet/balance.js";
import { sendUsdt, type SendError } from "../wallet/send.js";
import { CHAINS } from "../wallet/chains.js";
import { renderTable } from "../ui/table.js";

function requireWalletKey(): string {
  const key = loadWalletKey();
  if (!key) {
    console.error(
      chalk.red(
        "No saved wallet key. Run: payall auth login --save-key"
      )
    );
    process.exit(1);
  }
  return key;
}

function printManualFallback(toAddress: string, amount: string, chain: string) {
  console.log();
  console.log(chalk.yellow("Send manually using any wallet app:"));
  console.log(`  Chain:   ${chain.toUpperCase()}`);
  console.log(`  Token:   USDT`);
  console.log(`  To:      ${toAddress}`);
  console.log(`  Amount:  ${amount} USDT`);
}

export function registerWalletCommands(program: Command) {
  const wallet = program
    .command("wallet")
    .description("On-chain wallet commands (balance, send USDT)");

  wallet
    .command("balance")
    .description("Show USDT and gas token balances across all chains")
    .action(async () => {
      const key = requireWalletKey();
      const spinner = ora("Fetching balances across BSC, ETH, TRON...").start();

      try {
        const balances = await getAllBalances(key);
        spinner.stop();

        const rows = balances.map((b) => ({
          chain: b.chain,
          address: b.chain === "TRON" ? b.address : formatAddress(b.address),
          usdt: b.error ? chalk.red("error") : b.usdtBalance,
          gasToken: b.gasToken,
          gasBalance: b.error ? chalk.red("error") : b.gasBalance,
        }));

        renderTable(rows, [
          { key: "chain", header: "Chain", width: 8 },
          { key: "address", header: "Address", width: 38 },
          { key: "usdt", header: "USDT", width: 22, align: "right" },
          { key: "gasToken", header: "Gas Token", width: 12 },
          { key: "gasBalance", header: "Gas Balance", width: 22, align: "right" },
        ]);

        // Show errors if any
        for (const b of balances) {
          if (b.error) {
            console.log(chalk.dim(`  ${b.chain}: ${b.error}`));
          }
        }
      } catch (err: unknown) {
        spinner.fail("Failed to fetch balances");
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
      }
    });

  wallet
    .command("send")
    .description("Send USDT on EVM chains (BSC, ETH)")
    .requiredOption("--to <address>", "Destination address (0x...)")
    .requiredOption("--amount <amount>", "Amount of USDT to send")
    .requiredOption("--chain <chain>", "Chain to send on (bsc, eth)")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (opts) => {
      const key = requireWalletKey();
      const chain = opts.chain.toLowerCase();

      // Validate chain
      if (chain === "tron") {
        console.error(
          chalk.yellow(
            "TRON sends are not yet supported. Please send manually using a TRON wallet."
          )
        );
        printManualFallback(opts.to, opts.amount, "tron");
        process.exit(1);
      }

      if (!CHAINS[chain] || CHAINS[chain].type !== "evm") {
        console.error(
          chalk.red(`Invalid chain "${opts.chain}". Supported: bsc, eth`)
        );
        process.exit(1);
      }

      // Validate address format
      if (!opts.to.match(/^0x[0-9a-fA-F]{40}$/)) {
        console.error(chalk.red("Invalid address format. Expected 0x... (40 hex chars)"));
        process.exit(1);
      }

      // Validate amount
      const amount = parseFloat(opts.amount);
      if (isNaN(amount) || amount <= 0) {
        console.error(chalk.red("Amount must be a positive number"));
        process.exit(1);
      }

      const config = CHAINS[chain];
      console.log(chalk.bold(`\nSend USDT on ${config.name}`));
      console.log(`  To:     ${opts.to}`);
      console.log(`  Amount: ${opts.amount} USDT`);
      console.log(`  Chain:  ${config.name}`);

      // Confirmation
      if (!opts.yes) {
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: "Proceed with this transfer?",
            default: false,
          },
        ]);
        if (!confirm) {
          console.log(chalk.dim("Transfer cancelled."));
          return;
        }
      }

      const spinner = ora("Sending USDT...").start();

      try {
        const result = await sendUsdt({
          privateKey: key,
          chain,
          toAddress: opts.to,
          amount: opts.amount,
        });

        spinner.succeed(chalk.green("Transfer sent!"));
        console.log(`  Tx hash: ${result.txHash}`);
      } catch (err: unknown) {
        spinner.fail("Transfer failed");

        const sendError = (err as { sendError?: SendError }).sendError;

        if (sendError) {
          switch (sendError.type) {
            case "insufficient_usdt":
              console.error(
                chalk.red(
                  `${sendError.message}: have ${sendError.details.balance}, need ${sendError.details.required}`
                )
              );
              console.log(
                chalk.dim(
                  "Tip: Run `payall wallet balance` to check all chains."
                )
              );
              break;
            case "insufficient_gas":
              console.error(
                chalk.red(
                  `${sendError.message}: have ${sendError.details.balance} ${sendError.details.gasToken}, need ~${sendError.details.required}`
                )
              );
              console.log(
                chalk.dim(
                  `Fund your wallet with ${sendError.details.gasToken}: ${sendError.details.walletAddress}`
                )
              );
              break;
            default:
              console.error(
                chalk.red(
                  err instanceof Error ? err.message : String(err)
                )
              );
          }
        } else {
          console.error(
            chalk.red(err instanceof Error ? err.message : String(err))
          );
        }

        // Always show manual fallback on failure
        printManualFallback(opts.to, opts.amount, chain);
        process.exit(1);
      }
    });
}
