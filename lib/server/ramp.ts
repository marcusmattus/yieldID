import 'server-only';
import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';
import type { RampEnv } from '@/lib/ramp';

/**
 * Ramp signs every webhook body with ECDSA (secp256k1) over SHA-256. The
 * signed message is the JSON body with keys sorted and no whitespace
 * (fast-json-stable-stringify); the DER signature arrives base64-encoded in
 * the X-Body-Signature header. Public keys from docs.rampnetwork.com/webhooks.
 */
export const RAMP_WEBHOOK_PUBLIC_KEY: Record<RampEnv, string> = {
  production: `-----BEGIN PUBLIC KEY-----
MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAElvxpYOhgdAmI+7oL4mABRAfM5CwLkCbZ
m64ERVKAisSulWFC3oRZom/PeyE2iXPX1ekp9UD1r+51c9TiuIHU4w==
-----END PUBLIC KEY-----`,
  demo: `-----BEGIN PUBLIC KEY-----
MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEevN2PMEeIaaMkS4VIfXOqsLebj19kVeu
wWl0AnkIA6DJU0r3ixkXVhJTltycJtkDoEAYtPHfARyTofB5ZNw9xA==
-----END PUBLIC KEY-----`,
};

/** Same output as fast-json-stable-stringify for JSON values. */
export function stableStringify(value: unknown): string | undefined {
  if (value !== null && typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    value = (value as { toJSON: () => unknown }).toJSON();
  }
  if (value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v) ?? 'null').join(',')}]`;
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(obj).sort()) {
    const v = stableStringify(obj[key]);
    if (v !== undefined) parts.push(`${JSON.stringify(key)}:${v}`);
  }
  return `{${parts.join(',')}}`;
}

const keys = new Map<string, KeyObject>();
function keyFor(pem: string): KeyObject {
  let k = keys.get(pem);
  if (!k) {
    k = createPublicKey(pem);
    keys.set(pem, k);
  }
  return k;
}

export function verifyRampSignature(payload: unknown, signatureB64: string | null, pem: string): boolean {
  if (!signatureB64) return false;
  const message = stableStringify(payload);
  if (message === undefined) return false;
  try {
    const v = createVerify('sha256');
    v.update(message);
    return v.verify(keyFor(pem), signatureB64, 'base64');
  } catch {
    return false;
  }
}

export interface RampPurchaseEvent {
  type: 'CREATED' | 'RELEASED' | 'RETURNED';
  purchase: {
    id: string;
    status: string;
    receiverAddress: string;
    cryptoAmount: string;
    asset: { symbol: string; chain?: string; decimals: number; address: string | null };
    fiatCurrency: string;
    fiatValue: number | string;
    finalTxHash?: string;
    updatedAt?: string;
  };
}

export function isRampPurchaseEvent(x: unknown): x is RampPurchaseEvent {
  if (!x || typeof x !== 'object') return false;
  const e = x as Partial<RampPurchaseEvent>;
  return (e.type === 'CREATED' || e.type === 'RELEASED' || e.type === 'RETURNED') && !!e.purchase && typeof e.purchase.id === 'string';
}

/** Crypto amount from Ramp's base units to a decimal number. */
export function rampCryptoAmount(p: RampPurchaseEvent['purchase']): number {
  return Number(p.cryptoAmount) / 10 ** p.asset.decimals;
}
