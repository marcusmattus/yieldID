import { rankVenues, type Chain } from '@/lib/rates';
import type { LiveVenue } from './pools';

/** DefiLlama refreshes pool rates about hourly, so a read stays rankable for two hours. */
export const LIVE_MAX_READ_AGE_SEC = 2 * 60 * 60;

export interface LiveQuery {
  horizonDays: number;
  chains?: Chain[];
  assets?: string[];
  minTvlUsd?: number;
  now?: number;
}

export interface LiveRow {
  rank: number;
  id: string;
  venue: string;
  product: string;
  chain: Chain;
  asset: string;
  sleeve: string;
  grossPct: number;
  rewardPct: number | null;
  moveCostPct: number;
  moveCostEstimated: true;
  annualisedMovePct: number;
  netPct: number;
  tvlUsd: number;
  mean30dPct: number | null;
  source: 'DefiLlama yields';
  url: string;
}

const HORIZONS = [7, 14, 30, 90, 365];

export function parseHorizon(v: string | null | undefined): number {
  const n = Number(v);
  return HORIZONS.includes(n) ? n : 30;
}

export function rankLive(venues: LiveVenue[], q: LiveQuery) {
  const now = q.now ?? Date.now();
  const filtered = venues.filter(
    (v) => (!q.chains?.length || q.chains.includes(v.chain)) && (!q.assets?.length || q.assets.includes(v.asset)),
  );
  const byId = new Map(filtered.map((v) => [v.id, v]));
  const res = rankVenues({
    venues: filtered,
    currentId: null,
    horizonDays: q.horizonDays,
    maxReadAgeSec: LIVE_MAX_READ_AGE_SEC,
    minCapacity: q.minTvlUsd ?? 0,
    includeUnverified: false,
    now,
  });
  const rows: LiveRow[] = res.ranked.map((r, i) => {
    const v = byId.get(r.id)!;
    return {
      rank: i + 1,
      id: r.id,
      venue: r.name,
      product: r.product,
      chain: r.chain,
      asset: r.asset,
      sleeve: r.sleeve,
      grossPct: round(r.grossPct),
      rewardPct: v.rewardPct === null ? null : round(v.rewardPct),
      moveCostPct: r.moveCostPct,
      moveCostEstimated: true,
      annualisedMovePct: round(r.annualisedMovePct),
      netPct: round(r.netPct),
      tvlUsd: Math.round(v.tvlUsd),
      mean30dPct: v.mean30dPct === null ? null : round(v.mean30dPct),
      source: 'DefiLlama yields',
      url: v.url,
    };
  });
  return { rows, notRanked: res.notRanked.map((n) => ({ id: n.venue.id, venue: n.venue.name, reason: n.reason, detail: n.detail })) };
}

function round(n: number) {
  return Math.round(n * 10_000) / 10_000;
}
