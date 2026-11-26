import { NextResponse } from 'next/server';
import { body, handle, keyFrom, ownerFromSession } from '@/lib/agent/http';
import { svcCards, svcIssueCard } from '@/lib/agent/service';
import { issueCard, listCards } from '@/lib/card';
import type { LimitWindow } from '@/lib/card/issuer';

/** With an API key: agent access by scope. Without one: the signed-in owner. */
export async function GET(req: Request) {
  try {
    if (req.headers.get('authorization')) {
      const k = await keyFrom(req);
      if ('res' in k) return k.res;
      return NextResponse.json({ ok: true, cards: await svcCards(k.key) });
    }
    const o = await ownerFromSession();
    if ('res' in o) return o.res;
    return NextResponse.json({ ok: true, cards: await listCards(o.owner) });
  } catch (e) {
    return handle(e);
  }
}

export async function POST(req: Request) {
  try {
    const b = await body<{ label: string; spendLimitUsdc: number; limitWindow: LimitWindow }>(req);
    const input = { label: b.label, spendLimitUsdc: Number(b.spendLimitUsdc), limitWindow: b.limitWindow };
    if (req.headers.get('authorization')) {
      const k = await keyFrom(req);
      if ('res' in k) return k.res;
      return NextResponse.json({ ok: true, card: await svcIssueCard(k.key, input) });
    }
    const o = await ownerFromSession();
    if ('res' in o) return o.res;
    return NextResponse.json({ ok: true, card: await issueCard(o.owner, input, null) });
  } catch (e) {
    return handle(e);
  }
}
