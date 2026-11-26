import type { Chain, VenueRead } from '@/lib/rates';

/**
 * Live stable venues from DefiLlama's open yields API (yields.llama.fi/pools).
 *
 * Only plain stablecoin deposits are kept: single exposure, no impermanent
 * loss, a stablecoin YieldID routes, on a chain YieldID routes to, and enough
 * TVL that the rate means something. Gross is the pool's base APY. Reward APY
 * is paid in other tokens whose price moves, so it is shown but never counted
 * in gross or net.
 */

export interface LlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apyMean30d?: number | null;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
  poolMeta: string | null;
  outlier?: boolean;
}

export interface LiveVenue extends VenueRead {
  project: string;
  pool: string;
  tvlUsd: number;
  rewardPct: number | null;
  mean30dPct: number | null;
  url: string;
}

export const ROUTED_ASSETS = ['USDC', 'USDT', 'PYUSD', 'USDS', 'DAI', 'USDG'] as const;
export const MIN_TVL_USD = 1_000_000;

const CHAIN: Record<string, Chain> = {
  Solana: 'Solana',
  Base: 'Base',
  Arbitrum: 'Arbitrum',
  Ethereum: 'Ethereum',
  'Hyperliquid L1': 'Hyperliquid',
  Hyperliquid: 'Hyperliquid',
};

/**
 * Estimated one-off cost of a round trip into the venue from USDC on Solana,
 * as a percent of size. An estimate for ranking, not a quote: deposit and
 * withdraw fees are near zero on Solana; other chains add a CCTP transfer and
 * gas on both sides (more on Ethereum mainnet); Hyperliquid adds its bridge.
 * Every live row shows this figure as estimated.
 */
export const MOVE_COST_MODEL: Record<Chain, number> = {
  Solana: 0.01,
  Base: 0.05,
  Arbitrum: 0.05,
  Ethereum: 0.15,
  Hyperliquid: 0.1,
};

const RWA_HINT = /\b(rwa|t-?bill|treasur|clo|credit|institutional|private)\b/i;
const RWA_PROJECTS = new Set(['centrifuge-protocol', 'midas-rwa', 'ondo-yield-assets', 'credix', 'maple', 'superstate']);

export function prettyProject(slug: string): string {
  return slug.split('-').map((w) => (w.length <= 3 && w !== 'cdp' ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ').replace(/\bV(\d)/, 'v$1');
}

export function keepPool(p: LlamaPool): boolean {
  return (
    p.stablecoin === true &&
    p.exposure === 'single' &&
    p.ilRisk === 'no' &&
    !p.outlier &&
    p.chain in CHAIN &&
    (ROUTED_ASSETS as readonly string[]).includes(p.symbol) &&
    typeof p.apyBase === 'number' &&
    Number.isFinite(p.apyBase) &&
    p.apyBase > 0 &&
    p.apyBase < 100 &&
    p.tvlUsd >= MIN_TVL_USD
  );
}

export function toLiveVenue(p: LlamaPool, readAt: number): LiveVenue {
  const chain = CHAIN[p.chain];
  const product = p.poolMeta ? `${p.symbol} · ${p.poolMeta}` : `${p.symbol} deposit`;
  return {
    id: `llama:${p.pool}`,
    name: prettyProject(p.project),
    product,
    chain,
    sleeve: RWA_PROJECTS.has(p.project) || RWA_HINT.test(p.poolMeta ?? '') ? 'rwa' : 'forge',
    asset: p.symbol,
    grossPct: p.apyBase as number,
    moveCostPct: MOVE_COST_MODEL[chain],
    capacity: p.tvlUsd,
    readAt,
    source: 'live',
    project: p.project,
    pool: p.pool,
    tvlUsd: p.tvlUsd,
    rewardPct: p.apyReward && p.apyReward > 0 ? p.apyReward : null,
    mean30dPct: typeof p.apyMean30d === 'number' ? p.apyMean30d : null,
    url: `https://defillama.com/yields/pool/${p.pool}`,
  };
}

export function liveVenuesFrom(pools: LlamaPool[], readAt: number): LiveVenue[] {
  return pools.filter(keepPool).map((p) => toLiveVenue(p, readAt));
}
