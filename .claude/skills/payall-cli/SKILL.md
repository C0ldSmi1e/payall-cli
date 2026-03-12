---
name: payall-cli
description: |
  Operate the Payall crypto card CLI tool. Use this skill whenever the user wants to: manage crypto debit cards, check card balances, apply for new cards, compare cards, list marketplace cards, view card fees, login/logout with an EVM wallet, check auth status, view favorite cards, or any card-related operation via terminal. Also trigger when the user mentions "payall", "crypto card", "card balance", "apply for card", "card fees", or wants to run payall CLI commands. This skill knows every available command and the correct flags/arguments for each.
---

# Payall CLI

A terminal tool for managing crypto debit cards on the Payall platform. Users can browse a card marketplace, apply for cards funded with crypto (USDT), check balances, compare cards, and manage authentication via EVM wallet signatures.

## Setup

- **Run command**: `payall <command>` (globally linked via `bun link`)
- **Source**: `/Users/daniel/payall-dev/payall-cli`
- **Runtime**: Bun
- **API**: `https://api.payall.pro/v1/api`
- **Credentials**: Stored encrypted at `~/.payall/`

The CLI is globally installed. Just run `payall <command>` from anywhere.

## Command Reference

### Auth Commands

Authentication uses EVM wallet private key signing. A single login call handles both registration (new wallets auto-register) and login for existing users.

```
payall auth login                              # Prompt for private key, sign message, authenticate
payall auth login --save-key                   # Same, but save the encrypted private key for future use
payall auth login --key <private_key> --save-key  # Non-interactive login (for agents)
payall auth login --invite XYZ                 # Include referral code (first-time only)
payall auth status                             # Show current session (account, user_id, expiry, saved key)
payall auth logout                             # Clear server session + local credentials
payall auth forget-key                         # Remove saved private key from ~/.payall/
```

**Login flow**: User provides EVM private key -> CLI signs a message locally (key never sent to server) -> sends signature + wallet address to API -> receives JWT (180-day expiry) -> stores encrypted in ~/.payall/credentials.enc.

If the user has previously run `--save-key`, subsequent `login` calls reuse the saved key automatically without prompting. The `--key` / `-k` flag allows passing the private key directly, skipping the interactive prompt (useful for agent automation).

### Card Commands

#### Browsing (no auth required)

```
payall cards list                        # List all marketplace cards
payall cards list --search "bit"         # Search by card name
payall cards list --sort general         # Sort by: general, benefit, privacy, fees
payall cards list --sort-dir asc         # Sort direction: asc, desc
payall cards list --skip-kyc              # Only cards without KYC requirement
payall cards list --kyc-only             # Only cards requiring KYC
payall cards info <card_id>              # Full card details + fees
payall cards compare <id1> <id2>         # Side-by-side comparison table
payall cards fees                        # Fee quote (defaults to card 23, OPEN_CARD)
payall cards fees --card-id 39           # Fee quote for specific card
payall cards fees --type CARD_CHARGE     # Types: OPEN_CARD, CARD_CHARGE, CARD_WITHDRAW
payall cards fees --type CARD_CHARGE --amount 100  # card_bin auto-resolved for CARD_CHARGE/CARD_WITHDRAW
payall cards fees --amount 100           # With specific amount
payall cards fees --currency EUR         # With specific currency
payall cards fees --card-bin 44742000    # Explicit BIN override (optional)
```

#### User Cards (auth required)

```
payall cards my                                  # List user's bound cards (ID, name, balance, status)
payall cards detail <binding_id>                 # Card details masked (number, CVV, expiry, billing address)
payall cards detail <binding_id> --reveal        # Show FULL card number, CVV, expiry, billing address
payall cards detail <binding_id> --reveal --json # JSON output (for programmatic/agent use)
payall cards collections                         # List favorited cards
payall cards favorite <card_id>                  # Toggle favorite on/off
```

**Getting card info for agent use (paying for services, filling forms, etc.):**

The `--reveal --json` flags return machine-readable JSON with all fields an agent needs:

