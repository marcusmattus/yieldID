import { getBase58Decoder, getBase58Encoder } from '@solana/kit';

/** base58 string -> bytes */
export function base58ToBytes(s: string): Uint8Array {
  return new Uint8Array(getBase58Encoder().encode(s));
}

/** bytes -> base58 string */
export function bytesToBase58(b: Uint8Array): string {
  return getBase58Decoder().decode(b);
}

export function shortAddress(a: string): string {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}
