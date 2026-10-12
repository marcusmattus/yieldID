import { resolveTxt } from 'node:dns/promises';
import { NextResponse, type NextRequest } from 'next/server';
import { base58ToBytes } from '@/lib/base58';
import { verifySolanaSignature } from '@/lib/server/ed25519';
import { linkMessage, parseRecord, recordName, validateHandle } from '@/lib/yid';

/**
 * Resolve a YieldID by reading its DNS TXT record and checking the signature
 * against the Solana key it names. Anyone can do this check without us.
 */
export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get('handle') ?? '';
  const domain = process.env.NEXT_PUBLIC_YID_DOMAIN;
  if (!domain) return NextResponse.json({ status: 'not_configured', fix: 'Set NEXT_PUBLIC_YID_DOMAIN.' }, { status: 500 });
  const invalid = validateHandle(handle);
  if (invalid) return NextResponse.json({ status: 'invalid_handle', detail: invalid }, { status: 400 });

  const name = recordName(handle, domain);
  let records: string[][];
  try {
    records = await resolveTxt(name);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return NextResponse.json({ status: 'not_found', name, checkedAt: new Date().toISOString() });
    }
    return NextResponse.json({ status: 'dns_error', name, detail: code ?? 'DNS lookup failed', fix: 'Retry in a minute.' }, { status: 502 });
  }

  for (const chunks of records) {
    const parsed = parseRecord(chunks.join(''));
    if (!parsed) continue;
    let ok = false;
    try {
      ok = verifySolanaSignature(parsed.sol, new TextEncoder().encode(parsed.body), base58ToBytes(parsed.sig));
    } catch {
      ok = false;
    }
    return NextResponse.json({
      status: ok ? 'verified' : 'bad_signature',
      name,
      addresses: {
        sol: parsed.sol,
        evm: parsed.evm ?? null,
        hl: parsed.hl ?? null,
        // Each linked wallet's own signature over the link message naming the primary.
        alt: (parsed.alt ?? []).map((a) => {
          let proven = false;
          try {
            proven = verifySolanaSignature(a.address, new TextEncoder().encode(linkMessage(parsed.sol, a.address, a.issuedAt)), base58ToBytes(a.sig));
          } catch {
            proven = false;
          }
          return { address: a.address, proven };
        }),
      },
      checkedAt: new Date().toISOString(),
    });
  }
  return NextResponse.json({ status: 'no_yid_record', name, checkedAt: new Date().toISOString() });
}
