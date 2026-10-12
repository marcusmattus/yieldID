import type { VenueRead } from './rates';

/**
 * ILLUSTRATIVE SAMPLE DATA. Round figures invented for layout and for the
 * ranking demo. Every venue here has source 'sample', and every screen that
 * renders one wraps it in a SampleRegion with the badge. Venue names are
 * generic on purpose: no real venue is shown with an invented rate.
 *
 * Replace with live adapters (lib/adapters) to show real reads.
 */
export function sampleVenues(now: number): VenueRead[] {
  const base = { asset: 'USDC', source: 'sample' as const };
  return [
    { ...base, id: 'venue-b', name: 'Venue B', product: 'USDC lending', chain: 'Solana', sleeve: 'forge', grossPct: 7, moveCostPct: 0.05, capacity: 500_000, readAt: now - 8_000 },
    { ...base, id: 'venue-d', name: 'Venue D', product: 'USDC vault', chain: 'Hyperliquid', sleeve: 'forge', grossPct: 8, moveCostPct: 0.2, capacity: 500_000, readAt: now - 12_000 },
    { ...base, id: 'venue-a', name: 'Venue A', product: 'yUSD lending, via route', chain: 'Base', sleeve: 'forge', grossPct: 9, moveCostPct: 0.3, capacity: 500_000, readAt: now - 15_000 },
    { ...base, id: 'venue-c', name: 'Venue C', product: 'USDC lending', chain: 'Solana', sleeve: 'forge', grossPct: 5, moveCostPct: 0, capacity: 500_000, readAt: now - 5_000 },
    { ...base, id: 'venue-e', name: 'Venue E', product: 'T-bill vault', chain: 'Solana', sleeve: 'rwa', grossPct: 5.5, moveCostPct: 0.1, capacity: 500_000, readAt: now - 20_000 },
    // Not ranked, each for a stated reason:
    { ...base, id: 'venue-f', name: 'Venue F', product: 'USDC vault', chain: 'Hyperliquid', sleeve: 'forge', grossPct: 10, moveCostPct: 0.1, capacity: 500_000, readAt: now - 600_000 },
    { ...base, id: 'venue-g', name: 'Venue G', product: 'USDC lending', chain: 'Solana', sleeve: 'forge', grossPct: null, moveCostPct: null, capacity: null, readAt: null, error: 'RPC returned an error on the last read. Retrying.' },
    { ...base, id: 'venue-h', name: 'Venue H', product: 'USDC lending', chain: 'Base', sleeve: 'forge', grossPct: 6, moveCostPct: 0.05, capacity: 1_000, readAt: now - 9_000 },
    { ...base, source: 'unverified', id: 'venue-k', name: 'Venue K', product: 'Funding basis', chain: 'Hyperliquid', sleeve: 'forge', grossPct: 12, moveCostPct: 0.4, capacity: 500_000, readAt: now - 9_000 },
  ];
}

export const SAMPLE_CURRENT_ID = 'venue-c';
export const SAMPLE_SIZE = 40_000;
export const SAMPLE_MOVED_TODAY = 30_000;
