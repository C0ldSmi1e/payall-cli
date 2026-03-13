import {
  createWalletClient,
  http,
  toHex,
  type PrivateKeyAccount,
} from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import { mainnet } from "viem/chains";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";
import { base58check } from "@scure/base";

export type ChainType = "evm" | "tron";

const LOGIN_MESSAGE_PREFIX =
  "Welcome. Login Payall. This is completely secure and doesn't cost anything! ";

const bs58check = base58check(sha256);

// --- EVM functions ---

export function getAccountFromKey(privateKey: string): PrivateKeyAccount {
  const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  return privateKeyToAccount(key as `0x${string}`);
}

async function signEvmLoginMessage(
  privateKey: string
): Promise<{ wallet_address: string; signature: string; timestamp: string }> {
  const account = getAccountFromKey(privateKey);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = LOGIN_MESSAGE_PREFIX + timestamp;

  const client = createWalletClient({
    account,
    chain: mainnet,
    transport: http(),
  });

  const signature = await client.signMessage({ message });

  return {
    wallet_address: account.address,
    signature,
    timestamp,
  };
}

// --- Tron functions ---

export function getTronAddressFromKey(privateKey: string): string {
  const key = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;
  const pubBytes = secp256k1.getPublicKey(key, false); // 65 bytes uncompressed
  const pubHash = keccak_256(pubBytes.slice(1)); // hash 64 bytes (drop 0x04 prefix)
  const addrBytes = pubHash.slice(-20); // last 20 bytes
  const tronBytes = new Uint8Array(21);
  tronBytes[0] = 0x41; // Tron mainnet prefix
  tronBytes.set(addrBytes, 1);
  return bs58check.encode(tronBytes); // T-prefixed address
}

async function signTronLoginMessage(
  privateKey: string
): Promise<{ wallet_address: string; signature: string; timestamp: string }> {
  const wallet_address = getTronAddressFromKey(privateKey);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = LOGIN_MESSAGE_PREFIX + timestamp;

  // Must match backend: keccak(prefix_bytes + message_bytes)
  const prefix = "\x19TRON Signed Message:\n" + message.length.toString();
  const fullMessage = new TextEncoder().encode(prefix + message);
  const hash = keccak_256(fullMessage);

  const key = (
    privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`
  ) as `0x${string}`;
  const { r, s, v } = await sign({
    hash: toHex(hash) as `0x${string}`,
    privateKey: key,
  });

  // Serialize to 65-byte hex signature (r + s + v)
  const rHex = r.slice(2);
  const sHex = s.slice(2);
  const vByte = Number(v).toString(16).padStart(2, "0");
  const signature = `0x${rHex}${sHex}${vByte}`;

  return { wallet_address, signature, timestamp };
}

// --- Chain-agnostic functions ---

export function validatePrivateKey(privateKey: string): boolean {
  try {
    const key = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;
    secp256k1.getPublicKey(key, false);
    return true;
  } catch {
    return false;
  }
}

export function getAddressFromKey(
  privateKey: string,
  chain: ChainType
): string {
  if (chain === "tron") {
    return getTronAddressFromKey(privateKey);
  }
  return getAccountFromKey(privateKey).address;
}

export async function signLoginMessageForChain(
  privateKey: string,
  chain: ChainType
): Promise<{ wallet_address: string; signature: string; timestamp: string }> {
  if (chain === "tron") {
    return signTronLoginMessage(privateKey);
  }
  return signEvmLoginMessage(privateKey);
}

// Keep for backward compat (used elsewhere)
export { signEvmLoginMessage as signLoginMessage };

export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
