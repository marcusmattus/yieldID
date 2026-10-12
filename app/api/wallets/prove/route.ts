import { NextResponse, type NextRequest } from 'next/server';
import { base58ToBytes } from '@/lib/base58';
import { verifySolanaSignature } from '@/lib/server/ed25519';
import { getSession } from '@/lib/server/session';
import { linkMessage } from '@/lib/yid';

/**
 * Verify that an added Solana wallet signed the link message naming the
 * signed-in primary wallet. Only then is it listed as proven.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, reason: 'Not signed in.', fix: 'Connect and sign in again.' }, { status: 401 });

  const { added, issuedAt, signature } = (await req.json().catch(() => ({}))) as { added?: string; issuedAt?: string; signature?: string };
  if (!added || !issuedAt || !signature) return NextResponse.json({ ok: false, reason: 'Missing fields.', fix: 'Sign the link message again.' }, { status: 400 });
  if (added === session.address) return NextResponse.json({ ok: false, reason: 'That is already your primary wallet.', fix: 'Switch to the other wallet in your extension.' }, { status: 400 });
  if (Math.abs(Date.now() - Date.parse(issuedAt)) > 10 * 60_000) return NextResponse.json({ ok: false, reason: 'Link message expired.', fix: 'Sign a fresh one.' }, { status: 400 });

  let sig: Uint8Array;
  try {
    sig = base58ToBytes(signature);
  } catch {
    return NextResponse.json({ ok: false, reason: 'Signature is not base58.', fix: 'Sign again.' }, { status: 400 });
  }
  const msg = new TextEncoder().encode(linkMessage(session.address, added, issuedAt));
  if (!verifySolanaSignature(added, msg, sig)) {
    return NextResponse.json({ ok: false, reason: 'Signature does not match the added wallet.', fix: 'Sign with the wallet you are adding.' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, added });
}
