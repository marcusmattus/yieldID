/**
 * The one piece of arithmetic the app exists to show.
 *
 * A venue's rate is annual. The cost of moving there is paid once.
 *   net  = gross - (moveCost * 365 / horizonDays)
 *   edge = net(venue) - net(current), in basis points
 *
 * Gross, annualised move cost, net and edge stay separate fields. They are
 * never collapsed into one number, and the board is never sorted by gross.
 */

export type Chain = 'Solana' | 'Hyperliquid' | 'Base' | 'Ethereum' | 'Arbitrum';
export type SleeveKind = 'forge' | 'rwa';
export type DataSource = 'live' | 'sample' | 'unverified';

export interface VenueRead {
  id: string;
  name: string;
  product: string;
  chain: Chain;
  sleeve: SleeveKind;
  asset: string;
  /** Annual gross rate, percent. Null when the read failed. */
  grossPct: number | null;
  /** One-off cost of moving there (fees + simulated slippage + any route), percent of size. */
  moveCostPct: number | null;
  /** Size the venue can take at the quoted rate, in asset units. */
  capacity: number | null;
  /** When the rate was read, ms since epoch. */
  readAt: number | null;
  /** Set when the read failed. */
  error?: string;
  source: DataSource;
}

export interface RankedVenue extends VenueRead {
  grossPct: number;
  moveCostPct: number;
  annualisedMovePct: number;
  netPct: number;
  /** Null when there is no current sleeve to compare against. */
  edgeBp: number | null;
  isCurrent: boolean;
}

export type NotRankedReason = 'stale' | 'read_failed' | 'capacity' | 'unverified';

export interface NotRanked {
  venue: VenueRead;
  reason: NotRankedReason;
  detail: string;
}

export interface RankInput {
  venues: VenueRead[];
  currentId: string | null;
  horizonDays: number;
  maxReadAgeSec: number;
  minCapacity: number;
  includeUnverified: boolean;
  now: number;
}

export interface RankResult {
  ranked: RankedVenue[];
  notRanked: NotRanked[];
  currentNetPct: number | null;
}

export function annualiseMoveCost(moveCostPct: number, horizonDays: number): number {
  if (!(horizonDays > 0)) throw new Error('horizonDays must be greater than 0');
  return (moveCostPct * 365) / horizonDays;
}

export function netRate(grossPct: number, moveCostPct: number, horizonDays: number): number {
  return grossPct - annualiseMoveCost(moveCostPct, horizonDays);
}

export function edgeBp(netPct: number, currentNetPct: number): number {
  return (netPct - currentNetPct) * 100;
}

/**
 * Rank venues by net. A venue whose read failed, is older than the limit, is
 * below the capacity floor, or comes from an unverified adapter is not ranked;
 * it is returned with its reason instead.
 */
export function rankVenues(input: RankInput): RankResult {
  const { venues, currentId, horizonDays, maxReadAgeSec, minCapacity, includeUnverified, now } = input;
  const notRanked: NotRanked[] = [];
  const eligible: Array<VenueRead & { grossPct: number; moveCostPct: number }> = [];

  for (const v of venues) {
    if (v.error || v.grossPct === null || v.moveCostPct === null || v.readAt === null) {
      notRanked.push({ venue: v, reason: 'read_failed', detail: v.error ?? 'No rate was read.' });
      continue;
    }
    const ageSec = (now - v.readAt) / 1000;
    if (ageSec > maxReadAgeSec) {
      notRanked.push({
        venue: v,
        reason: 'stale',
        detail: `Last read ${Math.round(ageSec)} s ago, older than the ${maxReadAgeSec} s limit. Not ranked until a fresh read.`,
      });
      continue;
    }
    if (v.source === 'unverified' && !includeUnverified) {
      notRanked.push({ venue: v, reason: 'unverified', detail: 'Adapter not yet verified against chain.' });
      continue;
    }
    const isCurrent = v.id === currentId;
    if (!isCurrent && (v.capacity === null || v.capacity < minCapacity)) {
      notRanked.push({
        venue: v,
        reason: 'capacity',
        detail: `Capacity ${v.capacity ?? 'unknown'} is below the rule's minimum of ${minCapacity}.`,
      });
      continue;
    }
    eligible.push(v as VenueRead & { grossPct: number; moveCostPct: number });
  }

  const withNet = eligible.map((v) => {
    const isCurrent = v.id === currentId;
    // Already at the current venue: there is no move to pay for.
    const moveCostPct = isCurrent ? 0 : v.moveCostPct;
    const annualisedMovePct = annualiseMoveCost(moveCostPct, horizonDays);
    return { ...v, moveCostPct, annualisedMovePct, netPct: v.grossPct - annualisedMovePct, isCurrent };
  });

  const current = withNet.find((v) => v.isCurrent);
  const currentNetPct = current ? current.netPct : null;

  const ranked: RankedVenue[] = withNet
    .map((v) => ({ ...v, edgeBp: currentNetPct === null ? null : edgeBp(v.netPct, currentNetPct) }))
    .sort((a, b) => b.netPct - a.netPct);

  return { ranked, notRanked, currentNetPct };
}

/** Percent with two decimals, e.g. 6.39%. */
export function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

/** Basis points with sign, e.g. +139 bp. */
export function fmtBp(n: number | null): string {
  if (n === null) return 'n/a';
  const r = Math.round(n);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)} bp`;
}
