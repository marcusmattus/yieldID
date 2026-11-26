import { networkLabel } from './networks';

/**
 * x402 services listed in the Bazaar, the public catalogue of paid x402
 * endpoints kept by Coinbase's CDP facilitator. Anyone running an x402
 * endpoint can be listed; YieldID shows them as found and vets none of them.
 */

export const BAZAAR_URL = 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources';

/** USD stablecoins accepted as prices, by network and contract or mint. */
const STABLE_LIST: Array<[network: string, asset: string, symbol: string]> = [
  ['eip155:8453', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC'],
  ['eip155:42161', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', 'USDC'],
  ['eip155:137', '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', 'USDC'],
  ['eip155:10', '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', 'USDC'],
  ['eip155:1', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'USDC'],
  ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC'],
  ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 'USDT'],
];
// EVM addresses are case-insensitive; Solana mints are case-sensitive base58 and compare exactly.
const assetKey = (network: string, asset: string) => `${network}|${network.startsWith('eip155:') ? asset.toLowerCase() : asset}`;
const USD_STABLES = new Map(STABLE_LIST.map(([n, a, s]) => [assetKey(n, a), s]));

export interface BazaarItem {
  resource: string;
  type?: string;
  description?: string;
  lastUpdated?: string;
  accepts: Array<{ scheme: string; network: string; amount?: string; maxAmountRequired?: string; asset: string; payTo: string }>;
  extensions?: { bazaar?: { info?: { input?: { method?: string } } } };
  quality?: { l30DaysTotalCalls?: number; l30DaysUniquePayers?: number; lastCalledAt?: string };
}

export interface PaidService {
  url: string;
  host: string;
  description: string;
  method: string;
  /** Cheapest stablecoin price per call, in dollars. */
  priceUsd: number;
  stable: string;
  networks: string[];
  payTo: string;
  calls30d: number;
  payers30d: number;
  lastCalledAt: string | null;
}

export function toPaidService(item: BazaarItem): PaidService | null {
  let url: URL;
  try {
    url = new URL(item.resource);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const priced = item.accepts
    .map((a) => {
      const stable = USD_STABLES.get(assetKey(a.network, a.asset));
      const raw = a.amount ?? a.maxAmountRequired;
      if (!stable || !raw || !/^\d+$/.test(raw)) return null;
      return { stable, network: a.network, usd: Number(raw) / 1e6, payTo: a.payTo };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (!priced.length) return null;
  const cheapest = priced.reduce((a, b) => (b.usd < a.usd ? b : a));
  return {
    url: url.toString(),
    host: url.host,
    description: (item.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'No description given.',
    method: item.extensions?.bazaar?.info?.input?.method ?? 'GET',
    priceUsd: cheapest.usd,
    stable: cheapest.stable,
    networks: [...new Set(priced.map((p) => networkLabel(p.network)))],
    payTo: cheapest.payTo,
    calls30d: item.quality?.l30DaysTotalCalls ?? 0,
    payers30d: item.quality?.l30DaysUniquePayers ?? 0,
    lastCalledAt: item.quality?.lastCalledAt ?? null,
  };
}

/**
 * Keep stablecoin-priced services, one row per URL, ranked by how many
 * distinct payers used them in the last 30 days (harder to fake than calls),
 * with at most two endpoints per host.
 */
export function rankServices(items: BazaarItem[], opts: { network?: 'Solana' | 'Base'; maxPerHost?: number } = {}): PaidService[] {
  const byUrl = new Map<string, PaidService>();
  for (const item of items) {
    const s = toPaidService(item);
    if (!s) continue;
    if (opts.network && !s.networks.includes(opts.network)) continue;
    const prev = byUrl.get(s.url);
    if (!prev || s.payers30d > prev.payers30d) byUrl.set(s.url, s);
  }
  const sorted = [...byUrl.values()].sort((a, b) => b.payers30d - a.payers30d || b.calls30d - a.calls30d);
  // At most a few endpoints per host, so one operator's catalogue does not fill the list.
  const perHost = new Map<string, number>();
  return sorted.filter((s) => {
    const n = (perHost.get(s.host) ?? 0) + 1;
    perHost.set(s.host, n);
    return n <= (opts.maxPerHost ?? 2);
  });
}
