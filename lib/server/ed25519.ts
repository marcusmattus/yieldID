import 'server-only';
import { createPublicKey, verify } from 'node:crypto';
import { base58ToBytes } from '../base58';

// DER prefix for an Ed25519 SubjectPublicKeyInfo with a 32-byte raw key.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Verify an ed25519 signature made by a Solana address (base58 public key). */
export function verifySolanaSignature(address: string, message: Uint8Array, signature: Uint8Array): boolean {
  let raw: Uint8Array;
  try {
    raw = base58ToBytes(address);
  } catch {
    return false;
  }
  if (raw.length !== 32 || signature.length !== 64) return false;
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(raw)]),
    format: 'der',
    type: 'spki',
  });
  return verify(null, Buffer.from(message), key, Buffer.from(signature));
}
