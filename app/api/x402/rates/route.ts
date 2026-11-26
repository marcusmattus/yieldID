import { NextResponse } from 'next/server';
import { potRates } from '@/lib/pot';
import { paywallFromEnv, requirePayment, withSettlement } from '@/lib/x402/server';

/**
 * Pay-per-call rate board over x402: any agent or exchange tool with USDC on
 * Solana can read it, no account or key. Price: X402_RATES_PRICE_MICRO
 * (default 10000 = 0.01 USDC).
 */
export async function GET(req: Request) {
  const pw = await paywallFromEnv();
  if (!pw.ok) return NextResponse.json({ ok: false, reason: pw.reason, fix: pw.fix }, { status: 503 });
  const price = BigInt(process.env.X402_RATES_PRICE_MICRO ?? '10000');
  const r = await requirePayment(req, pw.cfg, { amountMicro: price, resource: req.url, description: 'YieldID stable venue board, ranked by net rate' });
  if (!r.paid) return r.response;
  return withSettlement(NextResponse.json({ ok: true, ...(await potRates()) }), r.settlement);
}
