import { moveCostBetween, venueFlags, type LiveVenue, type VenueFlag } from '@/lib/defi/pools';
import { LIVE_MAX_READ_AGE_SEC } from '@/lib/defi/rank';
import { netRate, type Chain } from '@/lib/rates';

/**
 * The YieldID optimiser: for each stablecoin balance sitting idle in a
 * wallet a YieldID names, the venues that would pay most net of the cost to
 * move it there, and what that would earn over a year at today's rate.
 *
 * A balance in a wallet earns nothing. Deposits already inside protocols are
 * not read yet, so a wallet that looks idle here may already be earning
 * elsewhere; the report says so.
 */

export interface Holding {
  chain: Chain;
  address: string;
  asset: string;
  amount: number;
}

export interface Option {
  venue: string;
  product: string;
  chain: Chain;
  grossPct: number;
  moveCostPct: number;
  netPct: number;
  /** Amount × net, for one year at today's rate. An estimate, not a promise. */
  annualUsd: number;
  tvlUsd: number;
  url: string;
  flags: VenueFlag[];
}

export interface HoldingPlan extends Holding {
  bestSameChain: Option | null;
  /** Best option with no high-rate or lock-up flag. The headline totals use this. */
  bestPlain: Option | null;
  options: Option[];
}

const isPlain = (o: Option) => !o.flags.includes('high_rate') && !o.flags.includes('lockup');

export interface OptimiseInput {
  holdings: Holding[];
  venues: LiveVenue[];
  horizonDays: number;
  /** Only suggest venues at least this size. */
  minTvlUsd: number;
  /** Ignore balances below this, in dollars. */
  minAmount: number;
  now: number;
  optionsPerHolding?: number;
}

export const DEFAULT_MIN_TVL_USD = 5_000_000;
export const DEFAULT_MIN_AMOUNT = 1;

function optionFor(h: Holding, v: LiveVenue, horizonDays: number): Option {
  const moveCostPct = moveCostBetween(h.chain, v.chain);
  const netPct = netRate(v.grossPct as number, moveCostPct, horizonDays);
  return {
    venue: v.name,
    product: v.product,
    chain: v.chain,
    grossPct: v.grossPct as number,
    moveCostPct,
    netPct,
    annualUsd: Math.max(0, (h.amount * netPct) / 100),
    tvlUsd: v.tvlUsd,
    url: v.url,
    flags: venueFlags(v),
  };
}

export function planHoldings(i: OptimiseInput) {
  const usable = i.venues.filter(
    (v) => v.grossPct !== null && v.readAt !== null && (i.now - v.readAt) / 1000 <= LIVE_MAX_READ_AGE_SEC && v.tvlUsd >= i.minTvlUsd,
  );
  const plans: HoldingPlan[] = i.holdings
    .filter((h) => h.amount >= i.minAmount)
    .map((h) => {
      const opts = usable
        .filter((v) => v.asset === h.asset)
        .map((v) => optionFor(h, v, i.horizonDays))
        .filter((o) => o.netPct > 0)
        .sort((a, b) => b.netPct - a.netPct);
      return {
        ...h,
        bestSameChain: opts.find((o) => o.chain === h.chain) ?? null,
        bestPlain: opts.find(isPlain) ?? null,
        options: opts.slice(0, i.optionsPerHolding ?? 3),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const idleUsd = plans.reduce((s, p) => s + p.amount, 0);
  // Headline: what the best unflagged venue would pay. Flagged venues are listed, never counted here.
  const potentialAnnualUsd = plans.reduce((s, p) => s + (p.bestPlain?.annualUsd ?? 0), 0);
  return {
    plans,
    totals: {
      idleUsd: round2(idleUsd),
      potentialAnnualUsd: round2(potentialAnnualUsd),
      blendedNetPct: idleUsd > 0 ? round2((potentialAnnualUsd / idleUsd) * 100) : null,
    },
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;

export type LookupTarget =
  | { kind: 'name'; handle: string }
  | { kind: 'solana'; address: string }
  | { kind: 'evm'; address: string }
  | { kind: 'invalid'; reason: string };

/** "marcus", "marcus@yieldid.xyz", a Solana address or an 0x address. */
export function parseLookup(raw: string, domain: string | undefined): LookupTarget {
  const q = raw.trim();
  if (!q) return { kind: 'invalid', reason: 'Enter a YieldID or a wallet address.' };
  if (EVM_ADDR.test(q)) return { kind: 'evm', address: q };
  if (SOLANA_ADDR.test(q) && q.length >= 32) return { kind: 'solana', address: q };
  const [handle, at] = q.toLowerCase().split('@');
  if (at !== undefined && domain && at !== domain.toLowerCase()) {
    return { kind: 'invalid', reason: `This service resolves names under ${domain}, not ${at}.` };
  }
  return { kind: 'name', handle };
}
