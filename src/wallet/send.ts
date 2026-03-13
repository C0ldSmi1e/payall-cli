import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, ERC20_ABI, type ChainConfig } from "./chains.js";
import { sendTronUsdt } from "./tron.js";

export interface SendResult {
  txHash: string;
}

export interface SendError {
  type: "insufficient_usdt" | "insufficient_gas" | "send_failed";
  message: string;
  details: {
    balance?: string;
    required?: string;
    walletAddress?: string;
    gasToken?: string;
  };
}

export async function sendUsdt({
  privateKey,
  chain,
  toAddress,
  amount,
}: {
  privateKey: string;
  chain: string;
  toAddress: string;
  amount: string;
}): Promise<SendResult> {
  const chainKey = chain.toLowerCase();
  const config = CHAINS[chainKey];
  if (!config) {
    throw Object.assign(new Error(`Chain "${chain}" is not supported for sending. Supported: bsc, eth, tron.`), {
      sendError: {
        type: "send_failed",
        message: `Chain "${chain}" is not supported for sending.`,
        details: {},
      } as SendError,
    });
  }

  // Route TRON to its own sender
  if (config.type === "tron") {
    return sendTronUsdt({ privateKey, toAddress, amount });
  }

  const key = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const account = privateKeyToAccount(key as `0x${string}`);

  const publicClient = createPublicClient({
    chain: config.viemChain,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: config.viemChain,
    transport: http(config.rpcUrl),
  });

  const amountParsed = parseUnits(amount, config.usdtDecimals);

  // Pre-flight: check USDT balance
  const usdtBalance = await publicClient.readContract({
    address: config.usdtAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });

  if (usdtBalance < amountParsed) {
    throw Object.assign(
      new Error(
        `Insufficient USDT on ${config.name}. Have: ${formatUnits(usdtBalance, config.usdtDecimals)}, need: ${amount}`
      ),
      {
        sendError: {
          type: "insufficient_usdt",
          message: `Insufficient USDT on ${config.name}`,
          details: {
            balance: formatUnits(usdtBalance, config.usdtDecimals),
            required: amount,
            walletAddress: account.address,
          },
        } as SendError,
      }
    );
  }

  // Estimate gas
  const gasEstimate = await publicClient.estimateContractGas({
    address: config.usdtAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [toAddress as `0x${string}`, amountParsed],
    account: account.address,
  });

  const gasPrice = await publicClient.getGasPrice();
  const gasCost = gasEstimate * gasPrice;

  // Check native balance for gas
  const nativeBalance = await publicClient.getBalance({
    address: account.address,
  });

  if (nativeBalance < gasCost) {
    throw Object.assign(
      new Error(
        `Insufficient ${config.nativeToken} for gas on ${config.name}. Have: ${formatEther(nativeBalance)}, need: ~${formatEther(gasCost)}`
      ),
      {
        sendError: {
          type: "insufficient_gas",
          message: `Insufficient ${config.nativeToken} for gas`,
          details: {
            balance: formatEther(nativeBalance),
            required: formatEther(gasCost),
            walletAddress: account.address,
            gasToken: config.nativeToken,
          },
        } as SendError,
      }
    );
  }

  // Execute transfer
  const txHash = await walletClient.writeContract({
    address: config.usdtAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [toAddress as `0x${string}`, amountParsed],
  });

  return { txHash };
}
