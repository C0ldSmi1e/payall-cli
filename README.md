# Payall CLI

A terminal tool for managing crypto debit cards on the Payall platform. Browse a card marketplace, apply for cards funded with USDT, top up balances, check card details, and more — all from your terminal.

## Install

```bash
npm install -g payall-cli
```

Or with Bun:

```bash
bun install -g payall-cli
```

Then run from anywhere:

```bash
payall <command>
```

### Development

```bash
git clone https://github.com/user/payall-cli.git
cd payall-cli
bun install
bun run build
bun link
```

Run directly from source without building:

```bash
bun run src/cli.ts <command>
```

## Quick Start

```bash
# 1. Login with your EVM wallet
payall auth login

# 2. Browse available cards
payall cards list

# 3. Check card details and fees
payall cards info 23
payall cards fees --card-id 23

# 4. Apply for a card (interactive)
payall cards apply 23

# 5. Check your cards
payall cards my

# 6. Top up a card
payall cards topup <binding_id>
```

## Commands

### Authentication

| Command | Description |
|---------|-------------|
| `payall auth login` | Sign in with EVM private key (auto-registers new wallets) |
| `payall auth login --save-key` | Sign in and save encrypted key for future sessions |
| `payall auth login --key <key> --save-key` | Non-interactive login (for agents) |
| `payall auth login --invite CODE` | Sign in with referral code (first login only) |
| `payall auth status` | Show current session info |
| `payall auth logout` | Clear session and local credentials |
| `payall auth forget-key` | Remove saved private key |

Your private key is signed locally and never sent to the server. Saved keys are encrypted with AES-256-GCM.

### Card Marketplace (no auth required)

| Command | Description |
|---------|-------------|
| `payall cards list` | Browse all cards |
| `payall cards list --search "bit"` | Search by name |
| `payall cards list --sort fees --skip-kyc` | Sort and filter |
| `payall cards info <card_id>` | Card details and fee breakdown |
| `payall cards compare <id1> <id2>` | Side-by-side comparison |
| `payall cards fees --card-id 23 --type OPEN_CARD` | Fee quote |

### Your Cards (auth required)

| Command | Description |
|---------|-------------|
| `payall cards my` | List your bound cards with balances |
| `payall cards detail <binding_id>` | Masked card number, CVV, billing address |
| `payall cards detail <binding_id> --reveal` | Full card number and CVV |
| `payall cards detail <binding_id> --reveal --json` | JSON output for programmatic use |
| `payall cards apply <card_id>` | Apply for a new card (interactive) |
| `payall cards apply <card_id> --auto-fill --chain tron --yes` | Non-interactive apply (for agents) |
| `payall cards topup <binding_id>` | Top up card balance with crypto (interactive) |
| `payall cards topup <binding_id> --amount 50 --chain tron --yes` | Non-interactive topup (for agents) |
| `payall cards collections` | List favorited cards |
| `payall cards favorite <card_id>` | Toggle favorite |

### Wallet

| Command | Description |
|---------|-------------|
| `payall wallet balance` | USDT + gas token balances on BSC, ETH, TRON |
| `payall wallet send --to 0x... --amount 50 --chain bsc` | Send USDT on BSC |
| `payall wallet send --to 0x... --amount 50 --chain eth` | Send USDT on Ethereum |
| `payall wallet send --to T... --amount 50 --chain tron` | Send USDT on TRON (TRC-20) |

Add `--yes` / `-y` to skip the confirmation prompt. If no saved wallet key is found, the CLI will prompt for it interactively and offer to save it.

### Other

| Command | Description |
|---------|-------------|
| `payall chat` | AI assistant chat |
| `payall referrals` | Referral program info |
| `payall referrals details` | Referral earnings breakdown |
| `payall transfer create` | Create a fiat transfer |
| `payall transfer list` | List transfers |
| `payall transfer status <id>` | Check transfer status |

## Card Topup Flow

```
$ payall cards topup 515

  Loading card info...
  Bit2Go (****1114) - USD - active

? Amount (USDT): 50

  Fee quote:
    You send:       50 USDT
    Fee (1.5%):     0.75 USDT
    Card receives:  49.25 USD

? Select deposit network: TRON (TRC20)
? Confirm topup? Yes
  Topup order created!
  Getting deposit address...

  Deposit Address (TRON):
  TXyz...abc
  Minimum deposit: 0.5 USDT
  Expires: 2026-09-08

  Send 50 USDT to the address above.
  Balance will update after confirmation.
  Check status with: payall cards my
```

## Using with AI Agents

The CLI is designed to work with AI agents (Claude, etc.) via the skill file at `.claude/skills/payall-cli/SKILL.md`. To give your agent access:

### For Claude Code users

The skill is auto-discovered. Just ask Claude to manage your cards:

> "Top up my Bit2Go card with 50 USDT"
> "Show me my card balances"
> "Apply for a new card with no KYC"

### For other agents

Point your agent at the skill file or include these instructions in its system prompt:

**Key patterns your agent needs to know:**

1. **Run `payall <command>`** from anywhere (globally linked)
2. **Get card data as JSON** with `payall cards detail <binding_id> --reveal --json`
3. **The binding ID** (from `payall cards my`) is different from the card catalog ID (from `payall cards list`)
4. **Auth is required** for `cards my`, `cards detail`, `cards apply`, `cards topup`, `wallet *`, `transfer *`
5. **Two response envelopes**: standard (`code`/`data`/`message`) and path-style (`resCode`/`resMsg`/`data`) — the CLI handles both

**Agent workflow example — topping up a card:**

```
1. Run: payall cards my                                             -> get the binding_id
2. Run: payall cards topup <id> --amount 50 --chain tron --yes      -> get deposit address
3. Run: payall wallet balance                                       -> check which chain has funds
4. Run: payall wallet send --to <deposit_addr> --amount 50 --chain tron --yes  -> send USDT
```

The `--amount`, `--chain`, and `--yes` flags bypass all interactive prompts, making it safe for AI agents to call directly. If `wallet send` fails, the CLI prints the deposit address for manual transfer.

## API

- **Base URL**: `https://api.payall.pro/v1/api`
- **Auth**: JWT Bearer token (180-day expiry)
- **Credentials**: Stored encrypted at `~/.payall/`