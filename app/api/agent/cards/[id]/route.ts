import { NextResponse } from 'next/server';
import { body, handle, keyFrom, ownerFromSession } from '@/lib/agent/http';
import { svcUpdateCard } from '@/lib/agent/service';
import { setCardLimit, setCardStatus } from '@/lib/card';
import type { LimitWindow } from '@/lib/card/issuer';

type Patch = { status: 'active' | 'frozen' | 'closed'; spendLimitUsdc: number; limitWindow: LimitWindow };

/** Freeze, unfreeze or change the limit. Only the signed-in owner can close a card. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const b = await body<Patch>(req);
    const limit = b.spendLimitUsdc === undefined ? undefined : Number(b.spendLimitUsdc);
    if (req.headers.get('authorization')) {
      const k = await keyFrom(req);
      if ('res' in k) return k.res;
      const status = b.status === 'closed' ? ('closed' as never) : b.status;
      return NextResponse.json({ ok: true, card: await svcUpdateCard(k.key, id, { status, spendLimitUsdc: limit, limitWindow: b.limitWindow }) });
    }
    const o = await ownerFromSession();
    if ('res' in o) return o.res;
    let card = null;
    if (b.status) card = await setCardStatus(o.owner, id, b.status);
    if (limit !== undefined) card = await setCardLimit(o.owner, id, limit, b.limitWindow);
    if (!card) throw new Error('Nothing to change. Send status or spendLimitUsdc.');
    return NextResponse.json({ ok: true, card });
  } catch (e) {
    return handle(e);
  }
}
