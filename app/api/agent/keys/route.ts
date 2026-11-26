import { NextResponse, type NextRequest } from 'next/server';
import { body, fail, handle, ownerFromSession } from '@/lib/agent/http';
import { createKey, getKillSwitch, listKeys, revokeKey, type NewKeyInput } from '@/lib/agent/keys';
import { SCOPES } from '@/lib/agent/scopes';

/** Owner only (session cookie): list, create and revoke agent keys. */
export async function GET() {
  const o = await ownerFromSession();
  if ('res' in o) return o.res;
  return NextResponse.json({ ok: true, keys: await listKeys(o.owner), killSwitch: await getKillSwitch(o.owner), scopes: SCOPES });
}

export async function POST(req: NextRequest) {
  const o = await ownerFromSession();
  if ('res' in o) return o.res;
  try {
    const { key, secret } = await createKey(o.owner, await body<NewKeyInput>(req));
    return NextResponse.json({ ok: true, key, secret, note: 'Copy the secret now. It is not stored and cannot be shown again.' });
  } catch (e) {
    return handle(e);
  }
}

export async function DELETE(req: NextRequest) {
  const o = await ownerFromSession();
  if ('res' in o) return o.res;
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!(await revokeKey(o.owner, id))) return fail(404, 'No live key with that id.', 'Refresh the list.');
  return NextResponse.json({ ok: true });
}
