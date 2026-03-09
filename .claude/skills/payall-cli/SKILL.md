---
name: payall-cli
description: |
  Operate the Payall crypto card CLI tool. Use this skill whenever the user wants to: manage crypto debit cards, check card balances, apply for new cards, compare cards, list marketplace cards, view card fees, login/logout with an EVM wallet, check auth status, view favorite cards, or any card-related operation via terminal. Also trigger when the user mentions "payall", "crypto card", "card balance", "apply for card", "card fees", or wants to run payall CLI commands. This skill knows every available command and the correct flags/arguments for each.
---

# Payall CLI

A terminal tool for managing crypto debit cards on the Payall platform. Users can browse a card marketplace, apply for cards funded with crypto (USDT), check balances, compare cards, and manage authentication via EVM wallet signatures.

## Setup

- **Location**: `/Users/daniel/payall-dev/payall-cli`
- **Runtime**: Bun
- **Run command**: `bun run src/cli.ts <command>` (from the payall-cli directory)
- **API**: `https://api.payall.pro/v1/api`
- **Credentials**: Stored encrypted at `~/.payall/`

Always `cd /Users/daniel/payall-dev/payall-cli` before running commands, or use the full path.

## Command Reference

### Auth Commands

Authentication uses EVM wallet private key signing. A single login call handles both registration (new wallets auto-register) and login for existing users.

```
payall auth login              # Prompt for private key, sign message, authenticate
payall auth login --save-key   # Same, but save the encrypted private key for future use
payall auth login --invite XYZ # Include referral code (first-time only)
payall auth status             # Show current session (account, user_id, expiry, saved key)
payall auth logout             # Clear server session + local credentials
payall auth forget-key         # Remove saved private key from ~/.payall/
```

**Login flow**: User provides EVM private key -> CLI signs a message locally (key never sent to server) -> sends signature + wallet address to API -> receives JWT (180-day expiry) -> stores encrypted in ~/.payall/credentials.enc.

If the user has previously run `--save-key`, subsequent `login` calls reuse the saved key automatically without prompting.

### Card Commands

#### Browsing (no auth required)

```
payall cards list                        # List all marketplace cards
payall cards list --search "bit"         # Search by card name
payall cards list --sort general         # Sort by: general, benefit, privacy, fees
payall cards list --sort-dir asc         # Sort direction: asc, desc
payall cards list --no-kyc               # Only cards without KYC requirement
payall cards list --kyc                  # Only cards requiring KYC
payall cards info <card_id>              # Full card details + fees
payall cards compare <id1> <id2>         # Side-by-side comparison table
payall cards fees                        # Fee quote (defaults to card 23, OPEN_CARD)
payall cards fees --card-id 39           # Fee quote for specific card
payall cards fees --type CARD_CHARGE     # Types: OPEN_CARD, CARD_CHARGE, CARD_WITHDRAW
payall cards fees --amount 100           # With specific amount
payall cards fees --currency EUR         # With specific currency
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
payall cards topup <binding_id>         # Interactive card topup flow
```

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
payall cards apply <card_id>             # Interactive card application flow
```

The apply flow is multi-step and interactive:
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
2. `payall cards topup <binding_id>` (interactive: amount, fees, chain, deposit address)

**Returning user checking cards:**
1. `payall auth login` (reuses saved key if available)
2. `payall cards my` (see all cards + balances)
3. `payall cards detail <binding_id> --reveal` (see full card number)

**Browsing without account:**
- `payall cards list --no-kyc --sort fees`
- `payall cards compare 23 39`
- `payall cards fees --card-id 39 --type OPEN_CARD`

## Troubleshooting

- **"Not logged in"**: Run `payall auth login`
- **"User Not Authorized"**: Token expired. Run `payall auth login` again
- **"Bind Card Failed"**: The `cards/binding` endpoint is for non-API cards only. For cards 23/39, use `cards apply` which goes through `preCharge`
- **Cards list empty after apply**: `cards my` returns cards from `userCards` endpoint which wraps data in `{ cards: [...] }`
- **Private key security**: Key is signed locally via `viem`, never sent to the server. Stored key is AES-256-GCM encrypted