```bash
payall cards detail <binding_id> --reveal --json
```

Returns:
```json
{
  "card_name": "Bit2Go",
  "card_number": "4474200012345678",
  "card_cvv": "123",
  "expiry_month": 10,
  "expiry_year": 2027,
  "card_bin": "44742000",
  "first_name": "John",
  "last_name": "Smith",
  "address": "3500 South DuPont Highway",
  "city": "Dover",
  "state": "DE",
  "zipcode": "19901",
  "country_code": "USA"
}
```

To get the binding_id, first run `payall cards my` and use the ID column.

#### Topping Up a Card (auth required)

```
payall cards topup <binding_id>                                    # Interactive card topup flow
payall cards topup <binding_id> --amount 50 --chain tron --yes     # Non-interactive (for agents)
```

**Non-interactive flags** (use all three to skip all prompts):
- `--amount <amount>` / `-a` — Topup amount in USDT
- `--chain <chain>` / `-c` — Deposit network: `tron`, `bsc`, `eth`
- `--yes` / `-y` — Skip confirmation prompt

The topup flow:
1. Fetches the bound card info (from `userCards` + `getCardDetail`)
2. Prompts for USDT amount
3. Shows fee quote (charge fee rate, card amount after fees)
4. User selects deposit network (TRON/BSC/ETH)
5. Confirms and creates the topup order via `charge/preCharge` with `CARD_CHARGE` type
6. Shows deposit address where user sends USDT
7. Card balance updates automatically after crypto deposit is confirmed

The `<binding_id>` is the ID column from `payall cards my`.

#### Applying for a Card (auth required)

```
payall cards apply <card_id>                                    # Interactive card application flow
payall cards apply <card_id> --auto-fill --chain tron --yes     # Non-interactive (for agents)
payall cards apply <card_id> --bin 44742000 --currency USD --auto-fill --chain tron --yes  # Fully explicit
payall cards apply <card_id> --first-name John --last-name Smith --email j@x.com --phone-prefix 1 --phone 5551234 --chain bsc --yes  # Manual cardholder info
```

**Non-interactive flags** (use `--auto-fill --chain <chain> --yes` to skip all prompts):
- `--bin <card_bin>` / `-b` — Select card BIN (skips prompt; auto-selected if only one)
- `--currency <currency>` — Card currency: USD, EUR, etc. (skips prompt; auto-selected if only one)
- `--auto-fill` — Auto-generate cardholder info via AI (skips prompt)
- `--first-name`, `--last-name`, `--email`, `--phone-prefix`, `--phone` — Manual cardholder info (all 5 required together; overrides `--auto-fill`)
- `--chain <chain>` / `-c` — Deposit chain: `tron`, `bsc`, `eth` (auto-funds after order)
- `--yes` / `-y` — Skip all confirmation prompts (without `--chain`, skips funding)

The apply flow:
1. Checks eligibility via `checkCanApply`
2. Fetches available card BIN configurations (Visa/Mastercard, currencies, regions)
3. User selects card type and currency
4. Generates or manually fills cardholder info (name, email, phone)
5. Creates the order via `charge/preCharge` with `OPEN_CARD` type
6. Optionally shows a deposit address (TRON/BSC/ETH) where user sends USDT
7. Card is issued automatically after crypto deposit is confirmed

**Important card IDs**:
- `23` = Bit2Go (Visa/Mastercard, multi-currency, no KYC)
- `39` = MiPay Universal Card (USD only, no KYC)

## Response Format

The backend uses two response envelopes:
- **Standard**: `{ code: 200, data: {...}, message: "success" }` — most endpoints
- **Path-style**: `{ resCode: "100", resMsg: "Success", data: {...} }` — swap/charge/cardbin endpoints

The CLI handles both transparently. Error code `4001` means unauthorized (token expired or missing).

## Common Workflows

**New user getting started:**
1. `payall auth login` (auto-registers with wallet)
2. `payall cards list` (browse marketplace)
3. `payall cards info 23` (check card details)
4. `payall cards compare 23 39` (compare options)
5. `payall cards fees --card-id 23` (check costs)
6. `payall cards apply 23` (apply + fund with crypto)
7. `payall cards my` (check status)

