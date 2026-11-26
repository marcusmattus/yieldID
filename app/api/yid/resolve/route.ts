import { NextResponse, type NextRequest } from 'next/server';
import { resolutionHttpStatus, resolveYid } from '@/lib/server/yidResolve';

/**
 * Resolve a YieldID by reading its DNS TXT record and checking the signature
 * against the Solana key it names. Anyone can do this check without us.
 */
export async function GET(req: NextRequest) {
  const r = await resolveYid(req.nextUrl.searchParams.get('handle') ?? '');
  return NextResponse.json(r, { status: resolutionHttpStatus(r) });
}
