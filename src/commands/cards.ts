import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { api, pathApi, ApiError } from "../api/client.js";
import { renderTable, renderKeyValue } from "../ui/table.js";
import { formatStatus, formatBoolean, formatCurrency, parseFees, feeValue, truncate } from "../ui/format.js";
import { loadCredentials } from "../auth/store.js";

interface Card {
  id: number;
  card_id: string;
  card_name: string;
  card_type: string;
  brand: string;
  currency: string;
  kyc_required: number;
  fees: string | object;
  general_ratings: number;
  is_apply: number;
  binding_status: string;
  is_collected: boolean;
  card_binding_id?: number;
  google_pay_support?: number;
  apple_wallet_support?: number;
  wechat_pay_support?: number;
  alipay_support?: number;
  chatgpt_pay_support?: number;
  description?: string;
  card_image_large?: string;
  [key: string]: unknown;
}

interface CardListResponse {
  cards: Card[];
  recommend_reason?: string;
}

interface BoundCard {
  card_binding_id: number;
  payall_card_id: number;
  card_name: string;
  card_number: string;
  brand: string;
  currency: string;
  status: string;
  binding_status: string;
  card_balance: number | string;
  nickname: string;
  binding_time: string;
  [key: string]: unknown;
}

interface CardDetailResponse {
  card_number: string;
  cvv: string;
  expiry_date: string;
  card_balance: number | string;
  brand: string;
  currency: string;
  status: string;
  [key: string]: unknown;
}

interface FeeQuoteResponse {
  fee_info: {
    card_amount?: string;
    charge_fee?: string;
    charge_fee_rate?: string;
    exchange_rate?: string;
    open_card_fee?: string;
    total_amount?: string;
    [key: string]: unknown;
  };
}

