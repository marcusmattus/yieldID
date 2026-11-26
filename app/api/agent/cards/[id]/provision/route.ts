import { NextResponse } from 'next/server';
import { body, fail, handle, ownerFromSession } from '@/lib/agent/http';
import { provisionCard } from '@/lib/card';
import type { ProvisionRequest } from '@/lib/card/issuer';

/**
 * Push a card into Apple Pay or Google Pay. Owner session only: the request
 * comes from the YieldID app on the owner's phone, carrying the certificates
 * and nonce (Apple) or hardware and wallet ids (Google) the OS handed it.
 * API keys are refused here on purpose.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (req.headers.get('authorization')) return fail(403, 'Agents cannot add cards to a phone wallet.', 'Open the YieldID app on your phone and tap Add to Apple Wallet or Add to Google Pay.');
  const o = await ownerFromSession();
  if ('res' in o) return o.res;
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ ok: true, ...(await provisionCard(o.owner, id, (await body<ProvisionRequest>(req)) as ProvisionRequest)) });
  } catch (e) {
    return handle(e);
  }
}
