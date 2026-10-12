import { NextResponse, type NextRequest } from 'next/server';
import { base58ToBytes } from '@/lib/base58';
import { verifySolanaSignature } from '@/lib/server/ed25519';
import { NONCE_COOKIE, SESSION_COOKIE, sessionToken, unseal } from '@/lib/server/session';
import { parseSiwsMessage, SIWS_STATEMENT } from '@/lib/siws';

function refuse(reason: string, fix: string, status = 400) {
  return NextResponse.json({ ok: false, reason, fix }, { status });
}

export async function POST(req: NextRequest) {
  let body: { message?: string; signature?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return refuse('Request body is not JSON.', 'Send { message, signature, address }.');
  }
  const { message, signature, address } = body;
  if (!message || !signature || !address) return refuse('Missing message, signature or address.', 'Sign the message again.');

  const fields = parseSiwsMessage(message);
  if (!fields) return refuse('The message is not a valid sign-in message.', 'Start again from Connect wallet.');

  const host = req.headers.get('host') ?? '';
  if (fields.domain !== host) return refuse(`Message is for ${fields.domain}, this site is ${host}.`, 'Sign the message this site shows.');
  if (fields.address !== address) return refuse('Message address does not match the signer.', 'Sign with the wallet named in the message.');
  if (fields.statement !== SIWS_STATEMENT) return refuse('Message statement was changed.', 'Sign the unmodified message.');
  if (Date.now() > Date.parse(fields.expirationTime)) return refuse('Message expired.', 'Request a new message and sign it within 10 minutes.');

  const stored = unseal<{ nonce: string }>(req.cookies.get(NONCE_COOKIE)?.value);
  if (!stored || stored.nonce !== fields.nonce) return refuse('Nonce is unknown or already used.', 'Request a new message.');

  let sig: Uint8Array;
  try {
    sig = base58ToBytes(signature);
  } catch {
    return refuse('Signature is not base58.', 'Sign the message again.');
  }
  if (!verifySolanaSignature(address, new TextEncoder().encode(message), sig)) {
    return refuse('Signature does not match the address.', 'Sign with the wallet named in the message.', 401);
  }

  const { token, maxAge } = sessionToken(address);
  const res = NextResponse.json({ ok: true, address });
  const secure = (req.headers.get('x-forwarded-proto') ?? '') === 'https' || !host.startsWith('localhost');
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge });
  res.cookies.delete(NONCE_COOKIE);
  return res;
}
