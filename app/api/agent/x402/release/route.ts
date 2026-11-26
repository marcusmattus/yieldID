import { NextResponse } from 'next/server';
import { body, handle, keyFrom } from '@/lib/agent/http';
import { svcX402Release } from '@/lib/agent/service';

/** Give back a reservation for a payment that never landed. */
export async function POST(req: Request) {
  const k = await keyFrom(req);
  if ('res' in k) return k.res;
  try {
    const b = await body<{ reservationId: string }>(req);
    return NextResponse.json(await svcX402Release(k.key, String(b.reservationId ?? '')));
  } catch (e) {
    return handle(e);
  }
}
