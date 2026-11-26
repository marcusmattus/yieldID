import { NextResponse } from 'next/server';
import { body, handle, keyFrom } from '@/lib/agent/http';
import { svcX402Authorize, type X402AuthorizeInput } from '@/lib/agent/service';

/**
 * Called by an agent before it signs an x402 payment from its own wallet.
 * Checks scope, caps, recipient list and kill switch, and reserves the amount.
 */
export async function POST(req: Request) {
  const k = await keyFrom(req);
  if ('res' in k) return k.res;
  try {
    const b = await body<X402AuthorizeInput>(req);
    const r = await svcX402Authorize(k.key, {
      amountMicro: String(b.amountMicro ?? ''),
      payTo: String(b.payTo ?? ''),
      resource: String(b.resource ?? ''),
      network: String(b.network ?? ''),
      asset: String(b.asset ?? ''),
    });
    return NextResponse.json(r, { status: r.ok ? 200 : 403 });
  } catch (e) {
    return handle(e);
  }
}