**Topping up an existing card:**
1. `payall cards my` (find the binding ID)
2. `payall cards topup <binding_id> --amount 50 --chain tron --yes` (non-interactive for agents)
   Or: `payall cards topup <binding_id>` (interactive for humans)

**Returning user checking cards:**
1. `payall auth login` (reuses saved key if available)
2. `payall cards my` (see all cards + balances)
3. `payall cards detail <binding_id> --reveal` (see full card number)

**Browsing without account:**
- `payall cards list --skip-kyc --sort fees`
- `payall cards compare 23 39`
- `payall cards fees --card-id 39 --type OPEN_CARD`

## Display Guidelines

When presenting card information to the user (from `cards list`, `cards my`, `cards detail`, etc.), do NOT show internal/technical fields like rank, id, binding_id, brand, rating, general_ratings, or other non-user-facing fields. Only show what the user actually cares about: card name, balance, status, card number, fees, etc.

## Card Application Guidelines

Before applying for a card, always run `payall cards apply <card_id>` which calls `checkCanApply` first. If the card returns `can_apply = 0` (i.e. "not available for application via API"), do NOT retry or attempt workarounds. Instead, direct the user to open the card themselves on the card official site and you are suppose to provide the url.

Currently only cards **23** (Bit2Go) and **39** (MiPay) support API-based application. All other cards must be opened via the website. Do not negatively state that we can not support others, but just say you can directly apply these cards now.

## Card Recommendation Guidelines

**IMPORTANT: Never use `rating` or `general_ratings` to recommend or rank cards.** These values are placeholder data and not meaningful. Instead, base all recommendations on real card attributes.

When a user asks about cards or wants to apply, don't just list all cards — help them find the **best card for their specific needs**. If the user hasn't shared their requirements, ask specific questions first:

1. **What's your primary use case?** (online shopping, subscriptions, international payments, travel, etc.)
2. **What's your expected monthly spend?** (affects which fee structure is cheapest)
3. **Do you need a physical card or is virtual enough?**
4. **Any currency preference?** (USD, EUR, GBP, etc.)
5. **Are you willing to complete KYC?** (some cards require it, some don't)
6. **Which region are you in?** (affects card availability and features)

Then run `payall cards list` and examine **ALL cards in the marketplace** — not just cards 23 and 39. Use `payall cards info` on several promising candidates and `payall cards compare` to narrow down. Evaluate based on:
- **Fee structure**: open fee, transaction fee, monthly fee, topup fee rate
- **Payment support**: Apple Pay, Google Pay, WeChat Pay, Alipay, ChatGPT Pay
- **KYC requirement**: whether identity verification is needed
- **Currency support**: available currencies (USD, EUR, GBP, etc.)

**IMPORTANT: Do NOT limit recommendations to only API-applicable cards (23, 39).** The best card for the user might be any card in the marketplace. Recommend the genuinely best card regardless of whether it supports in-CLI application. If the recommended card requires website signup, that's fine — just mention how to get it (apply via CLI for cards 23/39, or visit the card's website for others).

Be transparent about trade-offs — if a card has higher fees but better features for their use case, say so. If a cheaper card exists that fits their needs, recommend it even if it's simpler. Don't push the most expensive option; find the genuine best fit.

Always show a fee comparison (`payall cards fees`) for the recommended card(s) so the user knows exactly what they'll pay before applying.

## Troubleshooting

- **"Not logged in"**: Run `payall auth login`
- **"User Not Authorized"**: Token expired. Run `payall auth login` again
- **"Bind Card Failed"**: The `cards/binding` endpoint is for non-API cards only. For cards 23/39, use `cards apply` which goes through `preCharge`
- **Cards list empty after apply**: `cards my` returns cards from `userCards` endpoint which wraps data in `{ cards: [...] }`
- **Private key security**: Key is signed locally via `viem`, never sent to the server. Stored key is AES-256-GCM encrypted
