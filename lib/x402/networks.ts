/**
 * Networks and USDC contracts YieldID accepts x402 payments in.
 * x402 v2 names networks by CAIP-2 id.
 */

export type X402Family = 'svm' | 'evm';

export interface UsdcAsset {
  network: `${string}:${string}`;
  label: string;
  family: X402Family;
  asset: string;
  decimals: 6;
  /** EIP-712 domain of the USDC contract, needed for EIP-3009 on EVM. */
  eip712?: { name: string; version: string };
  testnet: boolean;
}

export const X402_NETWORKS: Record<string, UsdcAsset> = {
  solana: {
    network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', label: 'Solana', family: 'svm',
    asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, testnet: false,
  },
  'solana-devnet': {
    network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', label: 'Solana devnet', family: 'svm',
    asset: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', decimals: 6, testnet: true,
  },
  base: {
    network: 'eip155:8453', label: 'Base', family: 'evm',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, eip712: { name: 'USD Coin', version: '2' }, testnet: false,
  },
  'base-sepolia': {
    network: 'eip155:84532', label: 'Base Sepolia', family: 'evm',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, eip712: { name: 'USDC', version: '2' }, testnet: true,
  },
};

export function usdcByNetwork(network: string): UsdcAsset | undefined {
  return Object.values(X402_NETWORKS).find((n) => n.network === network);
}

/** Label for a CAIP-2 id, falling back to the id itself. */
export function networkLabel(network: string): string {
  if (network === 'eip155:42161') return 'Arbitrum';
  if (network === 'eip155:137') return 'Polygon';
  if (network === 'eip155:10') return 'Optimism';
  if (network === 'eip155:1') return 'Ethereum';
  return usdcByNetwork(network)?.label ?? network;
}

export interface X402Config {
  facilitatorUrl: string;
  priceUsd: string;
  accepts: Array<{ net: UsdcAsset; payTo: string }>;
  /** Null when at least one network is ready; otherwise why the paid API is off. */
  problem: string | null;
}

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;

export function readX402Config(env: Record<string, string | undefined>): X402Config {
  const facilitatorUrl = (env.X402_FACILITATOR_URL || 'https://x402.org/facilitator').replace(/\/$/, '');
  const priceUsd = env.X402_PRICE_USD || '0.001';
  const names = (env.X402_NETWORKS || 'solana-devnet,base-sepolia').split(',').map((s) => s.trim()).filter(Boolean);
  const accepts: X402Config['accepts'] = [];
  const skipped: string[] = [];
  for (const name of names) {
    const net = X402_NETWORKS[name];
    if (!net) {
      skipped.push(`${name} is not a known network`);
      continue;
    }
    const payTo = (net.family === 'svm' ? env.X402_PAY_TO_SOLANA : env.X402_PAY_TO_EVM)?.trim();
    const valid = payTo && (net.family === 'svm' ? SOLANA_ADDR.test(payTo) : EVM_ADDR.test(payTo));
    if (!valid) {
      skipped.push(`${net.label} needs ${net.family === 'svm' ? 'X402_PAY_TO_SOLANA' : 'X402_PAY_TO_EVM'}`);
      continue;
    }
    accepts.push({ net, payTo: payTo! });
  }
  if (!/^\d+(\.\d{1,6})?$/.test(priceUsd) || Number(priceUsd) <= 0) {
    return { facilitatorUrl, priceUsd, accepts: [], problem: `X402_PRICE_USD "${priceUsd}" is not a positive dollar amount.` };
  }
  return { facilitatorUrl, priceUsd, accepts, problem: accepts.length ? null : `No x402 network is ready: ${skipped.join('; ')}.` };
}

/** Dollar string to USDC base units (6 decimals), without floating point. */
export function usdToUnits(usd: string): string {
  const [w, f = ''] = usd.split('.');
  return (BigInt(w) * 1_000_000n + BigInt((f + '000000').slice(0, 6))).toString();
}
