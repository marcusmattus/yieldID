import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'yid_session';
export const NONCE_COOKIE = 'yid_nonce';
const SESSION_TTL_SEC = 60 * 60 * 12;
export const NONCE_TTL_SEC = 60 * 10;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters. Set it in .env.local.');
  }
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function seal(data: object): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function unseal<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as T & { exp?: number };
    if (typeof data.exp === 'number' && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export function newNonce(): string {
  return randomBytes(16).toString('hex');
}

export interface Session {
  address: string;
  exp: number;
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return unseal<Session>(jar.get(SESSION_COOKIE)?.value);
}

export function sessionToken(address: string): { token: string; maxAge: number } {
  return { token: seal({ address, exp: Date.now() + SESSION_TTL_SEC * 1000 }), maxAge: SESSION_TTL_SEC };
}
