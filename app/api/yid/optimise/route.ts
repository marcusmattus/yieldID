import { NextResponse, type NextRequest } from 'next/server';
import { parseHorizon } from '@/lib/defi/rank';
import { optimiseLookup } from '@/lib/server/optimise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * YieldID lookup: GET /api/yid/optimise?q=marcus&horizon=30
 * q is a YieldID handle, handle@domain, a Solana address or an 0x address.
 * Returns the idle stablecoins in the name's wallets and where each would
 * earn most net. Read-only; free.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const report = await optimiseLookup(sp.get('q') ?? sp.get('handle') ?? '', parseHorizon(sp.get('horizon')));
  if (!report.ok) return NextResponse.json({ status: report.status, error: report.message }, { status: report.httpStatus });
  return NextResponse.json(report, { headers: { 'cache-control': 'public, s-maxage=30' } });
}
