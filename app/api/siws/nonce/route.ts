import { NextResponse, type NextRequest } from 'next/server';
import { newNonce, NONCE_COOKIE, NONCE_TTL_SEC, seal } from '@/lib/server/session';

/** Issue a single-use nonce for the sign-in message. The client builds the message; the server checks every field. */
export async function POST(req: NextRequest) {
  const nonce = newNonce();
  const issuedAt = new Date();
  const expirationTime = new Date(issuedAt.getTime() + NONCE_TTL_SEC * 1000);
  const host = req.headers.get('host') ?? 'localhost';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  const res = NextResponse.json({
    nonce,
    domain: host,
    uri: `${proto}://${host}/sign`,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expirationTime.toISOString(),
    // Mainnet only: RPC registration, the USDC mint and explorer links all target mainnet.
    chainId: 'mainnet',
  });
  res.cookies.set(NONCE_COOKIE, seal({ nonce, exp: expirationTime.getTime() }), {
    httpOnly: true,
    sameSite: 'strict',
    secure: proto === 'https',
    path: '/',
    maxAge: NONCE_TTL_SEC,
  });
  return res;
}
