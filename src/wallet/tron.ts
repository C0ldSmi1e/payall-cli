import { createHash } from "crypto";
import { CHAINS } from "./chains.js";

// Base58 alphabet (Bitcoin)
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buffer: Buffer): string {
  const digits = [0];
  for (const byte of buffer) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  // Leading zeros
  for (const byte of buffer) {
    if (byte !== 0) break;
    digits.push(0);
  }
  return digits
    .reverse()
    .map((d) => ALPHABET[d])
    .join("");
}

function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

/**
 * Convert an EVM address (0x...) to a TRON address (T...).
 * Strip 0x prefix, prepend 0x41 (TRON mainnet prefix), Base58Check encode.
 */
export function evmToTronAddress(evmAddress: string): string {
  const hex = evmAddress.replace(/^0x/i, "");
  const addressBytes = Buffer.from("41" + hex, "hex");
  const checksum = sha256(sha256(addressBytes)).subarray(0, 4);
  const payload = Buffer.concat([addressBytes, checksum]);
  return base58Encode(payload);
}

export interface TronBalances {
  usdt: string;
  trx: string;
}

/**
 * Fetch TRX + TRC-20 USDT balance from TronGrid API.
 */
export async function getTronBalances(
  tronAddress: string
): Promise<TronBalances> {
  const baseUrl = CHAINS.tron.rpcUrl;
  const url = `${baseUrl}/v1/accounts/${tronAddress}`;

  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!resp.ok) {
    throw new Error(`TronGrid API error: ${resp.status}`);
  }

  const json = (await resp.json()) as {
    data?: Array<{
      balance?: number;
      trc20?: Array<Record<string, string>>;
    }>;
  };

  if (!json.data || json.data.length === 0) {
    return { usdt: "0", trx: "0" };
  }

  const account = json.data[0];

  // TRX balance (in sun, 1 TRX = 1e6 sun)
  const trxSun = account.balance || 0;
  const trx = (trxSun / 1e6).toFixed(6);

  // TRC-20 USDT
  const usdtContract = CHAINS.tron.usdtAddress;
  let usdtRaw = "0";
  if (account.trc20) {
    for (const token of account.trc20) {
      if (token[usdtContract]) {
        usdtRaw = token[usdtContract];
        break;
      }
    }
  }
  const usdt = (Number(usdtRaw) / 10 ** CHAINS.tron.usdtDecimals).toFixed(
    CHAINS.tron.usdtDecimals
  );

  return { usdt, trx };
}
