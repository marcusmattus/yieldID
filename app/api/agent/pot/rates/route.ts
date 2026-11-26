import { NextResponse } from 'next/server';
import { handle, keyFrom } from '@/lib/agent/http';
import { svcPotRates } from '@/lib/agent/service';

export async function GET(req: Request) {
  const k = await keyFrom(req);
  if ('res' in k) return k.res;
  try {
    return NextResponse.json({ ok: true, ...(await svcPotRates(k.key)) });
  } catch (e) {
    return handle(e);
  }
}
