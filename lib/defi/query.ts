import type { Chain } from '@/lib/rates';
import { ROUTED_ASSETS } from './pools';
import { parseHorizon, type LiveQuery } from './rank';

const CHAINS: Chain[] = ['Solana', 'Base', 'Arbitrum', 'Ethereum', 'Hyperliquid'];

function list<T extends string>(raw: string | null, allowed: readonly T[]): T[] | undefined {
  if (!raw) return undefined;
  const lower = new Map(allowed.map((a) => [a.toLowerCase(), a]));
  const out = raw.split(',').map((s) => lower.get(s.trim().toLowerCase())).filter((x): x is T => !!x);
  return out.length ? out : undefined;
}

/** Query string → ranking query. Unknown values are ignored, never guessed. */
export function parseLiveQuery(sp: URLSearchParams): LiveQuery & { limit: number } {
  const minTvl = Number(sp.get('minTvl'));
  const limit = Number(sp.get('limit'));
  return {
    horizonDays: parseHorizon(sp.get('horizon')),
    chains: list(sp.get('chain'), CHAINS),
    assets: list(sp.get('asset'), ROUTED_ASSETS),
    minTvlUsd: Number.isFinite(minTvl) && minTvl > 0 ? minTvl : undefined,
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50,
  };
}
