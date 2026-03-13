import { TronWeb } from "tronweb";
import { CHAINS } from "./chains.js";
import type { SendError } from "./send.js";

const TRON_USDT_CONTRACT = CHAINS.tron.usdtAddress;

function createTronWeb(privateKey?: string): InstanceType<typeof TronWeb> {
  const fullHost = CHAINS.tron.rpcUrl;
  if (privateKey) {
    const key = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;
    return new TronWeb({ fullHost, privateKey: key });
  }
  return new TronWeb({ fullHost });
}

/**
 * Derive a TRON address (T...) from an EVM private key.
 */
export function tronAddressFromKey(privateKey: string): string {
  const key = privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey;
  return TronWeb.address.fromPrivateKey(key) as string;
}

export interface TronBalances {
  usdt: string;
  trx: string;
}

/**
 * Fetch TRX + TRC-20 USDT balance for a TRON address.
 */
export async function getTronBalances(
  tronAddress: string
): Promise<TronBalances> {
  const tronWeb = createTronWeb();

  // TRX balance (in sun, 1 TRX = 1e6 sun)
  const trxSun = await tronWeb.trx.getBalance(tronAddress);
  const trx = (Number(trxSun) / 1e6).toFixed(6);

  // TRC-20 USDT balance
  tronWeb.setAddress(tronAddress);
  const contract = await tronWeb.contract().at(TRON_USDT_CONTRACT);
  const usdtRaw = await contract.balanceOf(tronAddress).call();
  const usdt = (Number(usdtRaw) / 10 ** CHAINS.tron.usdtDecimals).toFixed(
    CHAINS.tron.usdtDecimals
  );

  return { usdt, trx };
}

/**
 * Send TRC-20 USDT on TRON.
 */
export async function sendTronUsdt({
  privateKey,
  toAddress,
  amount,
}: {
  privateKey: string;
  toAddress: string;
  amount: string;
}): Promise<{ txHash: string }> {
  const tronWeb = createTronWeb(privateKey);
  const fromAddress = tronAddressFromKey(privateKey);
  const decimals = CHAINS.tron.usdtDecimals;
  const amountRaw = BigInt(Math.round(parseFloat(amount) * 10 ** decimals));

  // Pre-flight: check USDT balance
  tronWeb.setAddress(fromAddress);
  const contract = await tronWeb.contract().at(TRON_USDT_CONTRACT);
  const balanceRaw = await contract.balanceOf(fromAddress).call();

  if (BigInt(balanceRaw.toString()) < amountRaw) {
    const balance = (Number(balanceRaw) / 10 ** decimals).toFixed(decimals);
    throw Object.assign(
      new Error(
        `Insufficient USDT on TRON. Have: ${balance}, need: ${amount}`
      ),
      {
        sendError: {
          type: "insufficient_usdt",
          message: "Insufficient USDT on TRON",
          details: {
            balance,
            required: amount,
            walletAddress: fromAddress,
          },
        } as SendError,
      }
    );
  }

  // Pre-flight: check TRX balance (need some for energy/bandwidth)
  const trxSun = await tronWeb.trx.getBalance(fromAddress);
  if (Number(trxSun) <= 0) {
    throw Object.assign(
      new Error(
        `Insufficient TRX for fees on TRON. Have: 0 TRX. Fund your wallet with TRX first.`
      ),
      {
        sendError: {
          type: "insufficient_gas",
          message: "Insufficient TRX for fees",
          details: {
            balance: "0",
            required: ">0",
            walletAddress: fromAddress,
            gasToken: "TRX",
          },
        } as SendError,
      }
    );
  }

  // Send TRC-20 transfer (feeLimit = 15 TRX in sun)
  const tx = await contract.transfer(toAddress, amountRaw.toString()).send({
    feeLimit: 15_000_000,
  });

  // tx is the transaction ID string
  const txHash = typeof tx === "string" ? tx : (tx as { txid?: string }).txid ?? String(tx);

  return { txHash };
}
