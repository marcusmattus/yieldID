/**
 * YieldID: a readable name for a set of wallets, published as a DNS TXT record
 * and signed by the Solana key so anyone can check it without us.
 *
 *   _yid.<handle>.<domain>.  300  IN  TXT  "v=yid1; sol=...; evm=...; hl=...; sig=..."
 *
 * sig is the Solana key's ed25519 signature over the body (everything before
 * "; sig="), base58-encoded.
 */

export interface YidAddresses {
  sol: string;
  evm?: string;
  hl?: string;
}

export interface ParsedRecord extends YidAddresses {
  body: string;
  sig: string;
}

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;

export function validateHandle(handle: string): string | null {
  if (handle.length < 3 || handle.length > 32) return 'Use 3 to 32 characters.';
  if (!HANDLE_RE.test(handle)) return 'Use lowercase letters, numbers and hyphens, not at the start or end.';
  if (handle.includes('--')) return 'Do not use two hyphens in a row.';
  return null;
}

export function recordName(handle: string, domain: string): string {
  return `_yid.${handle}.${domain}`;
}

export function recordBody(a: YidAddresses): string {
  const parts = ['v=yid1', `sol=${a.sol}`];
  if (a.evm) parts.push(`evm=${a.evm}`);
  if (a.hl) parts.push(`hl=${a.hl}`);
  return parts.join('; ');
}

export function recordText(body: string, sigBase58: string): string {
  return `${body}; sig=${sigBase58}`;
}

/** DNS TXT strings are limited to 255 bytes each; long records are split and joined by resolvers. */
export function chunkTxt(text: string, size = 255): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

export function zoneLine(handle: string, domain: string, text: string): string {
  const chunks = chunkTxt(text)
    .map((c) => `"${c}"`)
    .join(' ');
  return `${recordName(handle, domain)}.  300  IN  TXT  ${chunks}`;
}

export function parseRecord(text: string): ParsedRecord | null {
  const idx = text.lastIndexOf('; sig=');
  if (idx < 0) return null;
  const body = text.slice(0, idx);
  const sig = text.slice(idx + '; sig='.length).trim();
  const fields = new Map<string, string>();
  for (const part of body.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) fields.set(k, rest.join('='));
  }
  if (fields.get('v') !== 'yid1') return null;
  const sol = fields.get('sol');
  if (!sol || !sig) return null;
  return { body, sig, sol, evm: fields.get('evm'), hl: fields.get('hl') };
}
