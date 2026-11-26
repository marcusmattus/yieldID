import { NextResponse, type NextRequest } from 'next/server';
import { body, ownerFromSession } from '@/lib/agent/http';
import { setKillSwitch } from '@/lib/agent/keys';

/** Owner only: pause or resume every agent key at once. */
export async function POST(req: NextRequest) {
  const o = await ownerFromSession();
  if ('res' in o) return o.res;
  const { on } = await body<{ on: boolean }>(req);
  await setKillSwitch(o.owner, on === true);
  return NextResponse.json({ ok: true, killSwitch: on === true });
}
