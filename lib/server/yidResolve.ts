import 'server-only';
import { resolveTxt } from 'node:dns/promises';
import { base58ToBytes } from '@/lib/base58';
import { verifySolanaSignature } from '@/lib/server/ed25519';
import { linkMessage, parseRecord, recordName, validateHandle } from '@/lib/yid';

export type YidResolution =
  | { status: 'not_configured'; fix: string }
  | { status: 'invalid_handle'; detail: string }
  | { status: 'not_found' | 'no_yid_record'; name: string; checkedAt: string }
  | { status: 'dns_error'; name: string; detail: string; fix: string }
  | {
      status: 'verified' | 'bad_signature';
      name: string;
      addresses: { sol: string; evm: string | null; hl: string | null; alt: Array<{ address: string; proven: boolean }> };
      checkedAt: string;
    };

type Lookup = (name: string) => Promise<string[][]>;

function verifies(address: string, message: string, sig: string): boolean {
  try {
    return verifySolanaSignature(address, new TextEncoder().encode(message), base58ToBytes(sig));
  } catch {
    return false;
  }
}

/**
 * Resolve a YieldID by reading its DNS TXT record and checking the signature
 * against the Solana key it names. Anyone can do this check without us.
 */
export async function resolveYid(handle: string, domain = process.env.NEXT_PUBLIC_YID_DOMAIN, lookup: Lookup = resolveTxt): Promise<YidResolution> {
  if (!domain) return { status: 'not_configured', fix: 'Set NEXT_PUBLIC_YID_DOMAIN.' };
  const invalid = validateHandle(handle);
  if (invalid) return { status: 'invalid_handle', detail: invalid };

  const name = recordName(handle, domain);
  const checkedAt = new Date().toISOString();
  let records: string[][];
  try {
    records = await lookup(name);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') return { status: 'not_found', name, checkedAt };
    return { status: 'dns_error', name, detail: code ?? 'DNS lookup failed', fix: 'Retry in a minute.' };
  }

  for (const chunks of records) {
    const parsed = parseRecord(chunks.join(''));
    if (!parsed) continue;
    return {
      status: verifies(parsed.sol, parsed.body, parsed.sig) ? 'verified' : 'bad_signature',
      name,
      addresses: {
        sol: parsed.sol,
        evm: parsed.evm ?? null,
        hl: parsed.hl ?? null,
        // Each linked wallet's own signature over the link message naming the primary.
        alt: (parsed.alt ?? []).map((a) => ({ address: a.address, proven: verifies(a.address, linkMessage(parsed.sol, a.address, a.issuedAt), a.sig) })),
      },
      checkedAt,
    };
  }
  return { status: 'no_yid_record', name, checkedAt };
}

export function resolutionHttpStatus(r: YidResolution): number {
  return r.status === 'not_configured' ? 500 : r.status === 'invalid_handle' ? 400 : r.status === 'dns_error' ? 502 : 200;
}
