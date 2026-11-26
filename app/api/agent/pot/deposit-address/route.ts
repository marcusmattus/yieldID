import { NextResponse } from 'next/server';
import { handle, keyFrom } from '@/lib/agent/http';
import { svcDepositAddress } from '@/lib/agent/service';

/** For exchange withdrawal tools: where to send USDC to fund the pot. */
export async function GET(req: Request) {
  const k = await keyFrom(req);
  if ('res' in k) return k.res;
  try {
    return NextResponse.json({ ok: true, ...(await svcDepositAddress(k.key)) });
  } catch (e) {
    return handle(e);
  }
}
