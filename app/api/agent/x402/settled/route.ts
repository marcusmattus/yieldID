import { NextResponse } from 'next/server';
import { body, handle, keyFrom } from '@/lib/agent/http';
import { svcX402Settled } from '@/lib/agent/service';

export async function POST(req: Request) {
  const k = await keyFrom(req);
  if ('res' in k) return k.res;
  try {
    const b = await body<{ reservationId: string; txSignature: string }>(req);
    return NextResponse.json(await svcX402Settled(k.key, String(b.reservationId ?? ''), String(b.txSignature ?? '')));
  } catch (e) {
    return handle(e);
  }
}
