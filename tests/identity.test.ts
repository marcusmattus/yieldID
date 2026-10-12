import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bytesToBase58 } from '../lib/base58';
import { verifySolanaSignature } from '../lib/server/ed25519';
import { buildSiwsMessage, parseSiwsMessage, SIWS_STATEMENT } from '../lib/siws';
import { chunkTxt, parseRecord, recordBody, recordText, validateHandle, zoneLine } from '../lib/yid';

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url');
  return { address: bytesToBase58(new Uint8Array(raw)), privateKey };
}

describe('SIWS', () => {
  const fields = {
    domain: 'app.yieldid.example',
    address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    statement: SIWS_STATEMENT,
    uri: 'https://app.yieldid.example/sign',
    version: '1' as const,
    chainId: 'mainnet' as const,
    nonce: 'abc123',
    issuedAt: '2026-10-11T19:00:00.000Z',
    expirationTime: '2026-10-11T19:10:00.000Z',
  };

  it('round-trips the message', () => {
    expect(parseSiwsMessage(buildSiwsMessage(fields))).toEqual(fields);
  });

  it('states it is not a transaction', () => {
    expect(buildSiwsMessage(fields)).toContain('It is not a transaction');
  });

  it('verifies a real ed25519 signature and rejects a tampered message', () => {
    const kp = keypair();
    const msg = new TextEncoder().encode(buildSiwsMessage({ ...fields, address: kp.address }));
    const sig = new Uint8Array(sign(null, Buffer.from(msg), kp.privateKey));
    expect(verifySolanaSignature(kp.address, msg, sig)).toBe(true);
    const tampered = new TextEncoder().encode(buildSiwsMessage({ ...fields, address: kp.address, nonce: 'other' }));
    expect(verifySolanaSignature(kp.address, tampered, sig)).toBe(false);
    expect(verifySolanaSignature(keypair().address, msg, sig)).toBe(false);
  });
});

describe('YieldID record', () => {
  it('validates handles', () => {
    expect(validateHandle('marcus')).toBeNull();
    expect(validateHandle('ab')).not.toBeNull();
    expect(validateHandle('-abc')).not.toBeNull();
    expect(validateHandle('Abc')).not.toBeNull();
    expect(validateHandle('a--b')).not.toBeNull();
  });

  it('signs the body and parses it back', () => {
    const kp = keypair();
    const body = recordBody({ sol: kp.address, evm: '0x1111111111111111111111111111111111111111' });
    const sig = bytesToBase58(new Uint8Array(sign(null, Buffer.from(body), kp.privateKey)));
    const parsed = parseRecord(recordText(body, sig))!;
    expect(parsed.sol).toBe(kp.address);
    expect(parsed.evm).toBe('0x1111111111111111111111111111111111111111');
    expect(verifySolanaSignature(parsed.sol, new TextEncoder().encode(parsed.body), new Uint8Array(Buffer.from(bs58(parsed.sig))))).toBe(true);
  });

  it('splits TXT strings at 255 characters', () => {
    const long = 'x'.repeat(300);
    expect(chunkTxt(long).map((c) => c.length)).toEqual([255, 45]);
    expect(zoneLine('marcus', 'yieldid.example', long)).toMatch(/^_yid\.marcus\.yieldid\.example\. {2}300 {2}IN {2}TXT {2}"x+" "x+"$/);
  });
});

import { base58ToBytes } from '../lib/base58';
function bs58(s: string) {
  return base58ToBytes(s);
}