export function registerCardCommands(program: Command) {
  const cards = program.command("cards").description("Card marketplace and management");

  // --- cards list ---
  cards
    .command("list")
    .description("Browse card marketplace")
    .option("-s, --search <keyword>", "Search by card name")
    .option("--sort <type>", "Sort by: general, benefit, privacy, fees")
    .option("--sort-dir <dir>", "Sort direction: asc, desc", "desc")
    .option("--no-kyc", "Only show cards without KYC")
    .option("--kyc", "Only show cards requiring KYC")
    .action(async (opts) => {
      const spinner = ora("Loading cards...").start();
      try {
        const params = new URLSearchParams();
        if (opts.search) params.set("keyword", opts.search);
        if (opts.sort) params.set("sort_type", opts.sort);
        if (opts.sortDir) params.set("sort_direction", opts.sortDir);
        if (opts.noKyc === false) {
          // --no-kyc flag was explicitly passed
          params.set("filters", JSON.stringify({ no_kyc: 1 }));
        } else if (opts.kyc) {
          params.set("filters", JSON.stringify({ kyc_required: 1 }));
        }

        const qs = params.toString();
        const { data } = await api<CardListResponse | Card[]>(
          `cards_list${qs ? "?" + qs : ""}`,
          { method: "GET", auth: false }
        );

        spinner.stop();

        const cardsList = Array.isArray(data) ? data : (data as CardListResponse).cards;
        const reason = !Array.isArray(data) ? (data as CardListResponse).recommend_reason : null;

        if (!cardsList || cardsList.length === 0) {
          console.log(chalk.yellow("No cards found."));
          return;
        }

        if (reason) {
          console.log(chalk.cyan(`AI Recommendation: ${reason}\n`));
        }

        renderTable(cardsList as unknown as Record<string, unknown>[], [
          { key: "id", header: "ID", width: 6, align: "right" },
          {
            key: "card_name",
            header: "Name",
            width: 28,
            format: (v) => truncate(String(v || ""), 26),
          },
          { key: "brand", header: "Brand", width: 12 },
          { key: "currency", header: "Currency", width: 10 },
          {
            key: "kyc_required",
            header: "KYC",
            width: 7,
            format: (v) => formatBoolean(v),
          },
          {
            key: "general_ratings",
            header: "Rating",
            width: 9,
            align: "right",
            format: (v) => {
              const n = Number(v);
              return isNaN(n) ? chalk.dim("-") : n.toFixed(1);
            },
          },
          {
            key: "fees",
            header: "Open Fee",
            width: 12,
            align: "right",
            format: (v) => {
              const fees = parseFees(v as string);
              return feeValue(fees, "issuanceFee");
            },
          },
          {
            key: "is_apply",
            header: "Applied",
            width: 10,
            format: (v, row) => {
              if (v === 1) return formatStatus(row.binding_status as string);
              return chalk.dim("-");
            },
          },
        ]);

        console.log(chalk.dim(`\n  ${cardsList.length} cards total`));
      } catch (err: unknown) {
        spinner.fail("Failed to load cards");
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
      }
    });

  // --- cards info <id> ---
  cards
    .command("info <card_id>")
    .description("Show card details")
    .action(async (cardId: string) => {
      const spinner = ora("Loading card info...").start();
      try {
        const { data } = await api<Card[]>(`cards/id?card_ids=${cardId}`, {
          method: "GET",
          auth: false,
        });

        spinner.stop();

        const cardList = Array.isArray(data) ? data : [data];
        if (!cardList.length) {
          console.log(chalk.yellow("Card not found."));
          return;
        }

        const card = cardList[0];
        const fees = parseFees(card.fees);

        console.log(chalk.bold.cyan(`\n  ${card.card_name}`));
        console.log();

        renderKeyValue([
          ["ID", String(card.id)],
          ["Brand", String(card.brand || "-")],
          ["Currency", String(card.currency || "-")],
          ["Type", String(card.card_type || "-")],
          ["KYC Required", card.kyc_required ? "Yes" : "No"],
          ["Rating", card.general_ratings ? `${Number(card.general_ratings).toFixed(1)} / 5.0` : "-"],
          ["Google Pay", formatBoolean(card.google_pay_support)],
          ["Apple Pay", formatBoolean(card.apple_wallet_support)],
          ["WeChat Pay", formatBoolean(card.wechat_pay_support)],
          ["Alipay", formatBoolean(card.alipay_support)],
          ["ChatGPT Pay", formatBoolean(card.chatgpt_pay_support)],
        ]);

        console.log(chalk.bold("\n  Fees:"));
        const feeEntries = Object.entries(fees);
        if (feeEntries.length === 0) {
          console.log(chalk.dim("    No fee data available"));
        } else {
          for (const [name, info] of feeEntries) {
            const label = name.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
            if (info && typeof info === "object" && "value" in info) {
              const val = info.value === 0 ? chalk.green("Free") : `${info.value} ${info.unit || ""}`;
              console.log(`    ${chalk.dim(label.padEnd(22))}${val}`);
            } else {
              const val = info === 0 ? chalk.green("Free") : String(info ?? "-");
              console.log(`    ${chalk.dim(label.padEnd(22))}${val}`);
            }
          }
        }

        if (card.description) {
          console.log(chalk.bold("\n  Description:"));
          console.log(`    ${card.description}`);
        }
        console.log();
      } catch (err: unknown) {
        spinner.fail("Failed to load card info");
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
      }
    });

  // --- cards compare <id1> <id2> ---
  cards
    .command("compare <id1> <id2>")
    .description("Compare two cards side by side")
    .action(async (id1: string, id2: string) => {
      const spinner = ora("Loading cards...").start();
      try {
        const { data } = await api<Card[]>(`cards/id?card_ids=${id1},${id2}`, {
          method: "GET",
          auth: false,
        });

        spinner.stop();

        const cardList = Array.isArray(data) ? data : [];
        if (cardList.length < 2) {
          console.log(chalk.yellow("Could not find both cards."));
          return;
        }

        const [a, b] = cardList;
        const feesA = parseFees(a.fees);
        const feesB = parseFees(b.fees);

        console.log(chalk.bold(`\n  Comparing: ${a.card_name} vs ${b.card_name}\n`));

        const rows: [string, string, string][] = [
          ["Brand", String(a.brand || "-"), String(b.brand || "-")],
          ["Currency", String(a.currency || "-"), String(b.currency || "-")],
          ["KYC", a.kyc_required ? "Yes" : "No", b.kyc_required ? "Yes" : "No"],
          ["Rating", a.general_ratings ? Number(a.general_ratings).toFixed(1) : "-", b.general_ratings ? Number(b.general_ratings).toFixed(1) : "-"],
          ["Issuance Fee", feeValue(feesA, "issuanceFee"), feeValue(feesB, "issuanceFee")],
          ["Annual Fee", feeValue(feesA, "annualFee"), feeValue(feesB, "annualFee")],
          ["Monthly Fee", feeValue(feesA, "monthlyFee"), feeValue(feesB, "monthlyFee")],
          ["Transaction Fee", feeValue(feesA, "transactionFee"), feeValue(feesB, "transactionFee")],
          ["ATM Fee", feeValue(feesA, "atmFee"), feeValue(feesB, "atmFee")],
          ["Google Pay", formatBoolean(a.google_pay_support), formatBoolean(b.google_pay_support)],
          ["Apple Pay", formatBoolean(a.apple_wallet_support), formatBoolean(b.apple_wallet_support)],
        ];

        const Table = (await import("cli-table3")).default;
        const table = new Table({
          head: ["", chalk.bold.cyan(truncate(a.card_name, 22)), chalk.bold.cyan(truncate(b.card_name, 22))],
          colWidths: [20, 25, 25],
          style: { head: [], border: ["dim"] },
        });

        for (const [label, valA, valB] of rows) {
          table.push([chalk.dim(label), valA, valB]);
        }

        console.log(table.toString());
        console.log();
      } catch (err: unknown) {
        spinner.fail("Failed to compare cards");
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
      }
    });

  // --- cards my ---
  cards
    .command("my")
    .description("List your bound cards")
    .action(async () => {
      const spinner = ora("Loading your cards...").start();
      try {
        const { data } = await api<{ cards: BoundCard[] } | BoundCard[]>("userCards", { method: "GET" });

        spinner.stop();

        const cardsList = Array.isArray(data) ? data : (data as { cards: BoundCard[] })?.cards || [];
        if (cardsList.length === 0) {
          console.log(chalk.yellow("No bound cards. Browse cards with: payall cards list"));
          return;
        }

        renderTable(cardsList as unknown as Record<string, unknown>[], [
          { key: "binding_id", header: "ID", width: 8, align: "right" },
          {
            key: "card_name",
            header: "Name",
            width: 24,
            format: (v) => truncate(String(v || ""), 22),
          },
          { key: "brand", header: "Brand", width: 12 },
          {
            key: "card_number",
            header: "Card No.",
            width: 18,
            format: (v) => {
              const s = String(v || "");
              if (s.includes("*")) return s.slice(-8);
              return s.length > 8 ? `****${s.slice(-4)}` : chalk.dim("-");
            },
          },
          { key: "card_currency", header: "Curr", width: 8 },
          {
            key: "balance",
            header: "Balance",
            width: 14,
            align: "right",
            format: (v, row) => formatCurrency(v as string | number, row.card_currency as string),
          },
          {
            key: "card_status",
            header: "Status",
            width: 12,
            format: (v) => formatStatus(String(v)),
          },
        ]);
      } catch (err: unknown) {
        spinner.fail("Failed to load cards");
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
      }
    });

  // --- cards detail <binding_id> ---
  cards
    .command("detail <binding_id>")
    .description("Show card details (number, CVV, balance)")
    .option("--reveal", "Show full card number and CVV")
    .action(async (bindingId: string, opts) => {
      const spinner = ora("Loading card detail...").start();
      try {
        const { data } = await api<CardDetailResponse>("cards/getCardDetail", {
          body: { related_key: bindingId, need_verify: 0 },
        });

        spinner.stop();

        if (!data) {
          console.log(chalk.yellow("Card not found."));
          return;
        }

        const mask = (val: string) => {
          if (opts.reveal) return val;
          if (!val) return chalk.dim("-");
          if (val.length > 4) return `${"*".repeat(val.length - 4)}${val.slice(-4)}`;
          return "****";
        };

        console.log(chalk.bold.cyan("\n  Card Detail\n"));

        renderKeyValue([
          ["Card Number", mask(data.card_number)],
          ["CVV", opts.reveal ? (data.cvv || "-") : "***"],
          ["Expiry", data.expiry_date || "-"],
          ["Brand", String(data.brand || "-")],
          ["Currency", String(data.currency || "-")],
          ["Balance", formatCurrency(data.card_balance, data.currency)],
          ["Status", formatStatus(String(data.status || "-"))],
        ]);

        if (!opts.reveal) {
          console.log(chalk.dim("\n  Use --reveal to show full card number and CVV"));
        }
        console.log();
      } catch (err: unknown) {
        spinner.fail("Failed to load card detail");
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
      }
    });

  // --- cards collections ---
  cards
    .command("collections")
    .description("List your favorited cards")
    .action(async () => {
      const spinner = ora("Loading collections...").start();
      try {
        const { data } = await api<Card[]>("cards/listCollections", { method: "GET" });

        spinner.stop();

        const cardsList = Array.isArray(data) ? data : [];
        if (cardsList.length === 0) {
          console.log(chalk.yellow("No favorites yet. Use: payall cards favorite <card_id>"));
          return;
        }

        renderTable(cardsList as unknown as Record<string, unknown>[], [
          { key: "id", header: "ID", width: 6, align: "right" },
          {
            key: "card_name",
            header: "Name",
            width: 28,
            format: (v) => truncate(String(v || ""), 26),
          },
          { key: "brand", header: "Brand", width: 12 },
          { key: "currency", header: "Currency", width: 10 },
          {
            key: "general_ratings",
            header: "Rating",
            width: 9,
            align: "right",
            format: (v) => {
              const n = Number(v);
              return isNaN(n) ? chalk.dim("-") : n.toFixed(1);
            },
          },
        ]);
      } catch (err: unknown) {
        spinner.fail("Failed to load collections");
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
      }
    });

  // --- cards favorite <card_id> ---
  cards
    .command("favorite <card_id>")
    .description("Toggle card favorite")
    .action(async (cardId: string) => {
      const spinner = ora("Toggling favorite...").start();
      try {
        const { data } = await api<{ is_collected: boolean }>("cards/toggleCollection", {
          body: { card_id: parseInt(cardId, 10) },
        });

        spinner.stop();

        if (data && typeof data === "object" && "is_collected" in data) {
          if (data.is_collected) {
            console.log(chalk.green(`Card ${cardId} added to favorites.`));
          } else {
            console.log(chalk.yellow(`Card ${cardId} removed from favorites.`));
          }
        } else {
          console.log(chalk.green("Favorite toggled."));
        }
      } catch (err: unknown) {
        spinner.fail("Failed to toggle favorite");
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
      }
    });

  // --- cards fees ---
  cards
    .command("fees")
    .description("Get fee quote for card open/charge/withdraw")
    .option("--card-id <id>", "Payall card ID", "23")
    .option("--type <type>", "Fee type: OPEN_CARD, CARD_CHARGE, CARD_WITHDRAW", "OPEN_CARD")
    .option("--amount <amount>", "Amount (required for CARD_CHARGE/CARD_WITHDRAW)")
    .option("--card-bin <bin>", "Card BIN (required for CARD_CHARGE/CARD_WITHDRAW)")
    .option("--currency <curr>", "Card currency", "USD")
    .action(async (opts) => {
      const spinner = ora("Getting fee quote...").start();
      try {
        const body: Record<string, unknown> = {
          charge_type: opts.type,
          card_id: opts.cardId,
          card_currency: opts.currency,
        };
        if (opts.amount) body.amount = opts.amount;
        if (opts.cardBin) body.card_bin = opts.cardBin;

        const { data } = await api<FeeQuoteResponse>("cards/feeQuote", {
          body,
          auth: false,
        });

        spinner.stop();

        if (!data?.fee_info) {
          console.log(chalk.yellow("No fee data available."));
          return;
        }

        console.log(chalk.bold.cyan(`\n  Fee Quote (${opts.type})\n`));

        const info = data.fee_info;
        const pairs: [string, string][] = [];

        if (info.open_card_fee !== undefined) pairs.push(["Open Card Fee", `$${info.open_card_fee}`]);
        if (info.charge_fee_rate !== undefined) pairs.push(["Charge Fee Rate", `${(Number(info.charge_fee_rate) * 100).toFixed(1)}%`]);
        if (info.charge_fee !== undefined) pairs.push(["Charge Fee", `$${info.charge_fee}`]);
        if (info.exchange_rate !== undefined) pairs.push(["Exchange Rate", String(info.exchange_rate)]);
        if (info.card_amount !== undefined) pairs.push(["Card Amount", `$${info.card_amount}`]);
        if (info.total_amount !== undefined) pairs.push(["Total Amount", `$${info.total_amount}`]);

        // Show any extra fields (skip objects/arrays)
        const shownKeys = ["open_card_fee", "charge_fee_rate", "charge_fee", "exchange_rate", "card_amount", "total_amount"];
        for (const [k, v] of Object.entries(info)) {
          if (shownKeys.includes(k)) continue;
          if (v === null || v === undefined) continue;
          if (typeof v === "object") continue;
          const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          pairs.push([label, String(v)]);
        }

        renderKeyValue(pairs);
        console.log();
      } catch (err: unknown) {
        spinner.fail("Failed to get fee quote");
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
      }
    });

  // --- cards apply <card_id> ---
  cards
    .command("apply <card_id>")
    .description("Apply for a card (opens a crypto-funded card)")
    .action(async (cardId: string) => {
      const creds = loadCredentials();
      if (!creds) {
        console.log(chalk.red("Not logged in. Run: payall auth login"));
        return;
      }

      const spinner = ora("Checking eligibility...").start();
      try {
        // 1. Check eligibility
        const { data: eligibility } = await api<{
          can_apply: number;
          card_name: string;
          is_bound: boolean;
          apply_amount: number;
          can_use_qrcode_charge: boolean;
        }>("cards/checkCanApply", {
          body: { card_id: cardId },
        });

        if (eligibility.is_bound) {
          spinner.fail("You have already applied for this card.");
          return;
        }

        if (!eligibility.can_apply) {
          spinner.fail("This card is not available for application via API.");
          return;
        }

        // 2. Get cardbin settings (available BINs, currencies, expiry config)
        spinner.text = "Loading card configuration...";
        const { data: cardbinSettings } = await pathApi<CardBinSetting[]>(
          `cards/getCardbinSettings?card_id=${cardId}`,
          { method: "GET" }
        );

        // Also get card display info (public endpoint)
        const { data: cardsData } = await api<Card[]>(`cards/id?card_ids=${cardId}`, {
          method: "GET",
          auth: false,
        });
        const card = (Array.isArray(cardsData) ? cardsData : [])[0];

        spinner.stop();

        if (!cardbinSettings || cardbinSettings.length === 0) {
          console.log(chalk.red("No card configurations available for this card."));
          return;
        }

        console.log(chalk.bold.cyan(`\n  Apply for: ${card?.card_name || `Card #${cardId}`}`));
        console.log(chalk.dim(`  Minimum amount: ${eligibility.apply_amount} USDT`));

        // 3. Let user pick a card BIN
        interface BinChoice { name: string; value: CardBinSetting }
        const binChoices: BinChoice[] = cardbinSettings.map((bin) => ({
          name: `${bin.organization.toUpperCase()} (${bin.card_bin}) - ${bin.currency.join(", ")} - ${bin.country}`,
          value: bin,
        }));

        let selectedBin: CardBinSetting;
        if (binChoices.length === 1) {
          selectedBin = binChoices[0].value;
          console.log(chalk.dim(`  Card type: ${selectedBin.organization.toUpperCase()} (${selectedBin.card_bin}) - ${selectedBin.country}`));
        } else {
          const { bin } = await inquirer.prompt([
            {
              type: "list",
              name: "bin",
              message: "Select card type:",
              choices: binChoices,
            },
          ]);
          selectedBin = bin;
        }

        // 4. Let user pick currency if multiple available
        let cardCurrency: string;
        if (selectedBin.currency.length > 1) {
          const { curr } = await inquirer.prompt([
            {
              type: "list",
              name: "curr",
              message: "Select card currency:",
              choices: selectedBin.currency,
            },
          ]);
          cardCurrency = curr;
        } else {
          cardCurrency = selectedBin.currency[0];
        }

        // 5. Compute expiry date (end of month, min_days from now, within days_range)
        const minDays = parseInt(selectedBin.min_days || "32", 10);
        const daysRange = parseInt(selectedBin.days_range || "699", 10);
        const expiryDate = computeExpiryDate(minDays, daysRange, selectedBin.ends_of_month);
        console.log(chalk.dim(`  Currency: ${cardCurrency} | Expiry: ${expiryDate}`));

        // 6. Generate or collect cardholder info
        const { autoFill } = await inquirer.prompt([
          {
            type: "confirm",
            name: "autoFill",
            message: "Generate cardholder info automatically?",
            default: true,
          },
        ]);

        let cardHolderInfo: Record<string, unknown>;

        if (autoFill) {
          const fillSpinner = ora("Generating cardholder info...").start();
          const { data: fillData } = await api<{ card_holder_info: Record<string, unknown> }>(
            "cards/fillBindingInfoByAI",
            { body: {} }
          );
          fillSpinner.stop();
          cardHolderInfo = fillData.card_holder_info;
        } else {
          cardHolderInfo = await inquirer.prompt([
            { type: "input", name: "first_name", message: "First name:" },
            { type: "input", name: "last_name", message: "Last name:" },
            { type: "input", name: "email", message: "Email:" },
            { type: "input", name: "phone_prefix", message: "Phone prefix (e.g. 1):" },
            { type: "input", name: "phone", message: "Phone number:" },
          ]);
        }

        console.log(chalk.dim(`  Name: ${cardHolderInfo.first_name} ${cardHolderInfo.last_name}`));
        console.log(chalk.dim(`  Email: ${cardHolderInfo.email}`));
        console.log(chalk.dim(`  Phone: +${cardHolderInfo.phone_prefix} ${cardHolderInfo.phone}`));

        // 7. Confirm
        const { confirm } = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirm",
            message: "Confirm card application?",
            default: true,
          },
        ]);

        if (!confirm) {
          console.log(chalk.yellow("Cancelled."));
          return;
        }

        // 8. Call preCharge to create the order
        const preChargeSpinner = ora("Creating card order...").start();

        const cardIssueInfo = {
          card_bin: selectedBin.card_bin,
          expiry_date: expiryDate,
          card_currency: cardCurrency,
          card_holder_info: cardHolderInfo,
        };

        const { data: preChargeResult } = await api<{ order_id: string }>(
          "charge/preCharge",
          {
            body: {
              charge_type: "OPEN_CARD",
              card_id: cardId,
              card_binding_id: "",
              card_issue_info: cardIssueInfo,
              card_currency: cardCurrency,
            },
          }
        );

        preChargeSpinner.succeed(chalk.green("Card order created!"));
        console.log(chalk.dim(`  Order ID: ${preChargeResult.order_id}`));

        // 9. Get deposit address / QR code
        const { fundNow } = await inquirer.prompt([
          {
            type: "confirm",
            name: "fundNow",
            message: "Get deposit address to fund this card now?",
            default: true,
          },
        ]);

        if (fundNow) {
          // Default to USDT on TRON (most common)
          const chainChoices = [
            { name: "TRON (TRC20)", value: { chain: "TRON", coin_code: "USDT(TRON)" } },
            { name: "BSC (BEP20)", value: { chain: "BSC", coin_code: "USDT(BSC)" } },
            { name: "Ethereum (ERC20)", value: { chain: "ETH", coin_code: "USDT(ETH)" } },
          ];

          const { chainInfo } = await inquirer.prompt([
            {
              type: "list",
              name: "chainInfo",
              message: "Select deposit network:",
              choices: chainChoices,
            },
          ]);

          const qrSpinner = ora("Getting deposit address...").start();
          try {
            const { data: qrData } = await pathApi<{
              address?: string;
              deposit_address?: string;
              coin_code?: string;
              min_deposit_amt?: string;
              expired_time?: string;
              qr_code?: string;
              [key: string]: unknown;
            }>("charge/getChargeQrCode", {
              body: {
                coin_code: chainInfo.coin_code,
                chain: chainInfo.chain,
                charge_type: "OPEN_CARD",
                card_id: cardId,
                card_binding_id: "",
              },
            });

            qrSpinner.stop();

            const depositAddr = qrData?.deposit_address || qrData?.address || "";
            if (depositAddr) {
              console.log(chalk.bold.green(`\n  Deposit Address (${chainInfo.chain}):`));
              console.log(chalk.bold(`  ${depositAddr}`));
              if (qrData?.min_deposit_amt) {
                console.log(chalk.dim(`  Minimum deposit: ${qrData.min_deposit_amt} USDT`));
              }
              if (qrData?.expired_time) {
                console.log(chalk.dim(`  Expires: ${qrData.expired_time}`));
              }
              console.log(
                chalk.dim(`\n  Send at least ${eligibility.apply_amount} USDT to the address above.`)
              );
              console.log(chalk.dim(`  The card will be issued automatically after payment is confirmed.`));
              console.log(chalk.dim(`  Check status with: payall cards my`));
            } else {
              console.log(chalk.yellow("  Could not get deposit address. Try again later with:"));
              console.log(chalk.dim(`  payall cards my`));
            }
          } catch (qrErr: unknown) {
            qrSpinner.fail("Could not get deposit address");
            const msg = qrErr instanceof Error ? qrErr.message : String(qrErr);
            console.error(chalk.dim(`  ${msg}`));
            console.log(chalk.dim(`  The order was created. Fund it later via the web app.`));
          }
        } else {
          console.log(chalk.dim("\n  Order created. Fund it later via the web app or CLI."));
        }

        console.log();
      } catch (err: unknown) {
        spinner.fail("Application failed");
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
      }
    });
}

// --- Helper types and functions ---

interface CardBinSetting {
  id: number;
  card_bin: string;
  country: string;
  currency: string[];
  organization: string;
  can_diy_date: string;
  days_range: string;
  min_days: string;
  ends_of_month: boolean;
  holder_config: {
    flag: number;
    country: string[];
    billInfoFlag: number;
    nativeNameFlag: number;
  };
  card_fee: Record<string, unknown>;
  card_limit: Record<string, unknown>;
  [key: string]: unknown;
}

function computeExpiryDate(minDays: number, daysRange: number, endsOfMonth: boolean): string {
  // Pick a date roughly in the middle of the allowed range, snapped to end of month
  const targetDays = Math.min(minDays + Math.floor(daysRange * 0.8), minDays + daysRange);
  const target = new Date();
  target.setDate(target.getDate() + targetDays);

  if (endsOfMonth) {
    // Snap to end of month
    target.setMonth(target.getMonth() + 1, 0); // last day of current month
  }

  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
