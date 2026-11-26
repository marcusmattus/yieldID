import { NextResponse, type NextRequest } from 'next/server';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { parseLiveQuery } from '@/lib/defi/query';
import { rankLive } from '@/lib/defi/rank';
import { readLiveVenues } from '@/lib/server/discovery';
import { withX402 } from '@/lib/server/x402';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Paid feed for agents, priced per call in USDC over x402.
 * GET /api/x402/yields?horizon=30&chain=Solana,Base&asset=USDC&minTvl=5000000&limit=50
 */
async function handler(req: NextRequest) {
  const q = parseLiveQuery(req.nextUrl.searchParams);
  const venues = await readLiveVenues();
  // A failed read returns 503, which cancels the payment: the agent is not charged.
  if (!venues.ok) return NextResponse.json({ error: `Live rates unavailable: ${venues.error}` }, { status: 503 });
  const { rows, notRanked } = rankLive(venues.data, q);
  return NextResponse.json({
    source: 'DefiLlama yields API',
    readAt: new Date(venues.readAt).toISOString(),
    stale: venues.stale,
    query: q,
    formula: 'net = gross - moveCost * 365 / horizonDays',
    notes: [
      'gross is the pool base APY; rewardPct is paid in other tokens and is not counted.',
      'moveCostPct is an estimated round trip from USDC on Solana, not a quote.',
      'Rates are variable and can fall to zero. Not financial advice.',
    ],
    count: rows.length,
    ranked: rows.slice(0, q.limit),
    notRanked,
  });
}

export const GET = withX402(handler, {
  description: 'Stablecoin yield venues on Solana, Base, Arbitrum, Ethereum and Hyperliquid, ranked net of the cost to move, from live DefiLlama data.',
  mimeType: 'application/json',
  serviceName: 'YieldID',
  tags: ['defi', 'yield', 'stablecoins', 'solana', 'base'],
  extensions: declareDiscoveryExtension({
    input: { horizon: '30', chain: 'Solana,Base', asset: 'USDC', limit: '20' },
    inputSchema: {
      type: 'object',
      properties: {
        horizon: { type: 'string', enum: ['7', '14', '30', '90', '365'], description: 'Days you expect to stay; spreads the move cost.' },
        chain: { type: 'string', description: 'Comma list of Solana, Base, Arbitrum, Ethereum, Hyperliquid.' },
        asset: { type: 'string', description: 'Comma list of USDC, USDT, PYUSD, USDS, DAI, USDG.' },
        minTvl: { type: 'string', description: 'Minimum pool TVL in USD.' },
        limit: { type: 'string', description: 'Rows to return, up to 200.' },
      },
    },
    output: {
      example: {
        count: 1,
        ranked: [{ rank: 1, venue: 'Jupiter Lend', chain: 'Solana', asset: 'USDC', grossPct: 4.42, moveCostPct: 0.01, annualisedMovePct: 0.12, netPct: 4.3 }],
      },
    },
  }),
});
