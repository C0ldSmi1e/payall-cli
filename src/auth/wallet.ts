import {
  createWalletClient,
  http,
  type PrivateKeyAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

const LOGIN_MESSAGE_PREFIX =
  "Welcome. Login Payall. This is completely secure and doesn't cost anything! ";

export function getAccountFromKey(privateKey: string): PrivateKeyAccount {
  // Normalize: ensure 0x prefix
  const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  return privateKeyToAccount(key as `0x${string}`);
}

export async function signLoginMessage(
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

export async function signWithdrawConfirm(
  privateKey: string,
  messageTemplate: string,
  orderId: string,
  cardBindingId: number,
  source: string = "payall-cli"
): Promise<{ signature: string; timestamp: string }> {
  const account = getAccountFromKey(privateKey);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const message = messageTemplate
    .replace("{source}", source)
    .replace("{order_id}", orderId)
    .replace("{card_binding_id}", String(cardBindingId))
    .replace("{timestamp}", timestamp);

  const client = createWalletClient({
    account,
    chain: mainnet,
    transport: http(),
  });

  const signature = await client.signMessage({ message });

  return { signature, timestamp };
}

export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
