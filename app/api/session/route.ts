import { NextResponse } from 'next/server';
import { getSession, SESSION_COOKIE } from '@/lib/server/session';

export async function GET() {
  const s = await getSession();
  return NextResponse.json(s ? { address: s.address } : { address: null });
}

/** Disconnect: clears the session. The wallet itself is disconnected client-side through Privy. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
