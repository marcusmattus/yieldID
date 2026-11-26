import { NextResponse } from 'next/server';
import { body, handle, keyFrom } from '@/lib/agent/http';
import { svcProposals, svcPropose } from '@/lib/agent/service';
import type { ProposeInput } from '@/lib/pot';

export async function GET(req: Request) {
  const k = await keyFrom(req);
  if ('res' in k) return k.res;
  try {
    return NextResponse.json({ ok: true, proposals: await svcProposals(k.key) });
  } catch (e) {
    return handle(e);
  }
}

/** Propose a deposit into, or withdrawal from, a venue. The owner signs; the agent cannot. */
export async function POST(req: Request) {
  const k = await keyFrom(req);
  if ('res' in k) return k.res;
  try {
    const b = await body<ProposeInput>(req);
    const p = await svcPropose(k.key, { kind: b.kind as ProposeInput['kind'], venueId: String(b.venueId ?? ''), amountUsdc: Number(b.amountUsdc) });
    return NextResponse.json({ ok: true, proposal: p });
  } catch (e) {
    return handle(e);
  }
}
