import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import pools from './fixtures/llama-pools.json';
import { bytesToBase58 } from '../lib/base58';
import { liveVenuesFrom, moveCostBetween, MOVE_COST_MODEL, type LlamaPool } from '../lib/defi/pools';
import { parseLookup, planHoldings } from '../lib/optimise';
import { resolveYid } from '../lib/server/yidResolve';
import { recordBody, recordText } from '../lib/yid';

const NOW = Date.parse('2026-11-26T06:00:00Z');
const venues = liveVenuesFrom(pools as LlamaPool[], NOW);
const SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

describe('move cost between chains', () => {
  it('is cheapest on the same chain and adds a bridge across chains', () => {
    expect(moveCostBetween('Solana', 'Solana')).toBe(0.01);
    expect(moveCostBetween('Base', 'Solana')).toBe(0.05);
    expect(moveCostBetween('Ethereum', 'Ethereum')).toBe(0.05);
    expect(moveCostBetween('Solana', 'Ethereum')).toBe(0.15);
    expect(MOVE_COST_MODEL).toEqual({ Solana: 0.01, Base: 0.05, Arbitrum: 0.05, Ethereum: 0.15, Hyperliquid: 0.1 });
  });
});

describe('venue flags', () => {
  it('warns on high rates, lock-ups and real-world assets without changing rank', async () => {
    const { venueFlags } = await import('../lib/defi/pools');
    expect(venueFlags({ grossPct: 21, product: 'USDC · vault', sleeve: 'forge' })).toEqual(['high_rate']);
    expect(venueFlags({ grossPct: 15.5, product: 'USDC · 4-day lockup', sleeve: 'forge' })).toEqual(['high_rate', 'lockup']);
    expect(venueFlags({ grossPct: 5, product: 'USDC · T-bill fund', sleeve: 'rwa' })).toEqual(['rwa']);
    expect(venueFlags({ grossPct: 4, product: 'USDC deposit', sleeve: 'forge' })).toEqual([]);
  });
});

describe('planHoldings', () => {
  const base = { venues, horizonDays: 30, minTvlUsd: 5_000_000, minAmount: 1, now: NOW };

  it('ranks options for each idle balance by net from its own chain and estimates a year', () => {
    const { plans, totals } = planHoldings({ ...base, holdings: [{ chain: 'Solana', address: SOL, asset: 'USDC', amount: 10_000 }] });
    const [p] = plans;
    for (let i = 1; i < p.options.length; i++) expect(p.options[i - 1].netPct).toBeGreaterThanOrEqual(p.options[i].netPct);
    const top = p.options[0];
    expect(top.netPct).toBeCloseTo(top.grossPct - (top.moveCostPct * 365) / 30, 6);
    expect(top.annualUsd).toBeCloseTo((10_000 * top.netPct) / 100, 6);
    expect(p.bestSameChain?.chain).toBe('Solana');
    expect(totals.idleUsd).toBe(10_000);
    // The headline counts the best venue without a high-rate or lock-up flag.
    expect(p.bestPlain && p.bestPlain.flags.filter((f) => f !== 'rwa')).toEqual([]);
    expect(totals.potentialAnnualUsd).toBeCloseTo(p.bestPlain?.annualUsd ?? 0, 1);
  });

  it('charges a bridge for venues on another chain', () => {
    const { plans } = planHoldings({ ...base, holdings: [{ chain: 'Solana', address: SOL, asset: 'USDC', amount: 1000 }] });
    for (const o of plans[0].options) expect(o.moveCostPct).toBe(moveCostBetween('Solana', o.chain));
  });

  it('skips dust, small venues and stale reads, and has no option for an asset no venue takes', () => {
    expect(planHoldings({ ...base, holdings: [{ chain: 'Solana', address: SOL, asset: 'USDC', amount: 0.5 }] }).plans).toHaveLength(0);
    const big = planHoldings({ ...base, minTvlUsd: 100_000_000, holdings: [{ chain: 'Base', address: '0x1', asset: 'USDC', amount: 50 }] });
    expect(big.plans[0].options.every((o) => o.tvlUsd >= 100_000_000)).toBe(true);
    expect(planHoldings({ ...base, now: NOW + 3 * 3600_000, holdings: [{ chain: 'Solana', address: SOL, asset: 'USDC', amount: 50 }] }).plans[0].options).toHaveLength(0);
    expect(planHoldings({ ...base, holdings: [{ chain: 'Solana', address: SOL, asset: 'PYUSD', amount: 50 }] }).plans[0].options).toHaveLength(0);
  });
});

describe('parseLookup', () => {
  it('reads names, name@domain, Solana and EVM addresses', () => {
    expect(parseLookup('Marcus', 'yieldid.xyz')).toEqual({ kind: 'name', handle: 'marcus' });
    expect(parseLookup('marcus@yieldid.xyz', 'yieldid.xyz')).toEqual({ kind: 'name', handle: 'marcus' });
    expect(parseLookup('marcus@other.com', 'yieldid.xyz').kind).toBe('invalid');
    expect(parseLookup(SOL, 'yieldid.xyz')).toEqual({ kind: 'solana', address: SOL });
    expect(parseLookup('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', undefined).kind).toBe('evm');
    expect(parseLookup('  ', undefined).kind).toBe('invalid');
  });
});

describe('resolveYid', () => {
  it('verifies a signed record found in DNS and reports missing ones', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const sol = bytesToBase58(new Uint8Array(Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url')));
    const body = recordBody({ sol, evm: '0x1111111111111111111111111111111111111111' });
    const txt = recordText(body, bytesToBase58(new Uint8Array(sign(null, Buffer.from(body), privateKey))));
    const ok = await resolveYid('marcus', 'yieldid.example', async () => [[txt]]);
    expect(ok).toMatchObject({ status: 'verified', name: '_yid.marcus.yieldid.example', addresses: { sol, evm: '0x1111111111111111111111111111111111111111' } });
    const forged = await resolveYid('marcus', 'yieldid.example', async () => [[txt.replace(sol, SOL)]]);
    expect(forged.status).toBe('bad_signature');
    const none = await resolveYid('marcus', 'yieldid.example', async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); });
    expect(none.status).toBe('not_found');
    expect((await resolveYid('marcus', undefined)).status).toBe('not_configured');
  });
});
