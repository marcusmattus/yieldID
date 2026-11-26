import 'server-only';
import { NextResponse } from 'next/server';
import { InputError } from './keys';
import { authenticate } from './keys';
import { getSession } from '../server/session';
import { IssuerNotConfigured } from '../card/issuer';
import { ScopeError } from './service';
import type { AgentKey } from './store';

/** Same error shape the rest of the app uses: what went wrong and how to fix it. */
export function fail(status: number, reason: string, fix: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, reason, fix, ...extra }, { status });
}

export async function keyFrom(req: Request): Promise<{ key: AgentKey } | { res: NextResponse }> {
  const a = await authenticate(req.headers.get('authorization'));
  if (!a.ok) return { res: fail(a.status, a.reason, a.fix) };
  return { key: a.key };
}

export async function ownerFromSession(): Promise<{ owner: string } | { res: NextResponse }> {
  const s = await getSession();
  if (!s) return { res: fail(401, 'Not signed in.', 'Connect and sign in again.') };
  return { owner: s.address };
}

/** Map thrown errors to the shared shape. */
export function handle(e: unknown) {
  if (e instanceof ScopeError) return fail(403, e.message, `Create a key with ${e.scope} on the Agents screen.`);
  if (e instanceof InputError) return fail(400, e.message, e.fix);
  if (e instanceof IssuerNotConfigured) return fail(503, e.message, e.fix);
  const msg = (e as Error)?.message ?? 'Unexpected error.';
  return fail(400, msg.slice(0, 300), 'Check the request and try again.');
}

export async function body<T>(req: Request): Promise<Partial<T>> {
  return (await req.json().catch(() => ({}))) as Partial<T>;
}
