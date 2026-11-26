import { NextResponse } from 'next/server';
import { keyFrom } from '@/lib/agent/http';
import { whoami } from '@/lib/agent/service';

export async function GET(req: Request) {
  const k = await keyFrom(req);
  if ('res' in k) return k.res;
  return NextResponse.json({ ok: true, ...(await whoami(k.key)) });
}
