import { NextResponse } from 'next/server';
import { rampSetup } from '@/lib/ramp';
import { isRampPurchaseEvent, RAMP_WEBHOOK_PUBLIC_KEY, rampCryptoAmount, verifyRampSignature } from '@/lib/server/ramp';

export const runtime = 'nodejs';

/**
 * Ramp calls this on each major purchase status change (CREATED, RELEASED,
 * RETURNED). The body is trusted only after the signature checks out against
 * Ramp's published key for the configured environment.
 *
 * YieldID keeps no database yet: a verified event is logged (visible in the
 * deployment's runtime logs) and acknowledged. The user's page tracks the same
 * purchase directly with Ramp and watches the balance arrive on chain.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Body is not JSON.' }, { status: 400 });
  }
  const { env } = rampSetup(process.env);
  const ok = verifyRampSignature(body, req.headers.get('x-body-signature'), RAMP_WEBHOOK_PUBLIC_KEY[env]);
  if (!ok) return NextResponse.json({ error: 'Signature does not verify against Ramp’s key.' }, { status: 401 });
  if (!isRampPurchaseEvent(body)) return NextResponse.json({ ok: true, ignored: 'Not a purchase event.' });

  const p = body.purchase;
  console.info('[ramp] purchase', JSON.stringify({
    type: body.type,
    id: p.id,
    status: p.status,
    receiver: p.receiverAddress,
    amount: rampCryptoAmount(p),
    asset: `${p.asset.chain ?? ''}_${p.asset.symbol}`,
    tx: p.finalTxHash ?? null,
  }));
  return NextResponse.json({ ok: true });
}
