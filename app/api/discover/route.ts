import { NextResponse, type NextRequest } from 'next/server';
import { parseLiveQuery } from '@/lib/defi/query';
import { rankLive } from '@/lib/defi/rank';
import { readLiveVenues, readPaidServices } from '@/lib/server/discovery';
import { readX402Config } from '@/lib/x402/networks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Free discovery summary for people and agents: the top five stable venues
 * ranked net, the most-used stablecoin-priced x402 services, and how to call
 * the paid full feed. GET /api/discover?horizon=30&chain=Solana&asset=USDC
 */
export async function GET(req: NextRequest) {
  const q = parseLiveQuery(req.nextUrl.searchParams);
  const [venues, services] = await Promise.all([readLiveVenues(), readPaidServices()]);
  const x402 = readX402Config(process.env);
  const origin = req.nextUrl.origin;

  const yields = venues.ok
    ? {
        source: 'DefiLlama yields API',
        readAt: new Date(venues.readAt).toISOString(),
        stale: venues.stale,
        horizonDays: q.horizonDays,
        formula: 'net = gross - moveCost * 365 / horizonDays',
        note: 'Gross is base APY only; token rewards are listed but not counted. Move cost is an estimate from USDC on Solana, not a quote.',
        top: rankLive(venues.data, q).rows.slice(0, 5),
      }
    : { error: venues.error };

  const paidServices = services.ok
    ? {
        source: 'x402 Bazaar (Coinbase CDP facilitator)',
        readAt: new Date(services.readAt).toISOString(),
        stale: services.stale,
        note: 'Listed by their operators. YieldID has not vetted these services.',
        top: services.data.slice(0, 10),
      }
    : { error: services.error };

  return NextResponse.json(
    {
      yields,
      paidServices,
      paid: {
        endpoint: `${origin}/api/x402/yields`,
        protocol: 'x402 v2',
        priceUsd: x402.problem ? null : x402.priceUsd,
        networks: x402.accepts.map((a) => a.net.label),
        available: !x402.problem,
        returns: 'Every ranked venue for your query, plus the ones not ranked and why.',
      },
      disclaimer: 'Rates are variable and can fall to zero. Venues, bridges and stablecoin issuers can fail. Not financial advice.',
    },
    { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}
