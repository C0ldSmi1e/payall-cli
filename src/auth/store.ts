import { join } from "path";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { getConfigDir } from "../utils/config.js";
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "crypto";
import { hostname, userInfo } from "os";

const CREDENTIALS_FILE = "credentials.enc";
const WALLET_KEY_FILE = "wallet.enc";

import type { ChainType } from "./wallet.js";

interface Credentials {
  token: string;
  email: string; // wallet address for wallet login
  user_id: number;
  login_type: number;
  expires_at: number;
  chain?: ChainType;
}

function deriveKey(): Buffer {
  const salt = `payall-cli:${hostname()}:${userInfo().username}`;
  return scryptSync(salt, "payall-salt-v1", 32);
}

function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // format: iv:tag:encrypted (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(encoded: string): string {
  const key = deriveKey();
  const [ivHex, tagHex, encHex] = encoded.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function credentialsPath(): string {
  return join(getConfigDir(), CREDENTIALS_FILE);
}

function walletKeyPath(): string {
  return join(getConfigDir(), WALLET_KEY_FILE);
}

export function saveCredentials(creds: Credentials): void {
  const json = JSON.stringify(creds);
  writeFileSync(credentialsPath(), encrypt(json), "utf-8");
}

export function loadCredentials(): Credentials | null {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(decrypt(raw));
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  const path = credentialsPath();
  if (existsSync(path)) unlinkSync(path);
}

export function saveWalletKey(privateKey: string, chain: ChainType = "evm"): void {
  writeFileSync(walletKeyPath(), encrypt(JSON.stringify({ key: privateKey, chain })), "utf-8");
}

export function loadWalletKey(): { key: string; chain: ChainType } | null {
  const path = walletKeyPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const decrypted = decrypt(raw);
    // Try parsing as JSON (new format); fallback to raw string (legacy)
    try {
      const parsed = JSON.parse(decrypted);
      if (parsed && typeof parsed === "object" && parsed.key) {
        return { key: parsed.key, chain: parsed.chain || "evm" };
      }
    } catch {
      // Legacy format: raw private key string
    }
    return { key: decrypted, chain: "evm" };
  } catch {
    return null;
  }
}

export function clearWalletKey(): void {
  const path = walletKeyPath();
  if (existsSync(path)) unlinkSync(path);
}

export function getToken(): string | null {
  const creds = loadCredentials();
  if (!creds) return null;
  // Check if token is still valid (with 1 hour buffer)
  if (creds.expires_at && Date.now() / 1000 > creds.expires_at - 3600) {
    return null;
  }
  return creds.token;
}
