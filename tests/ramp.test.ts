import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RAMP_ASSET, rampSetup, rampStatusLabel, rampWidgetConfig } from '../lib/ramp';
import { isRampPurchaseEvent, RAMP_WEBHOOK_PUBLIC_KEY, rampCryptoAmount, stableStringify, verifyRampSignature } from '../lib/server/ramp';

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  return { pem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKey };
}
function sign(body: unknown, privateKey: ReturnType<typeof keypair>['privateKey']) {
  const s = createSign('sha256');
  s.update(stableStringify(body)!);
  return s.sign(privateKey, 'base64');
}

const event = {
  type: 'RELEASED',
  purchase: {
    updatedAt: '2026-11-26T06:00:00.000Z', id: 'p1', status: 'RELEASED', receiverAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    cryptoAmount: '25000000', asset: { symbol: 'USDC', chain: 'SOLANA', decimals: 6, address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    fiatCurrency: 'GBP', fiatValue: 20.5, finalTxHash: '5abc',
  },
};

describe('Ramp webhook signature', () => {
  it('serialises like fast-json-stable-stringify: sorted keys, no spaces, undefined dropped', () => {
    expect(stableStringify({ b: 1, a: [3, { d: undefined, c: 'x' }], e: null })).toBe('{"a":[3,{"c":"x"}],"b":1,"e":null}');
    expect(stableStringify({ n: 1.5, s: 'é"' })).toBe('{"n":1.5,"s":"é\\""}');
  });

  it('accepts a body signed by the key and rejects a tampered body or another key', () => {
    const ramp = keypair();
    const sig = sign(event, ramp.privateKey);
    // Key order in the received JSON does not matter; the message is canonical.
    const reordered = JSON.parse(JSON.stringify({ purchase: event.purchase, type: event.type }));
    expect(verifyRampSignature(reordered, sig, ramp.pem)).toBe(true);
    expect(verifyRampSignature({ ...event, purchase: { ...event.purchase, cryptoAmount: '99000000' } }, sig, ramp.pem)).toBe(false);
    expect(verifyRampSignature(event, sig, keypair().pem)).toBe(false);
    expect(verifyRampSignature(event, null, ramp.pem)).toBe(false);
    expect(verifyRampSignature(event, 'not-base64-der', ramp.pem)).toBe(false);
  });

  it('loads both published Ramp keys as secp256k1 keys', () => {
    for (const pem of Object.values(RAMP_WEBHOOK_PUBLIC_KEY)) {
      expect(verifyRampSignature(event, sign(event, keypair().privateKey), pem)).toBe(false);
    }
  });

  it('reads purchase events and amounts', () => {
    expect(isRampPurchaseEvent(event)).toBe(true);
    expect(isRampPurchaseEvent({ type: 'CREATED', mode: 'OFFRAMP', payload: {} })).toBe(false);
    expect(rampCryptoAmount(event.purchase)).toBe(25);
  });
});

describe('Ramp widget config', () => {
  it('uses the test environment without a key, and production with one', () => {
    expect(rampSetup({})).toEqual({ env: 'demo', hostApiKey: null, blocked: null });
    expect(rampSetup({ NEXT_PUBLIC_RAMP_HOST_API_KEY: 'k' })).toEqual({ env: 'production', hostApiKey: 'k', blocked: null });
    expect(rampSetup({ NEXT_PUBLIC_RAMP_ENV: 'production' }).blocked).toMatch(/HOST_API_KEY is empty/);
  });

  it('buys USDC on the chosen chain, to the given address, on-ramp only', () => {
    const c = rampWidgetConfig({ setup: rampSetup({ NEXT_PUBLIC_RAMP_HOST_API_KEY: 'k' }), chain: 'solana', userAddress: 'ADDR', hostAppName: 'YieldID', hostLogoUrl: 'https://x/l.png' });
    expect(c).toMatchObject({ url: 'https://app.ramp.network', hostApiKey: 'k', swapAsset: RAMP_ASSET.solana, userAddress: 'ADDR', defaultFlow: 'ONRAMP', enabledFlows: ['ONRAMP'] });
  });

  it('refuses Solana in the test environment, which has no Solana USDC', () => {
    expect(() => rampWidgetConfig({ setup: rampSetup({}), chain: 'solana', userAddress: 'A', hostAppName: 'Y', hostLogoUrl: 'https://x' })).toThrow(/does not deliver USDC on solana/);
    expect(rampWidgetConfig({ setup: rampSetup({}), chain: 'base', userAddress: '0xA', hostAppName: 'Y', hostLogoUrl: 'https://x' }).url).toBe('https://app.dev.ramp-network.org');
  });

  it('labels statuses in plain words', () => {
    expect(rampStatusLabel('RELEASED')).toBe('USDC sent to your wallet');
    expect(rampStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});
