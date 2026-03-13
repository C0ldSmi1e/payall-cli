import { bsc, mainnet, type Chain } from "viem/chains";

export interface ChainConfig {
  name: string;
  type: "evm" | "tron";
  nativeToken: string;
  usdtAddress: string;
  usdtDecimals: number;
  rpcUrl: string;
  viemChain?: Chain;
}

export const CHAINS: Record<string, ChainConfig> = {
  bsc: {
    name: "BSC",
    type: "evm",
    nativeToken: "BNB",
    usdtAddress: "0x55d398326f99059fF775485246999027B3197955",
    usdtDecimals: 18,
    rpcUrl: process.env.PAYALL_BSC_RPC || "https://bsc-dataseed1.binance.org",
    viemChain: bsc,
  },
  eth: {
    name: "ETH",
    type: "evm",
    nativeToken: "ETH",
    usdtAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    usdtDecimals: 6,
    rpcUrl: process.env.PAYALL_ETH_RPC || "https://ethereum-rpc.publicnode.com",
    viemChain: mainnet,
  },
  tron: {
    name: "TRON",
    type: "tron",
    nativeToken: "TRX",
    usdtAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    usdtDecimals: 6,
    rpcUrl: process.env.PAYALL_TRON_RPC || "https://api.trongrid.io",
  },
};

export const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
