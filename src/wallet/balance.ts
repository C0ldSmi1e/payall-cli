import { createPublicClient, http, formatUnits, formatEther } from "viem";
import { getAccountFromKey } from "../auth/wallet.js";
import { CHAINS, ERC20_ABI, type ChainConfig } from "./chains.js";
import { tronAddressFromKey, getTronBalances } from "./tron.js";

export interface ChainBalance {
  chain: string;
  address: string;
  usdtBalance: string;
  gasToken: string;
  gasBalance: string;
  error?: string;
}

async function getEvmBalance(
  chainKey: string,
  config: ChainConfig,
  evmAddress: `0x${string}`
): Promise<ChainBalance> {
  const client = createPublicClient({
    chain: config.viemChain,
    transport: http(config.rpcUrl),
  });

  const [usdtRaw, gasRaw] = await Promise.all([
    client.readContract({
      address: config.usdtAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [evmAddress],
    }),
    client.getBalance({ address: evmAddress }),
  ]);

  return {
    chain: config.name,
    address: evmAddress,
    usdtBalance: formatUnits(usdtRaw, config.usdtDecimals),
    gasToken: config.nativeToken,
    gasBalance: formatEther(gasRaw),
  };
}

async function getTronBalance(
  privateKey: string
): Promise<ChainBalance> {
  const tronAddress = tronAddressFromKey(privateKey);
  const { usdt, trx } = await getTronBalances(tronAddress);

  return {
    chain: "TRON",
    address: tronAddress,
    usdtBalance: usdt,
    gasToken: "TRX",
    gasBalance: trx,
  };
}

export async function getAllBalances(
  privateKey: string
): Promise<ChainBalance[]> {
  const account = getAccountFromKey(privateKey);
  const evmAddress = account.address;

  const results = await Promise.allSettled([
    getEvmBalance("bsc", CHAINS.bsc, evmAddress),
    getEvmBalance("eth", CHAINS.eth, evmAddress),
    getTronBalance(privateKey),
  ]);

  const tronAddress = tronAddressFromKey(privateKey);

  return results.map((result, i) => {
    const chainNames = ["BSC", "ETH", "TRON"];
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      chain: chainNames[i],
      address: i < 2 ? evmAddress : tronAddress,
      usdtBalance: "-",
      gasToken: ["BNB", "ETH", "TRX"][i],
      gasBalance: "-",
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    };
  });
}
