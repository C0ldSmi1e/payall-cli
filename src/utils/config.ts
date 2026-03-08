import { homedir } from "os";
import { join } from "path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";

const CONFIG_DIR = join(homedir(), ".payall");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  api_url: string;
  language: string;
}

const DEFAULT_CONFIG: Config = {
  api_url: "https://api.payall.pro/v1/api",
  language: "en",
};

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getConfig(): Config {
  ensureDir();
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function setConfig(key: string, value: string) {
  const config = getConfig();
  (config as Record<string, string>)[key] = value;
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getConfigDir(): string {
  ensureDir();
  return CONFIG_DIR;
}
