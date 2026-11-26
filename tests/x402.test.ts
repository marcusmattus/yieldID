import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import { readX402Config, usdToUnits, X402_NETWORKS } from '../lib/x402/networks';
import { UsdcExactScheme, withX402 } from '../lib/server/x402';

const SOL_PAYTO = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const EVM_PAYTO = '0x1111111111111111111111111111111111111111';
const ENV = { X402_NETWORKS: 'solana-devnet,base-sepolia', X402_PAY_TO_SOLANA: SOL_PAYTO, X402_PAY_TO_EVM: EVM_PAYTO, X402_PRICE_USD: '0.001' };

// A stand-in facilitator: advertises the two testnets, accepts any payload
// marked valid, and records what it was asked to verify and settle.
const calls: Array<{ path: string; body: any }> = [];
let server: Server;
let url = '';
beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      calls.push({ path: req.url!, body });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/supported') {
        res.end(JSON.stringify({
          kinds: [
            { x402Version: 2, scheme: 'exact', network: X402_NETWORKS['solana-devnet'].network, extra: { feePayer: 'FeePayer1111111111111111111111111111111111', transactionVersions: [0] } },
            { x402Version: 2, scheme: 'exact', network: X402_NETWORKS['base-sepolia'].network },
          ],
          extensions: ['bazaar'],
          signers: {},
        }));
      } else if (req.url === '/verify') {
        const ok = body.paymentPayload.payload.valid === true;
        res.end(JSON.stringify(ok ? { isValid: true, payer: 'payer1' } : { isValid: false, invalidReason: 'invalid_payload', payer: 'payer1' }));
      } else if (req.url === '/settle' && body.paymentPayload.payload.badSettle) {
        res.end(JSON.stringify({ unexpected: true }));
      } else if (req.url === '/settle') {
        res.end(JSON.stringify({ success: true, transaction: 'tx123', network: body.paymentRequirements.network, payer: 'payer1' }));
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

function paid(handler: (req: NextRequest) => Promise<NextResponse>) {
  return withX402(handler, { description: 'test feed', mimeType: 'application/json' }, { config: readX402Config(ENV), facilitatorUrl: url });
}

describe('x402 config', () => {
  it('needs a valid payTo for each network and a positive price', () => {
    expect(readX402Config({}).problem).toMatch(/Solana devnet needs X402_PAY_TO_SOLANA; Base Sepolia needs X402_PAY_TO_EVM/);
    expect(readX402Config({ X402_NETWORKS: 'solana', X402_PAY_TO_SOLANA: 'not-an-address' }).problem).toMatch(/Solana needs/);
    expect(readX402Config({ ...ENV, X402_PRICE_USD: '-1' }).problem).toMatch(/not a positive dollar amount/);
    expect(readX402Config(ENV).accepts.map((a) => a.net.label)).toEqual(['Solana devnet', 'Base Sepolia']);
    expect(usdToUnits('0.001')).toBe('1000');
    expect(usdToUnits('12.5')).toBe('12500000');
  });

  it('prices in USDC per network, with the EIP-712 domain on EVM', async () => {
    const svm = await new UsdcExactScheme('svm').parsePrice('$0.001', X402_NETWORKS['solana-devnet'].network);
    expect(svm).toEqual({ amount: '1000', asset: X402_NETWORKS['solana-devnet'].asset, extra: {} });
    const evm = await new UsdcExactScheme('evm').parsePrice('$0.25', X402_NETWORKS.base.network);
    expect(evm).toEqual({ amount: '250000', asset: X402_NETWORKS.base.asset, extra: { name: 'USD Coin', version: '2' } });
  });
});

describe('x402 paid route', () => {
  let ran = 0;
  let handler: (req: NextRequest) => Promise<NextResponse>;
  // Built after the stub facilitator is listening, so it points at the stub.
  beforeAll(() => {
    handler = paid(async () => {
      ran++;
      return NextResponse.json({ ranked: [1, 2, 3] });
    });
  });

  it('answers 402 with USDC requirements on both networks and does not run the handler', async () => {
    const res = await handler(new NextRequest('http://localhost/api/x402/yields?horizon=30'));
    expect(res.status).toBe(402);
    expect(ran).toBe(0);
    const required = decodePaymentRequiredHeader(res.headers.get('payment-required')!);
    expect(required.x402Version).toBe(2);
    const [sol, evm] = required.accepts;
    expect(sol).toMatchObject({ scheme: 'exact', network: X402_NETWORKS['solana-devnet'].network, amount: '1000', asset: X402_NETWORKS['solana-devnet'].asset, payTo: SOL_PAYTO });
    expect(sol.extra).toMatchObject({ feePayer: 'FeePayer1111111111111111111111111111111111' });
    expect(evm).toMatchObject({ network: 'eip155:84532', amount: '1000', payTo: EVM_PAYTO, extra: { name: 'USDC', version: '2' } });
  });

  it('runs the handler and settles once the facilitator verifies the payment', async () => {
    const first = await handler(new NextRequest('http://localhost/api/x402/yields'));
    const accepted = decodePaymentRequiredHeader(first.headers.get('payment-required')!).accepts[0];
    const sig = encodePaymentSignatureHeader({ x402Version: 2, accepted, payload: { valid: true } });
    calls.length = 0;
    const res = await handler(new NextRequest('http://localhost/api/x402/yields', { headers: { 'payment-signature': sig } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ranked: [1, 2, 3] });
    expect(ran).toBe(1);
    expect(calls.map((c) => c.path)).toEqual(['/verify', '/settle']);
    expect(decodePaymentResponseHeader(res.headers.get('payment-response')!)).toMatchObject({ success: true, transaction: 'tx123' });
  });

  it('refuses an invalid payment without running the handler or settling', async () => {
    const first = await handler(new NextRequest('http://localhost/api/x402/yields'));
    const accepted = decodePaymentRequiredHeader(first.headers.get('payment-required')!).accepts[0];
    calls.length = 0;
    const before = ran;
    const res = await handler(new NextRequest('http://localhost/api/x402/yields', { headers: { 'payment-signature': encodePaymentSignatureHeader({ x402Version: 2, accepted, payload: { valid: false } }) } }));
    expect(res.status).toBe(402);
    expect(ran).toBe(before);
    expect(calls.map((c) => c.path)).toEqual(['/verify']);
  });

  it('reports an unreachable facilitator as 502', async () => {
    const h = withX402(async () => NextResponse.json({ secret: 1 }), { description: 'x' }, { config: readX402Config(ENV), facilitatorUrl: `${url}/nowhere` });
    const res = await h(new NextRequest('http://localhost/api/x402/yields'));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('secret');
  });

  it('withholds the paid content when settlement fails', async () => {
    const first = await handler(new NextRequest('http://localhost/api/x402/yields'));
    const accepted = decodePaymentRequiredHeader(first.headers.get('payment-required')!).accepts[0];
    const res = await handler(new NextRequest('http://localhost/api/x402/yields', { headers: { 'payment-signature': encodePaymentSignatureHeader({ x402Version: 2, accepted, payload: { valid: true, badSettle: true } }) } }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('ranked');
  });

  it('does not settle when the handler fails, so the agent is not charged', async () => {
    const failing = paid(async () => NextResponse.json({ error: 'down' }, { status: 503 }));
    const first = await failing(new NextRequest('http://localhost/api/x402/yields'));
    const accepted = decodePaymentRequiredHeader(first.headers.get('payment-required')!).accepts[0];
    calls.length = 0;
    const res = await failing(new NextRequest('http://localhost/api/x402/yields', { headers: { 'payment-signature': encodePaymentSignatureHeader({ x402Version: 2, accepted, payload: { valid: true } }) } }));
    expect(res.status).toBe(503);
    expect(calls.some((c) => c.path === '/settle')).toBe(false);
  });

  it('says plainly when the deployment has no payTo configured', async () => {
    const off = withX402(async () => NextResponse.json({}), { description: 'x' }, { config: readX402Config({}) });
    const res = await off(new NextRequest('http://localhost/api/x402/yields'));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not configured/);
  });
});
