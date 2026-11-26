import { generateKeyPairSigner, getBase64Encoder, getTransactionDecoder, type Blockhash } from '@solana/kit';
import { describe, expect, it } from 'vitest';
import { USDC_MINT, USDC_MINT_DEVNET } from '../lib/chain';
import { fetchWithPayment, selectRequirement } from '../lib/x402/client';
import { requirementsFor, requirePayment, type PaywallConfig } from '../lib/x402/server';
import { buildSolanaPayment } from '../lib/x402/solana';
import { decodeHeader, encodeHeader, type PaymentPayload, type PaymentRequirements } from '../lib/x402/types';

const FEE_PAYER = '2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4';
const PAY_TO = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const blockhash = { blockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N' as Blockhash, lastValidBlockHeight: 100n };

const req = (over: Partial<PaymentRequirements> = {}): PaymentRequirements => ({
  scheme: 'exact',
  network: 'solana-devnet',
  maxAmountRequired: '10000',
  resource: 'https://api.example/data',
  description: 'data',
  mimeType: 'application/json',
  payTo: PAY_TO,
  maxTimeoutSeconds: 60,
  asset: USDC_MINT_DEVNET,
  extra: { feePayer: FEE_PAYER },
  ...over,
});

describe('selectRequirement', () => {
  it('picks the cheapest usable Solana USDC option and explains the rest', () => {
    const sel = selectRequirement(
      [
        req({ network: 'base', asset: '0xabc' }),
        req({ maxAmountRequired: '50000' }),
        req({ maxAmountRequired: '20000' }),
        req({ asset: 'NotUsdc111111111111111111111111111111111111' }),
        req({ maxAmountRequired: '5000000' }),
      ],
      { networks: ['solana-devnet'], maxMicro: 100_000n },
    );
    expect(sel.ok && sel.amountMicro).toBe(20_000n);
  });

  it('refuses when everything is over the ceiling', () => {
    const sel = selectRequirement([req({ maxAmountRequired: '2000000' })], { networks: ['solana-devnet'], maxMicro: 1_000_000n });
    expect(sel.ok).toBe(false);
    expect(!sel.ok && sel.reasons[0]).toMatch(/ceiling/);
  });

  it('does not treat mainnet USDC as devnet USDC', () => {
    const sel = selectRequirement([req({ asset: USDC_MINT })], { networks: ['solana-devnet'], maxMicro: 1_000_000n });
    expect(sel.ok).toBe(false);
  });
});

describe('buildSolanaPayment', () => {
  it('builds a transaction signed by the payer, with the facilitator as fee payer left unsigned', async () => {
    const signer = await generateKeyPairSigner();
    const p = await buildSolanaPayment({ requirement: req(), signer, latestBlockhash: blockhash });
    expect(p).toMatchObject({ x402Version: 1, scheme: 'exact', network: 'solana-devnet' });
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(p.payload.transaction));
    const signers = Object.keys(tx.signatures);
    expect(signers[0]).toBe(FEE_PAYER);
    expect(tx.signatures[FEE_PAYER as keyof typeof tx.signatures]).toBeNull();
    expect(tx.signatures[signer.address as keyof typeof tx.signatures]).not.toBeNull();
  });

  it('refuses a requirement without a fee payer', async () => {
    const signer = await generateKeyPairSigner();
    await expect(buildSolanaPayment({ requirement: req({ extra: {} }), signer, latestBlockhash: blockhash })).rejects.toThrow(/feePayer/);
  });
});

describe('x402 round trip', () => {
  const cfg = (fetchImpl: typeof fetch): PaywallConfig => ({ facilitatorUrl: 'https://facilitator.test', network: 'solana-devnet', payTo: PAY_TO, feePayer: FEE_PAYER, fetchImpl });
  const price = { amountMicro: 10_000n, resource: 'https://yieldid.test/api/x402/rates', description: 'rates' };

  it('answers 402 without payment, then serves after verify and settle', async () => {
    const calls: string[] = [];
    const facilitator = (async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      const body = JSON.parse(String(init?.body));
      expect(body.paymentRequirements.payTo).toBe(PAY_TO);
      if (String(url).endsWith('/verify')) return Response.json({ isValid: true, payer: 'payer1' });
      return Response.json({ success: true, transaction: 'sig123', network: 'solana-devnet', payer: 'payer1' });
    }) as typeof fetch;

    const first = await requirePayment(new Request(price.resource), cfg(facilitator), price);
    expect(first.paid).toBe(false);
    const body = await (first as { response: Response }).response.json();
    expect(body.accepts[0]).toMatchObject({ maxAmountRequired: '10000', asset: USDC_MINT_DEVNET, extra: { feePayer: FEE_PAYER } });

    // An agent pays through fetchWithPayment against a server built from requirePayment.
    const signer = await generateKeyPairSigner();
    const server = (async (url: string, init?: RequestInit) => {
      const r = await requirePayment(new Request(String(url), init), cfg(facilitator), price);
      if (!r.paid) return r.response;
      const res = Response.json({ ok: true });
      res.headers.set('X-PAYMENT-RESPONSE', encodeHeader(r.settlement));
      return res;
    }) as typeof fetch;

    let authorised: bigint | null = null;
    let settledWith: string | null = null;
    const out = await fetchWithPayment(price.resource, {}, {
      signer,
      rpcUrl: 'unused',
      networks: ['solana-devnet'],
      maxMicro: 50_000n,
      fetchImpl: server,
      getLatestBlockhash: async () => blockhash,
      authorize: async (_r, amount) => {
        authorised = amount;
        return { ok: true, reservationId: 'res1' };
      },
      onSettled: async (id, s) => {
        settledWith = `${id}:${s?.transaction}`;
      },
    });
    expect(out.response.status).toBe(200);
    expect(authorised).toBe(10_000n);
    expect(settledWith).toBe('res1:sig123');
    expect(calls.map((c) => c.split('/').pop())).toEqual(['verify', 'settle']);
  });

  it('does not sign when YieldID refuses the spend', async () => {
    const signer = await generateKeyPairSigner();
    const server = (async () => Response.json({ x402Version: 1, accepts: [requirementsFor(cfg(fetch), price)] }, { status: 402 })) as typeof fetch;
    await expect(
      fetchWithPayment(price.resource, {}, {
        signer,
        rpcUrl: 'unused',
        networks: ['solana-devnet'],
        maxMicro: 50_000n,
        fetchImpl: server,
        getLatestBlockhash: async () => {
          throw new Error('should not get here');
        },
        authorize: async () => ({ ok: false, reason: 'Daily cap failed', fix: 'Wait' }),
      }),
    ).rejects.toThrow(/Daily cap/);
  });

  it('answers 402 again when the facilitator says the payment is invalid', async () => {
    const facilitator = (async () => Response.json({ isValid: false, invalidReason: 'insufficient_funds' })) as typeof fetch;
    const payload: PaymentPayload = { x402Version: 1, scheme: 'exact', network: 'solana-devnet', payload: { transaction: 'AAAA' } };
    const r = await requirePayment(new Request(price.resource, { headers: { 'X-PAYMENT': encodeHeader(payload) } }), cfg(facilitator), price);
    expect(r.paid).toBe(false);
    const body = await (r as { response: Response }).response.json();
    expect(body.error).toBe('insufficient_funds');
    expect(decodeHeader<PaymentPayload>(encodeHeader(payload))).toEqual(payload);
  });
});
