import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import {
  validatePrivateKey,
  getAddressFromKey,
  signLoginMessageForChain,
  formatAddress,
  type ChainType,
} from "../auth/wallet.js";
import {
  saveCredentials,
  loadCredentials,
  clearCredentials,
  saveWalletKey,
  loadWalletKey,
  clearWalletKey,
} from "../auth/store.js";
import { api } from "../api/client.js";

interface LoginResponse {
  user_token: string;
  account: string;
  user_id: number;
  login_type: number;
}

export function registerAuthCommands(program: Command) {
  const auth = program.command("auth").description("Authentication commands");

  auth
    .command("login")
    .description("Login with EVM or Tron wallet (auto-registers if new)")
    .option("--save-key", "Save wallet private key (encrypted) for future logins")
    .option("--forget-key", "Remove saved wallet key before login")
    .option("-k, --key <private_key>", "Private key (skips prompt)")
    .option("-c, --chain <chain>", "Chain type: evm or tron")
    .option("--invite <code>", "Invite code (for first-time registration)")
    .action(async (opts) => {
      try {
        // Handle --forget-key
        if (opts.forgetKey) {
          clearWalletKey();
          console.log(chalk.dim("Saved wallet key removed."));
        }

        let privateKey: string | null = null;
        let chain: ChainType | null = opts.chain || null;

        // Validate --chain flag
        if (chain && chain !== "evm" && chain !== "tron") {
          console.error(chalk.red('Invalid chain. Use "evm" or "tron".'));
          process.exit(1);
        }

        // Try to use saved key first
        const saved = loadWalletKey();
        if (saved && !opts.forgetKey) {
          const address = getAddressFromKey(saved.key, chain || saved.chain);
          console.log(
            chalk.dim(
              `Using saved wallet ${formatAddress(address)} (${(chain || saved.chain).toUpperCase()})`
            )
          );
          privateKey = saved.key;
          if (!chain) chain = saved.chain;
        }

        // Use --key flag if provided
        if (!privateKey && opts.key) {
          const keyInput = opts.key.trim();
          if (!validatePrivateKey(keyInput)) {
            console.error(chalk.red("Invalid private key format"));
            process.exit(1);
          }
          privateKey = keyInput;
        }

        // Prompt for key if not available
        if (!privateKey) {
          const { key } = await inquirer.prompt([
            {
              type: "password",
              name: "key",
              message: "Enter your private key:",
              mask: "*",
              validate: (input: string) => {
                if (!input.trim()) return "Private key is required";
                if (!validatePrivateKey(input.trim()))
                  return "Invalid private key format";
                return true;
              },
            },
          ]);
          privateKey = key.trim();
        }

        // Prompt for chain if not resolved
        if (!chain) {
          const { selectedChain } = await inquirer.prompt([
            {
              type: "list",
              name: "selectedChain",
              message: "Select chain:",
              choices: [
                { name: "EVM (Ethereum/BSC/Polygon)", value: "evm" },
                { name: "TRON", value: "tron" },
              ],
            },
          ]);
          chain = selectedChain as ChainType;
        }

        const address = getAddressFromKey(privateKey, chain);
        console.log(chalk.dim(`  Chain:   ${chain.toUpperCase()}`));
        console.log(chalk.dim(`  Address: ${address}`));

        const spinner = ora("Signing login message...").start();

        // Sign the message
        const { wallet_address, signature, timestamp } =
          await signLoginMessageForChain(privateKey, chain);

        spinner.text = "Authenticating...";

        // Call the API
        const { data } = await api<LoginResponse>("userLogin", {
          body: {
            type: 1,
            wallet_address,
            signature,
            timestamp,
            inviteCode: opts.invite || "",
          },
          auth: false,
        });

        // Calculate expiry (180 days from now)
        const expiresAt = Math.floor(Date.now() / 1000) + 3600 * 24 * 180;

        // Save credentials
        saveCredentials({
          token: data.user_token,
          email: wallet_address,
          user_id: data.user_id,
          login_type: data.login_type,
          expires_at: expiresAt,
          chain,
        });

        // Save key if requested
        if (opts.saveKey) {
          saveWalletKey(privateKey, chain);
          spinner.succeed(
            chalk.green(`Logged in as ${formatAddress(wallet_address)}`) +
              chalk.dim(` (user_id: ${data.user_id}). Key saved.`)
          );
        } else {
          spinner.succeed(
            chalk.green(`Logged in as ${formatAddress(wallet_address)}`) +
              chalk.dim(` (user_id: ${data.user_id})`)
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`Login failed: ${msg}`));
        process.exit(1);
      }
    });

  auth
    .command("status")
    .description("Show current login status")
    .action(async () => {
      const creds = loadCredentials();
      if (!creds) {
        console.log(chalk.yellow("Not logged in. Run: payall auth login"));
        return;
      }

      const expiresDate = new Date(creds.expires_at * 1000);
      const now = new Date();
      const daysLeft = Math.floor(
        (expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysLeft <= 0) {
        console.log(chalk.yellow("Session expired. Run: payall auth login"));
        clearCredentials();
        return;
      }

      console.log(chalk.green("Logged in"));
      console.log(chalk.dim(`  Account:  ${formatAddress(creds.email)}`));
      console.log(chalk.dim(`  Chain:    ${(creds.chain || "evm").toUpperCase()}`));
      console.log(chalk.dim(`  User ID:  ${creds.user_id}`));
      console.log(chalk.dim(`  Expires:  ${expiresDate.toLocaleDateString()} (${daysLeft} days)`));

      const saved = loadWalletKey();
      if (saved) {
        console.log(chalk.dim(`  Saved key: yes (${saved.chain})`));
      } else {
        console.log(chalk.dim(`  Saved key: no`));
      }
    });

  auth
    .command("logout")
    .description("Logout and clear session")
    .action(async () => {
      const creds = loadCredentials();
      if (!creds) {
        console.log(chalk.yellow("Not logged in."));
        return;
      }

      const spinner = ora("Logging out...").start();
      try {
        await api("loginOut", { method: "GET" });
        spinner.succeed("Logged out from server.");
      } catch {
        spinner.warn("Could not reach server, clearing local session.");
      }

      clearCredentials();
      console.log(chalk.green("Local session cleared."));
    });

  auth
    .command("forget-key")
    .description("Remove saved wallet private key")
    .action(() => {
      const hasKey = loadWalletKey() !== null;
      if (!hasKey) {
        console.log(chalk.yellow("No saved key found."));
        return;
      }
      clearWalletKey();
      console.log(chalk.green("Saved wallet key removed."));
    });
}
